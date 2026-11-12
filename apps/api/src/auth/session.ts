import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { withActor, type Pool } from "@magistrad/db";
import type { Actor } from "@magistrad/policy";
import type { Config } from "../config";
import { unauthenticated } from "../http/errors";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export const cookieName = (cfg: Config) =>
  // "__Host-" pins the cookie to this exact host over HTTPS: no Domain, Path=/.
  cfg.SESSION_COOKIE_NAME ?? (cfg.NODE_ENV === "production" ? "__Host-mag_session" : "mag_session");

export function setSessionCookie(reply: FastifyReply, cfg: Config, token: string): void {
  reply.setCookie(cookieName(cfg), token, {
    httpOnly: true,
    secure: cfg.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: cfg.SESSION_ABSOLUTE_HOURS * 3600,
  });
}

export function clearSessionCookie(reply: FastifyReply, cfg: Config): void {
  reply.clearCookie(cookieName(cfg), { path: "/" });
}

export interface CurrentUser {
  sessionId: string;
  actor: Actor;
  user: { id: string; email: string; fullName: string; platformRole: Actor["platformRole"] };
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: CurrentUser;
  }
}

/** Resolves the cookie to a user and loads their memberships (through row-level security). */
export async function loadCurrentUser(req: FastifyRequest, pool: Pool, cfg: Config): Promise<CurrentUser | null> {
  const token = req.cookies[cookieName(cfg)];
  if (!token || token.length > 128) return null;
  const session = await withActor(pool, null, async (tx) => {
    const { rows } = await tx.query<{ session_id: string; user_id: string }>(
      "SELECT * FROM app.auth_resolve_session($1, make_interval(mins => $2))",
      [sha256(token), cfg.SESSION_IDLE_MINUTES],
    );
    return rows[0] ?? null;
  });
  if (!session) return null;

  return withActor(pool, session.user_id, async (tx) => {
    const u = await tx.query<{ id: string; email: string; full_name: string; platform_role: Actor["platformRole"] }>(
      "SELECT id, email, full_name, platform_role FROM app.users WHERE id = $1 AND status = 'active'",
      [session.user_id],
    );
    const row = u.rows[0];
    if (!row) return null;
    const m = await tx.query<{ organisation_id: string; org_role: "org_admin" | "member" }>(
      `SELECT m.organisation_id, m.org_role FROM app.memberships m
       JOIN app.organisations o ON o.id = m.organisation_id
       WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'`,
      [row.id],
    );
    return {
      sessionId: session.session_id,
      actor: {
        userId: row.id,
        platformRole: row.platform_role,
        memberships: m.rows.map((r) => ({ organisationId: r.organisation_id, role: r.org_role })),
      },
      user: { id: row.id, email: row.email, fullName: row.full_name, platformRole: row.platform_role },
    };
  });
}

export function requireUser(req: FastifyRequest): CurrentUser {
  if (!req.currentUser) throw unauthenticated();
  return req.currentUser;
}
