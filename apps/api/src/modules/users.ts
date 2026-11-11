import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendAudit, withActor, type Pool } from "@magistrad/db";
import { authorize } from "../http/authorize";
import { notFound } from "../http/errors";

const uuid = z.string().uuid();

export async function userRoutes(app: FastifyInstance, { pool }: { pool: Pool }) {
  for (const [path, type, status] of [["suspend", "user.suspend", "suspended"], ["reinstate", "user.reinstate", "active"]] as const) {
    app.post(`/users/:id/${path}`, async (req) => {
      const targetUserId = uuid.parse((req.params as { id: string }).id);
      const { user } = await authorize(req, pool, { type, targetUserId });
      await withActor(pool, user.id, async (tx) => {
        const r = await tx.query("UPDATE app.users SET status = $2 WHERE id = $1 AND status <> 'invited'", [targetUserId, status]);
        if (!r.rowCount) throw notFound("No active or suspended account with that id.");
        // Suspension takes effect immediately: every session ends now.
        if (status === "suspended") await tx.query("SELECT app.auth_revoke_user_sessions($1)", [targetUserId]);
        await appendAudit(tx, { action: type, outcome: "success", resourceType: "user", resourceId: targetUserId, ipAddress: req.ip });
      });
      return { ok: true };
    });
  }

  app.get("/users", async (req) => {
    const { user } = await authorize(req, pool, { type: "user.list" });
    const { rows } = await withActor(pool, user.id, (tx) => tx.query(
      "SELECT id, email, full_name, platform_role, status, created_at FROM app.users ORDER BY created_at DESC LIMIT 500"));
    return { users: rows.map((u) => ({ id: u.id, email: u.email, fullName: u.full_name, platformRole: u.platform_role, status: u.status, createdAt: u.created_at })) };
  });
}
