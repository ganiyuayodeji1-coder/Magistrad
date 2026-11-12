/**
 * Starts the whole system for browser tests: a throwaway database, the development
 * identity provider, the API and the production build of the web app.
 * Everything is fictional and torn down on exit.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, loadRootEnv } from "@magistrad/db";
import { asOwner, createTestDatabase, dropTestDatabase } from "@magistrad/db/testing";
import { startDevIdp } from "@magistrad/dev-idp";
import { buildApp } from "../../api/src/app";
import { createOidcClient } from "../../api/src/auth/oidc";
import { loadConfig } from "../../api/src/config";

export const PORTS = { web: 3100, api: 4100, idp: 4500 };
const WEB = `http://localhost:${PORTS.web}`;

loadRootEnv();
const db = await createTestDatabase("e2e");
await asOwner(db, (c) => c.query(
  "INSERT INTO app.users (email, full_name, platform_role) VALUES ('admin@magistrad.test', 'Morgan Platform', 'super_admin')"));

const issuer = `http://localhost:${PORTS.idp}`;
const idp = await startDevIdp({
  port: PORTS.idp, issuer, clientId: "magistrad-web", clientSecret: "e2e-secret",
  redirectUris: [`${WEB}/api/auth/callback`], postLogoutRedirectUris: [`${WEB}/signed-out`],
});
const cfg = loadConfig({
  NODE_ENV: "test", DATABASE_URL: db.appUrl, API_PUBLIC_URL: `${WEB}/api`, WEB_ORIGIN: WEB, API_PORT: String(PORTS.api),
  OIDC_ISSUER: issuer, OIDC_CLIENT_ID: "magistrad-web", OIDC_CLIENT_SECRET: "e2e-secret", SESSION_COOKIE_NAME: "mag_session",
  TRUST_PROXY_HOPS: "1",
});
const pool = createPool(db.appUrl);
const api = await buildApp({ cfg, pool, oidc: await createOidcClient(cfg), logger: false });
await api.listen({ port: PORTS.api, host: "127.0.0.1" });

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = spawn("pnpm", ["exec", "next", "start", "-p", String(PORTS.web)], {
  cwd: webDir, stdio: "inherit",
  env: { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${PORTS.api}`, SESSION_COOKIE_NAME: "mag_session", WEB_ORIGIN: WEB },
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  web.kill("SIGTERM");
  await api.close();
  await pool.end();
  await idp.close();
  await dropTestDatabase(db);
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
web.on("exit", () => void stop());
