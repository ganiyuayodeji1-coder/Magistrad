import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendAudit, withActor, type Pool } from "@magistrad/db";
import { requireUser } from "../auth/session";
import { authorize } from "../http/authorize";
import { conflict, notFound } from "../http/errors";

const uuid = z.string().uuid();
const createOrg = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(["law_firm", "chambers", "court", "tribunal"]),
  regulatorId: z.string().trim().max(64).optional().nullable(),
}).strict();
const renameOrg = z.object({ name: z.string().trim().min(2).max(200) }).strict();
const addMember = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(2).max(200),
  role: z.enum(["org_admin", "member"]),
}).strict();
const changeMember = z.object({
  role: z.enum(["org_admin", "member"]).optional(),
  status: z.enum(["active", "removed"]).optional(),
}).strict().refine((v) => v.role || v.status, "Nothing to change");

export async function organisationRoutes(app: FastifyInstance, { pool }: { pool: Pool }) {
  app.get("/organisations", async (req) => {
    const { user } = requireUser(req);
    // Row-level security decides what is visible; no policy shortcut needed for a list.
    const { rows } = await withActor(pool, user.id, (tx) =>
      tx.query("SELECT id, name, type, regulator_id, status, created_at FROM app.organisations ORDER BY name"));
    return { organisations: rows.map((o) => ({ id: o.id, name: o.name, type: o.type, regulatorId: o.regulator_id, status: o.status, createdAt: o.created_at })) };
  });

  app.post("/organisations", async (req, reply) => {
    const { user } = await authorize(req, pool, { type: "organisation.create" });
    const body = createOrg.parse(req.body);
    const id = randomUUID();
    await withActor(pool, user.id, async (tx) => {
      await tx.query("INSERT INTO app.organisations (id, name, type, regulator_id, created_by) VALUES ($1, $2, $3, $4, $5)",
        [id, body.name, body.type, body.regulatorId ?? null, user.id]);
      await appendAudit(tx, { action: "organisation.create", outcome: "success", resourceType: "organisation", resourceId: id, organisationId: id, ipAddress: req.ip, metadata: { name: body.name, type: body.type } });
    });
    return reply.status(201).send({ id });
  });

  app.get("/organisations/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { user } = await authorize(req, pool, { type: "organisation.view", organisationId: id });
    const { rows } = await withActor(pool, user.id, (tx) =>
      tx.query("SELECT id, name, type, regulator_id, status, created_at FROM app.organisations WHERE id = $1", [id]));
    const o = rows[0];
    if (!o) throw notFound();
    return { id: o.id, name: o.name, type: o.type, regulatorId: o.regulator_id, status: o.status, createdAt: o.created_at };
  });

  app.patch("/organisations/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { user } = await authorize(req, pool, { type: "organisation.update", organisationId: id });
    const body = renameOrg.parse(req.body);
    await withActor(pool, user.id, async (tx) => {
      const r = await tx.query("UPDATE app.organisations SET name = $2 WHERE id = $1", [id, body.name]);
      if (!r.rowCount) throw notFound();
      await appendAudit(tx, { action: "organisation.update", outcome: "success", resourceType: "organisation", resourceId: id, organisationId: id, ipAddress: req.ip, metadata: { name: body.name } });
    });
    return { ok: true };
  });

  app.get("/organisations/:id/members", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { user } = await authorize(req, pool, { type: "member.list", organisationId: id });
    const { rows } = await withActor(pool, user.id, (tx) => tx.query(
      `SELECT u.id, u.email, u.full_name, u.status AS user_status, m.org_role, m.status, m.created_at
       FROM app.memberships m JOIN app.users u ON u.id = m.user_id
       WHERE m.organisation_id = $1 ORDER BY m.status, u.full_name`, [id]));
    return { members: rows.map((r) => ({ userId: r.id, email: r.email, fullName: r.full_name, accountStatus: r.user_status, role: r.org_role, status: r.status, since: r.created_at })) };
  });

  app.post("/organisations/:id/members", async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = addMember.parse(req.body);
    const { user } = await authorize(req, pool, { type: "member.add", organisationId: id, role: body.role });
    // Does this person already have an account (e.g. in another firm or chambers)?
    const existingId = await withActor(pool, user.id, async (tx) =>
      (await tx.query<{ id: string | null }>("SELECT app.admin_find_user_by_email($1) AS id", [body.email])).rows[0]?.id ?? null);
    // Now that the target is known, check again (this is what stops adding yourself).
    if (existingId) await authorize(req, pool, { type: "member.add", organisationId: id, role: body.role, targetUserId: existingId });

    const targetId = existingId ?? randomUUID();
    await withActor(pool, user.id, async (tx) => {
      if (!existingId) {
        // New people start as "invited" and become active at their first verified sign-in.
        await tx.query("INSERT INTO app.users (id, email, full_name) VALUES ($1, $2, $3)", [targetId, body.email, body.fullName]);
      } else {
        const dup = await tx.query<{ status: string }>(
          "SELECT status FROM app.memberships WHERE user_id = $1 AND organisation_id = $2", [targetId, id]);
        if (dup.rows[0]?.status === "active") throw conflict("That person is already a member.");
        if (dup.rowCount) {
          await tx.query("UPDATE app.memberships SET status = 'active', org_role = $3 WHERE user_id = $1 AND organisation_id = $2", [targetId, id, body.role]);
          await appendAudit(tx, { action: "member.add", outcome: "success", resourceType: "user", resourceId: targetId, organisationId: id, ipAddress: req.ip, metadata: { role: body.role, rejoined: true } });
          return;
        }
      }
      await tx.query("INSERT INTO app.memberships (user_id, organisation_id, org_role, created_by) VALUES ($1, $2, $3, $4)", [targetId, id, body.role, user.id]);
      await appendAudit(tx, { action: "member.add", outcome: "success", resourceType: "user", resourceId: targetId, organisationId: id, ipAddress: req.ip, metadata: { role: body.role, invited: !existingId } });
    });
    return reply.status(201).send({ userId: targetId, invited: !existingId });
  });

  app.patch("/organisations/:id/members/:userId", async (req) => {
    const params = req.params as { id: string; userId: string };
    const id = uuid.parse(params.id);
    const targetUserId = uuid.parse(params.userId);
    const body = changeMember.parse(req.body);
    const action = body.status === "removed" ? "member.remove" as const : "member.changeRole" as const;
    const { user } = await authorize(req, pool, { type: action, organisationId: id, targetUserId });
    await withActor(pool, user.id, async (tx) => {
      const sets: string[] = [];
      const values: unknown[] = [targetUserId, id];
      if (body.role) { values.push(body.role); sets.push(`org_role = $${values.length}`); }
      if (body.status) { values.push(body.status); sets.push(`status = $${values.length}`); }
      const r = await tx.query(`UPDATE app.memberships SET ${sets.join(", ")} WHERE user_id = $1 AND organisation_id = $2`, values);
      if (!r.rowCount) throw notFound("That person is not a member of this organisation.");
      await appendAudit(tx, { action, outcome: "success", resourceType: "user", resourceId: targetUserId, organisationId: id, ipAddress: req.ip, metadata: body });
    });
    return { ok: true };
  });
}
