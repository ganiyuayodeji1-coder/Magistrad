/**
 * PREVIEW ONLY. A sign-in shortcut for the fictional development accounts, so the app can be
 * viewed where the identity provider's redirects cannot work. Registered only when
 * MAGISTRAD_PREVIEW=1, which the configuration refuses in production. Every use is audited.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendAudit, withActor, type Pool } from "@magistrad/db";
import { DEV_ACCOUNTS } from "@magistrad/dev-idp";
import type { Config } from "../config";
import { notFound } from "../http/errors";
import { newToken, setSessionCookie, sha256 } from "../auth/session";

const PREVIEW_ISSUER = "magistrad-preview";
const fictional = DEV_ACCOUNTS.filter((a) => a.email.endsWith(".test"));

export async function previewRoutes(app: FastifyInstance, { pool, cfg }: { pool: Pool; cfg: Config }) {
  app.get("/dev/preview-accounts", async () => ({
    accounts: fictional.map((a) => ({ email: a.email, name: a.name })),
  }));

  app.post("/dev/preview-session", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).strict().parse(req.body);
    const account = fictional.find((a) => a.email === email.toLowerCase());
    if (!account) throw notFound("No such test account.");
    const login = await withActor(pool, null, async (tx) =>
      (await tx.query<{ user_id: string; status: string }>(
        "SELECT * FROM app.auth_resolve_login($1, $2, $3, true)", [PREVIEW_ISSUER, account.sub, account.email])).rows[0]);
    if (!login || login.status !== "active") throw notFound("That test person has no active account in this preview.");
    const token = newToken();
    await withActor(pool, null, async (tx) => {
      await tx.query("SELECT app.auth_create_session($1, $2, make_interval(hours => $3), $4, $5)",
        [login.user_id, sha256(token), cfg.SESSION_ABSOLUTE_HOURS, req.ip, req.headers["user-agent"] ?? null]);
      await appendAudit(tx, { action: "auth.login", outcome: "success", ipAddress: req.ip, actorId: login.user_id, metadata: { method: "preview" } });
    });
    setSessionCookie(reply, cfg, token);
    return { ok: true };
  });
}
