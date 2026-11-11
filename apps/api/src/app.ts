import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import type { Pool } from "@magistrad/db";
import type { Config } from "./config";
import { authRoutes } from "./auth/routes";
import type { OidcClient } from "./auth/oidc";
import { loadCurrentUser } from "./auth/session";
import { registerSecurity } from "./http/security";
import { auditRoutes } from "./modules/audit";
import { organisationRoutes } from "./modules/organisations";
import { userRoutes } from "./modules/users";

export interface AppDeps {
  cfg: Config;
  pool: Pool;
  oidc: OidcClient;
  logger?: boolean;
}

export async function buildApp({ cfg, pool, oidc, logger = true }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger ? { level: cfg.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.cookie", "req.headers.authorization"] } : false,
    // Trust X-Forwarded-For only for the configured number of proxy hops (default: none).
    trustProxy: (_address: string, hop: number) => hop < cfg.TRUST_PROXY_HOPS,
    bodyLimit: 64 * 1024,
  });
  await app.register(cookie);
  await registerSecurity(app, cfg);

  app.addHook("preHandler", async (req) => {
    req.currentUser = (await loadCurrentUser(req, pool, cfg)) ?? undefined;
  });

  app.get("/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok" };
  });

  await app.register(authRoutes, { pool, cfg, oidc });
  await app.register(organisationRoutes, { pool });
  await app.register(userRoutes, { pool });
  await app.register(auditRoutes, { pool });
  return app;
}
