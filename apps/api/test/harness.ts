import { createServer } from "node:net";
import type { FastifyInstance } from "fastify";
import { createPool, withActor, type Pool } from "@magistrad/db";
import { createTestDatabase, dropTestDatabase, type TestDatabase } from "@magistrad/db/testing";
import { startDevIdp } from "@magistrad/dev-idp";
import { buildApp } from "../src/app";
import { createOidcClient } from "../src/auth/oidc";
import { newToken, sha256 } from "../src/auth/session";
import { loadConfig, type Config } from "../src/config";

export const WEB_ORIGIN = "http://web.test";
export const API_PUBLIC_URL = "http://api.test";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

export interface Harness {
  app: FastifyInstance;
  db: TestDatabase;
  pool: Pool;
  cfg: Config;
  issuer: string;
  close: () => Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const db = await createTestDatabase("api");
  const port = await freePort();
  const issuer = `http://127.0.0.1:${port}`;
  const idp = await startDevIdp({
    port, issuer, clientId: "magistrad-web", clientSecret: "test-secret",
    redirectUris: [`${API_PUBLIC_URL}/auth/callback`], postLogoutRedirectUris: [`${WEB_ORIGIN}/signed-out`],
  });
  const cfg = loadConfig({
    NODE_ENV: "test", DATABASE_URL: db.appUrl, API_PUBLIC_URL, WEB_ORIGIN,
    OIDC_ISSUER: issuer, OIDC_CLIENT_ID: "magistrad-web", OIDC_CLIENT_SECRET: "test-secret",
  });
  const pool = createPool(db.appUrl);
  const app = await buildApp({ cfg, pool, oidc: await createOidcClient(cfg), logger: false });
  return {
    app, db, pool, cfg, issuer,
    close: async () => {
      await app.close();
      await pool.end();
      await idp.close();
      await dropTestDatabase(db);
    },
  };
}

/** Creates a session directly (for authorisation tests that don't need the sign-in dance). */
export async function sessionFor(h: Harness, userId: string): Promise<string> {
  const token = newToken();
  await withActor(h.pool, null, (tx) =>
    tx.query("SELECT app.auth_create_session($1, $2, interval '1 hour', '127.0.0.1', 'test')", [userId, sha256(token)]));
  return token;
}

/** Headers a real browser on the web origin would send. */
export const asBrowser = (token?: string) => ({
  origin: WEB_ORIGIN,
  ...(token ? { cookie: `mag_session=${token}` } : {}),
});

// ── Minimal cookie-aware client for walking through the identity provider ──
class Jar {
  private cookies = new Map<string, string>();
  store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const idx = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, idx), pair!.slice(idx + 1));
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

/**
 * Performs a real sign-in through the development identity provider, exactly as a
 * browser would. Returns where the API redirected to and the session cookie, if any.
 */
export async function signInThroughIdp(h: Harness, email: string, opts: { code?: string | null; returnTo?: string } = {}) {
  const { DEV_ACCOUNTS, totp } = await import("@magistrad/dev-idp");
  const account = DEV_ACCOUNTS.find((a) => a.email === email);
  if (!account) throw new Error(`no dev account ${email}`);
  const code = opts.code === undefined ? (account.totpSecret ? totp(account.totpSecret) : "") : (opts.code ?? "");

  const start = await h.app.inject({ method: "GET", url: `/auth/login${opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : ""}` });
  let location = start.headers.location as string;
  const jar = new Jar();
  // Follow the identity provider's redirects until it hands back to our callback.
  for (let i = 0; i < 10 && !location.startsWith(API_PUBLIC_URL); i++) {
    const res = await fetch(location, { redirect: "manual", headers: { cookie: jar.header() } });
    jar.store(res);
    if (res.status === 200 && (await res.clone().text()).includes("Development sign-in")) {
      const uid = new URL(location).pathname.split("/").pop();
      const post = await fetch(`${h.issuer}/interaction/${uid}/login`, {
        method: "POST", redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
        body: new URLSearchParams({ email, password: account.password, code }),
      });
      jar.store(post);
      location = new URL(post.headers.get("location")!, h.issuer).href;
      continue;
    }
    location = new URL(res.headers.get("location")!, h.issuer).href;
  }
  const callback = await h.app.inject({ method: "GET", url: location.slice(API_PUBLIC_URL.length) });
  const setCookie = ([] as string[]).concat(callback.headers["set-cookie"] ?? []);
  const token = setCookie.find((c) => c.startsWith("mag_session="))?.split(";")[0]?.split("=")[1];
  return { redirect: callback.headers.location as string, token, callbackUrl: location };
}
