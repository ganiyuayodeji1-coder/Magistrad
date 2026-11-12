import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  API_PUBLIC_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REQUIRED_AMR: z.string().min(1).default("mfa"),
  /** Hops of reverse proxy to trust for the client IP. 0 = trust none (never read X-Forwarded-For). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().positive().default(12),
  SESSION_IDLE_MINUTES: z.coerce.number().positive().default(30),
  /** Must match the web app. Defaults: "__Host-mag_session" in production, "mag_session" otherwise. */
  SESSION_COOKIE_NAME: z.string().regex(/^[\w-]+$/).optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production") {
    for (const key of ["API_PUBLIC_URL", "WEB_ORIGIN", "OIDC_ISSUER"] as const) {
      if (!cfg[key].startsWith("https://")) throw new Error(`${key} must use https in production`);
    }
  }
  return cfg;
}
