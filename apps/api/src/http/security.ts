import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { isPermissionError } from "@magistrad/db";
import type { Config } from "../config";
import { HttpError } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function registerSecurity(app: FastifyInstance, cfg: Config): Promise<void> {
  // The API returns JSON only, so the strictest policy applies.
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: cfg.NODE_ENV === "production" ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  // CSRF defence for cookie-authenticated requests: state changes must come from our
  // own web origin, as JSON. Browsers cannot forge the Origin header.
  app.addHook("onRequest", async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    if (req.headers.origin !== cfg.WEB_ORIGIN) throw new HttpError(403, "bad_origin", "Request origin not allowed.");
    const ct = req.headers["content-type"] ?? "";
    if (req.method !== "DELETE" && !ct.startsWith("application/json") && req.headers["content-length"] !== "0") {
      throw new HttpError(415, "unsupported_media_type", "Requests must be JSON.");
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "invalid", message: "Some details are missing or invalid.", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    if (isPermissionError(err)) {
      // The database refused (row-level security or a guard). Treat exactly like a policy denial.
      req.log.warn({ err: { message: (err as Error).message } }, "database denied request");
      return reply.status(403).send({ error: "forbidden", message: "You do not have permission to do that." });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: "request_error", message: (err as Error).message });
    req.log.error(err);
    return reply.status(500).send({ error: "internal", message: "Something went wrong. It has been logged." });
  });
}
