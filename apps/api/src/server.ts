import { createPool, loadRootEnv } from "@magistrad/db";
import { buildApp } from "./app";
import { createOidcClient } from "./auth/oidc";
import { loadConfig } from "./config";

loadRootEnv();
const cfg = loadConfig();
const pool = createPool(cfg.DATABASE_URL);
const app = await buildApp({ cfg, pool, oidc: await createOidcClient(cfg) });
await app.listen({ port: cfg.API_PORT, host: "127.0.0.1" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
