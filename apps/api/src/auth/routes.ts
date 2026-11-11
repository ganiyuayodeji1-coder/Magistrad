import type { FastifyInstance } from "fastify";
import { appendAudit, withActor, type Pool } from "@magistrad/db";
import type { Config } from "../config";
import { oidc, type OidcClient } from "./oidc";
import { clearSessionCookie, cookieName, newToken, requireUser, setSessionCookie, sha256 } from "./session";

/** Only same-site relative paths, so the sign-in flow cannot be used as an open redirect. */
export const safeReturnTo = (v: unknown) =>
  typeof v === "string" && /^\/(?!\/)[\w\-./?=&%]*$/.test(v) && v.length < 200 ? v : "/";

export async function authRoutes(app: FastifyInstance, deps: { pool: Pool; cfg: Config; oidc: OidcClient }) {
  const { pool, cfg } = deps;
  const failTo = (code: string) => `${cfg.WEB_ORIGIN}/sign-in?error=${code}`;

  app.get("/auth/login", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const returnTo = safeReturnTo((req.query as Record<string, unknown>).returnTo);
    await withActor(pool, null, (tx) =>
      tx.query("SELECT app.auth_begin_flow($1, $2, $3, $4)", [sha256(state), verifier, nonce, returnTo]));
    const url = oidc.buildAuthorizationUrl(deps.oidc.config, {
      redirect_uri: deps.oidc.redirectUri,
      scope: "openid email profile",
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state,
      nonce,
      prompt: "login", // always re-authenticate (password + MFA) at the identity provider
    });
    return reply.redirect(url.href, 302);
  });

  app.get("/auth/callback", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const ip = req.ip;
    if (query.error || !query.state || !query.code) return reply.redirect(failTo("cancelled"), 302);

    const flow = await withActor(pool, null, async (tx) =>
      (await tx.query<{ code_verifier: string; nonce: string; return_to: string }>(
        "SELECT * FROM app.auth_take_flow($1)", [sha256(query.state!)])).rows[0]);
    if (!flow) return reply.redirect(failTo("expired"), 302);

    let claims: oidc.IDToken | undefined;
    try {
      const currentUrl = new URL(deps.oidc.redirectUri);
      for (const [k, v] of Object.entries(query)) if (v !== undefined) currentUrl.searchParams.set(k, v);
      const tokens = await oidc.authorizationCodeGrant(deps.oidc.config, currentUrl, {
        pkceCodeVerifier: flow.code_verifier,
        expectedState: query.state,
        expectedNonce: flow.nonce,
        idTokenExpected: true,
      });
      claims = tokens.claims();
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, "token exchange failed");
      await withActor(pool, null, (tx) => appendAudit(tx, { action: "auth.login", outcome: "failure", ipAddress: ip, metadata: { reason: "token_exchange" } }));
      return reply.redirect(failTo("failed"), 302);
    }
    if (!claims) return reply.redirect(failTo("failed"), 302);

    const amr = Array.isArray(claims.amr) ? claims.amr.map(String) : [];
    const email = typeof claims.email === "string" ? claims.email : "";
    const emailVerified = claims.email_verified === true;

    const login = await withActor(pool, null, async (tx) =>
      (await tx.query<{ user_id: string; status: string }>(
        "SELECT * FROM app.auth_resolve_login($1, $2, $3, $4)", [claims.iss, claims.sub, email, emailVerified])).rows[0]);

    if (!login || login.status !== "active") {
      await withActor(pool, null, (tx) => appendAudit(tx, {
        action: "auth.login", outcome: "denied", ipAddress: ip, actorId: login?.user_id ?? null,
        metadata: { reason: login ? "suspended" : "no_account" },
      }));
      return reply.redirect(failTo(login ? "suspended" : "no_account"), 302);
    }
    if (!amr.includes(cfg.OIDC_REQUIRED_AMR)) {
      await withActor(pool, null, (tx) => appendAudit(tx, {
        action: "auth.login", outcome: "denied", ipAddress: ip, actorId: login.user_id, metadata: { reason: "mfa_missing", amr },
      }));
      return reply.redirect(failTo("mfa_required"), 302);
    }

    const token = newToken();
    await withActor(pool, null, async (tx) => {
      await tx.query("SELECT app.auth_create_session($1, $2, make_interval(hours => $3), $4, $5)",
        [login.user_id, sha256(token), cfg.SESSION_ABSOLUTE_HOURS, ip, req.headers["user-agent"] ?? null]);
      await appendAudit(tx, { action: "auth.login", outcome: "success", ipAddress: ip, actorId: login.user_id, metadata: { amr } });
    });
    setSessionCookie(reply, cfg, token);
    return reply.redirect(`${cfg.WEB_ORIGIN}${flow.return_to}`, 302);
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[cookieName(cfg)];
    if (token) {
      await withActor(pool, null, async (tx) => {
        const { rows } = await tx.query<{ auth_revoke_session: string | null }>("SELECT app.auth_revoke_session($1)", [sha256(token)]);
        const userId = rows[0]?.auth_revoke_session;
        if (userId) await appendAudit(tx, { action: "auth.logout", outcome: "success", ipAddress: req.ip, actorId: userId });
      });
    }
    clearSessionCookie(reply, cfg);
    return reply.send({ ok: true });
  });

  app.get("/me", async (req) => {
    const { user, actor } = requireUser(req);
    const orgs = await withActor(pool, user.id, async (tx) =>
      (await tx.query<{ id: string; name: string; type: string; org_role: string }>(
        `SELECT o.id, o.name, o.type, m.org_role FROM app.memberships m
         JOIN app.organisations o ON o.id = m.organisation_id
         WHERE m.user_id = $1 AND m.status = 'active' ORDER BY o.name`, [user.id])).rows);
    return {
      user,
      organisations: orgs.map((o) => ({ id: o.id, name: o.name, type: o.type, role: o.org_role })),
      isSuperAdmin: actor.platformRole === "super_admin",
    };
  });
}
