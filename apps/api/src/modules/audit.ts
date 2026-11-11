import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withActor, type Pool } from "@magistrad/db";
import { authorize } from "../http/authorize";

const query = z.object({
  organisationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function auditRoutes(app: FastifyInstance, { pool }: { pool: Pool }) {
  app.get("/audit", async (req) => {
    const q = query.parse(req.query);
    const { user } = q.organisationId
      ? await authorize(req, pool, { type: "audit.viewOrganisation", organisationId: q.organisationId })
      : await authorize(req, pool, { type: "audit.viewPlatform" });
    const { rows } = await withActor(pool, user.id, (tx) => tx.query(
      `SELECT e.seq, e.occurred_at, e.action, e.outcome, e.resource_type, e.resource_id, e.organisation_id,
              e.ip_address, e.metadata, e.hash, a.full_name AS actor_name, a.email AS actor_email
       FROM app.audit_events e LEFT JOIN app.users a ON a.id = e.actor_id
       WHERE ($1::uuid IS NULL OR e.organisation_id = $1)
       ORDER BY e.seq DESC LIMIT $2`, [q.organisationId ?? null, q.limit]));
    return {
      events: rows.map((r) => ({
        seq: Number(r.seq), occurredAt: r.occurred_at, action: r.action, outcome: r.outcome,
        resourceType: r.resource_type, resourceId: r.resource_id, organisationId: r.organisation_id,
        ipAddress: r.ip_address, metadata: r.metadata, hash: r.hash,
        actor: r.actor_email ? { name: r.actor_name, email: r.actor_email } : null,
      })),
    };
  });

  app.get("/audit/verify", async (req) => {
    const { user } = await authorize(req, pool, { type: "audit.verify" });
    const { rows } = await withActor(pool, user.id, (tx) =>
      tx.query<{ checked: string; first_broken_seq: string | null }>("SELECT * FROM app.audit_verify()"));
    const r = rows[0]!;
    return { intact: r.first_broken_seq === null, checked: Number(r.checked), firstBrokenSeq: r.first_broken_seq ? Number(r.first_broken_seq) : null };
  });
}
