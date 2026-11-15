import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit, withActor, type Pool, type Tx } from "@magistrad/db";
import { can, canInCase, type CaseAction, type CaseFacts, type CaseRole, type SideKind } from "@magistrad/policy";
import { requireUser } from "../auth/session";
import { forbidden, notFound, conflict, badRequest } from "../http/errors";

const uuid = z.string().uuid();
const side = z.enum(["claimant", "defendant"]);
const partyType = z.enum(["individual", "organisation"]);
const category = z.enum(["commercial", "chancery", "technology_construction", "kings_bench", "county_court", "other"]);

const openCase = z.object({
  organisationId: z.string().uuid(),
  title: z.string().trim().min(3).max(300),
  courtName: z.string().trim().min(2).max(200),
  category,
  claimNumber: z.string().trim().max(40).optional().nullable(),
  actingFor: side.nullable(),
  claimant: z.object({ name: z.string().trim().min(2).max(300), type: partyType }).strict(),
  defendant: z.object({ name: z.string().trim().min(2).max(300), type: partyType }).strict(),
}).strict();

const updateCase = z.object({
  claimNumber: z.string().trim().min(3).max(40).nullable().optional(),
  status: z.enum(["pre_action", "issued", "stayed", "settled", "closed"]).optional(),
  courtOrganisationId: z.string().uuid().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, "Nothing to change");

const addParticipant = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(2).max(200),
  role: z.enum(["judge", "court_staff", "party", "solicitor", "barrister", "expert", "external"]),
  side: side.nullable(),
}).strict();

const addParty = z.object({ side, name: z.string().trim().min(2).max(300), type: partyType }).strict();

export const ROLE_WORDS: Record<CaseRole, string> = {
  judge: "judge", court_staff: "court staff", party: "party", solicitor: "solicitor",
  barrister: "barrister", expert: "expert", external: "external participant",
};
/** Counsel, experts and helpers are private to their side; joining is recorded privately. */
const PRIVATE_TO_SIDE: readonly CaseRole[] = ["barrister", "expert", "external"];

interface CaseRow { id: string; reference: string; claim_number: string | null; title: string; court_name: string; court_organisation_id: string | null; category: string; status: string; created_at: string }

async function caseFacts(tx: Tx, caseId: string): Promise<CaseFacts & { exists: boolean; caseRow?: CaseRow; sideIds: Record<SideKind, string> }> {
  const c = await tx.query<CaseRow>("SELECT * FROM app.cases WHERE id = $1", [caseId]);
  const meRow = await tx.query<{ role: CaseRole | null; side_id: string | null; court_admin: boolean }>(
    "SELECT app.my_case_role($1) AS role, app.my_case_side($1) AS side_id, app.is_case_court_admin($1) AS court_admin", [caseId]);
  const sides = await tx.query<{ id: string; kind: SideKind }>("SELECT id, kind FROM app.sides WHERE case_id = $1", [caseId]);
  const sideIds = Object.fromEntries(sides.rows.map((r) => [r.kind, r.id])) as Record<SideKind, string>;
  const m = meRow.rows[0]!;
  const mySide = sides.rows.find((r) => r.id === m.side_id)?.kind ?? null;
  return {
    exists: c.rowCount === 1,
    caseRow: c.rows[0],
    me: m.role ? { role: m.role, side: mySide } : null,
    isCourtAdmin: m.court_admin,
    sideIds,
  };
}

/** Loads the actor's standing in the case and applies the case policy. Denials are audited. */
async function authorizeCase(req: FastifyRequest, pool: Pool, caseId: string, build: (f: Awaited<ReturnType<typeof caseFacts>>, tx: Tx) => Promise<CaseAction> | CaseAction) {
  const { user } = requireUser(req);
  return withActor(pool, user.id, async (tx) => {
    const facts = await caseFacts(tx, caseId);
    // Not visible at all: answer exactly as for a case that doesn't exist, but record the attempt.
    if (!facts.exists) {
      await appendAudit(tx, { action: "case.access", outcome: "denied", resourceType: "case", resourceId: caseId, ipAddress: req.ip, metadata: { reason: "not visible to this user" } });
      return { denied: "not_found", facts, user } as const;
    }
    const action = await build(facts, tx);
    const decision = canInCase(user.id, facts, action);
    if (!decision.allowed) {
      await appendAudit(tx, { action: `case.${action.type}`, outcome: "denied", resourceType: "case", resourceId: caseId, ipAddress: req.ip, metadata: { reason: decision.reason } });
      return { denied: decision.reason, facts, user } as const;
    }
    return { denied: null, facts, user } as const;
  }).then((r) => {
    if (r.denied === "not_found") throw notFound("Case not found.");
    if (r.denied) throw forbidden(`You do not have permission to do that: ${r.denied}.`);
    return r;
  });
}

export async function caseRoutes(app: FastifyInstance, { pool }: { pool: Pool }) {
  app.get("/courts", async (req) => {
    const { user } = requireUser(req);
    const { rows } = await withActor(pool, user.id, (tx) => tx.query("SELECT * FROM app.list_courts()"));
    return { courts: rows };
  });

  app.get("/cases", async (req) => {
    const { user } = requireUser(req);
    const { rows } = await withActor(pool, user.id, (tx) => tx.query(
      `SELECT c.id, c.reference, c.title, c.status, c.court_name, c.claim_number,
              app.my_case_role(c.id) AS role, s.kind AS side
       FROM app.cases c LEFT JOIN app.sides s ON s.id = app.my_case_side(c.id)
       ORDER BY c.created_at DESC`));
    return { cases: rows.map((r) => ({ id: r.id, reference: r.reference, title: r.title, status: r.status, courtName: r.court_name, claimNumber: r.claim_number, role: r.role ?? "registry", side: r.side })) };
  });

  app.post("/cases", async (req, reply) => {
    const current = requireUser(req);
    const body = openCase.parse(req.body);
    const decision = can(current.actor, { type: "case.open", organisationId: body.organisationId });
    if (!decision.allowed) throw forbidden(`You do not have permission to do that: ${decision.reason}.`);
    const id = await withActor(pool, current.user.id, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "SELECT app.create_case($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS id",
        [body.organisationId, body.title, body.courtName, body.category, body.claimNumber ?? null, body.actingFor,
          body.claimant.name, body.claimant.type, body.defendant.name, body.defendant.type]);
      const caseId = r.rows[0]!.id;
      await appendAudit(tx, { action: "case.open", outcome: "success", resourceType: "case", resourceId: caseId, organisationId: body.organisationId, ipAddress: req.ip });
      return caseId;
    });
    return reply.status(201).send({ id });
  });

  app.get("/cases/:id", async (req) => {
    const caseId = uuid.parse((req.params as { id: string }).id);
    const { facts, user } = await authorizeCase(req, pool, caseId, () => ({ type: "case.view" }));
    return withActor(pool, user.id, async (tx) => {
      const c = facts.caseRow!;
      const parties = await tx.query<{ id: string; side_id: string; name: string; party_type: string }>(
        "SELECT id, side_id, name, party_type FROM app.parties WHERE case_id = $1 ORDER BY created_at", [caseId]);
      const spaces = await tx.query<{ id: string; kind: string; side_id: string | null }>(
        "SELECT id, kind, side_id FROM app.spaces WHERE case_id = $1", [caseId]);
      const court = c.court_organisation_id
        ? (await tx.query<{ name: string }>("SELECT name FROM app.list_courts() WHERE id = $1", [c.court_organisation_id])).rows[0]?.name ?? null
        : null;
      const sideOf = (id: string | null) => (Object.entries(facts.sideIds).find(([, v]) => v === id)?.[0] ?? null) as SideKind | null;
      const ownSide = facts.me?.side ?? null;
      const yes = (a: CaseAction) => canInCase(user.id, facts, a).allowed;
      return {
        id: c.id, reference: c.reference, title: c.title, claimNumber: c.claim_number, courtName: c.court_name,
        court: c.court_organisation_id ? { id: c.court_organisation_id, name: court } : null,
        category: c.category, status: c.status, openedAt: c.created_at,
        me: facts.me ? { role: facts.me.role, side: facts.me.side } : { role: "registry", side: null },
        parties: parties.rows.map((p) => ({ id: p.id, side: sideOf(p.side_id), name: p.name, type: p.party_type })),
        spaces: spaces.rows.map((s) => ({ id: s.id, kind: s.kind, side: sideOf(s.side_id) })),
        permissions: {
          update: yes({ type: "case.update" }),
          linkCourt: yes({ type: "case.linkCourt", alreadyLinked: c.court_organisation_id !== null }),
          manageOwnSide: ownSide !== null && yes({ type: "party.add", side: ownSide }),
          manageCourtRoles: c.court_organisation_id !== null && (facts.me?.role === "court_staff" || facts.isCourtAdmin),
        },
      };
    });
  });

  app.patch("/cases/:id", async (req) => {
    const caseId = uuid.parse((req.params as { id: string }).id);
    const body = updateCase.parse(req.body);
    const { facts, user } = await authorizeCase(req, pool, caseId, (f) =>
      body.courtOrganisationId ? { type: "case.linkCourt", alreadyLinked: f.caseRow!.court_organisation_id !== null } : { type: "case.update" });
    if (body.courtOrganisationId && (body.claimNumber !== undefined || body.status) && !canInCase(user.id, facts, { type: "case.update" }).allowed) throw forbidden();
    await withActor(pool, user.id, async (tx) => {
      const sets: string[] = [];
      const vals: unknown[] = [caseId];
      if (body.claimNumber !== undefined) { vals.push(body.claimNumber); sets.push(`claim_number = $${vals.length}`); }
      if (body.status) { vals.push(body.status); sets.push(`status = $${vals.length}`); }
      if (body.courtOrganisationId) { vals.push(body.courtOrganisationId); sets.push(`court_organisation_id = $${vals.length}`); }
      await tx.query(`UPDATE app.cases SET ${sets.join(", ")} WHERE id = $1`, vals);
      const changes = [
        body.claimNumber !== undefined && `claim number ${body.claimNumber ? `set to ${body.claimNumber}` : "cleared"}`,
        body.status && `status changed to ${body.status.replace("_", " ")}`,
        body.courtOrganisationId && "case linked to a court on Magistrad",
      ].filter(Boolean).join("; ");
      await tx.query("SELECT app.case_log($1, 'case.updated', $2, 'case', NULL, $3)", [caseId, `Case details updated: ${changes}`, JSON.stringify(body)]);
      await appendAudit(tx, { action: "case.update", outcome: "success", resourceType: "case", resourceId: caseId, ipAddress: req.ip, metadata: body });
    });
    return { ok: true };
  });

  app.get("/cases/:id/participants", async (req) => {
    const caseId = uuid.parse((req.params as { id: string }).id);
    const { user, facts } = await authorizeCase(req, pool, caseId, () => ({ type: "case.view" }));
    const { rows } = await withActor(pool, user.id, (tx) => tx.query(
      `SELECT p.user_id, p.case_role, p.status, p.created_at, s.kind AS side, u.full_name, u.email, u.status AS account_status
       FROM app.participants p JOIN app.users u ON u.id = p.user_id LEFT JOIN app.sides s ON s.id = p.side_id
       WHERE p.case_id = $1 ORDER BY p.status, s.kind NULLS FIRST, p.case_role, u.full_name`, [caseId]));
    return {
      participants: rows.map((r) => ({
        userId: r.user_id, fullName: r.full_name, email: r.email, role: r.case_role, side: r.side, status: r.status,
        accountStatus: r.account_status, since: r.created_at,
        canRemove: r.status === "active" && canInCase(user.id, facts, {
          type: "participant.remove", role: r.case_role, side: r.side, targetUserId: r.user_id,
          // The database re-checks court membership; for display, court staff/admins manage court roles.
          targetInCaseCourt: true, caseHasCourt: facts.caseRow!.court_organisation_id !== null,
        }).allowed,
      })),
    };
  });

  app.post("/cases/:id/participants", async (req, reply) => {
    const caseId = uuid.parse((req.params as { id: string }).id);
    const body = addParticipant.parse(req.body);
    const isCourtRole = body.role === "judge" || body.role === "court_staff";
    if (isCourtRole !== (body.side === null)) throw badRequest(isCourtRole ? "Judges and court staff belong to no side." : "Choose a side.");

    const { user } = requireUser(req);
    // Look the person up first (only allowed for those who manage this case's members).
    const target = await withActor(pool, user.id, async (tx) => {
      const facts = await caseFacts(tx, caseId);
      if (!facts.exists) throw notFound("Case not found.");
      const canLookUp = facts.me?.role === "solicitor" || facts.me?.role === "court_staff" || facts.isCourtAdmin;
      if (!canLookUp) return { id: null as string | null, facts };
      const r = await tx.query<{ id: string | null }>("SELECT app.case_find_user_by_email($1, $2) AS id", [caseId, body.email]);
      return { id: r.rows[0]?.id ?? null, facts };
    });

    const { facts } = await authorizeCase(req, pool, caseId, async (f, tx) => {
      const sideId = body.side ? f.sideIds[body.side] : null;
      const members = sideId
        ? Number((await tx.query<{ n: string }>("SELECT count(*) AS n FROM app.participants WHERE case_id = $1 AND side_id = $2 AND status = 'active'", [caseId, sideId])).rows[0]!.n)
        : 1;
      const court = f.caseRow!.court_organisation_id;
      const inCourt = !!(court && target.id && (await tx.query(
        "SELECT 1 FROM app.memberships WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'", [court, target.id])).rowCount);
      return {
        type: "participant.add", role: body.role, side: body.side, targetUserId: target.id ?? "new-person",
        sideHasMembers: members > 0, targetInCaseCourt: inCourt, caseHasCourt: court !== null,
      };
    });
    void target.facts;

    const added = await withActor(pool, user.id, async (tx) => {
      let id = target.id;
      let invited = false;
      if (!id) {
        if (isCourtRole) throw badRequest("Judges and court staff must already have an account with the court.");
        id = crypto.randomUUID();
        await tx.query("INSERT INTO app.users (id, email, full_name) VALUES ($1, $2, $3)", [id, body.email, body.fullName]);
        invited = true;
      }
      const existing = await tx.query<{ status: string }>("SELECT status FROM app.participants WHERE case_id = $1 AND user_id = $2", [caseId, id]);
      if (existing.rowCount) throw conflict(existing.rows[0]!.status === "active" ? "That person is already on this case." : "That person was removed from this case. Re-adding is not supported yet; contact support.");
      const sideId = body.side ? facts.sideIds[body.side] : null;
      await tx.query("INSERT INTO app.participants (case_id, user_id, case_role, side_id, added_by) VALUES ($1, $2, $3, $4, $5)",
        [caseId, id, body.role, sideId, user.id]);
      const name = (await tx.query<{ full_name: string }>("SELECT full_name FROM app.users WHERE id = $1", [id])).rows[0]?.full_name ?? body.fullName;
      const privateToSide = PRIVATE_TO_SIDE.includes(body.role);
      const where = body.side ? ` for the ${body.side}` : "";
      await tx.query("SELECT app.case_log($1, 'participant.added', $2, $3, $4, NULL)",
        [caseId, `${name} joined as ${ROLE_WORDS[body.role]}${where}`, privateToSide ? "side" : "case", privateToSide ? sideId : null]);
      await appendAudit(tx, { action: "case.participant.add", outcome: "success", resourceType: "case", resourceId: caseId, ipAddress: req.ip, metadata: { userId: id, role: body.role, side: body.side, invited } });
      return { userId: id, invited };
    });
    return reply.status(201).send(added);
  });

  app.patch("/cases/:id/participants/:userId", async (req) => {
    const params = req.params as { id: string; userId: string };
    const caseId = uuid.parse(params.id);
    const targetId = uuid.parse(params.userId);
    z.object({ status: z.literal("removed") }).strict().parse(req.body);
    let targetRow: { case_role: CaseRole; side: SideKind | null; side_id: string | null; full_name: string } | undefined;
    const { user } = await authorizeCase(req, pool, caseId, async (f, tx) => {
      targetRow = (await tx.query("SELECT p.case_role, s.kind AS side, p.side_id, u.full_name FROM app.participants p JOIN app.users u ON u.id = p.user_id LEFT JOIN app.sides s ON s.id = p.side_id WHERE p.case_id = $1 AND p.user_id = $2 AND p.status = 'active'", [caseId, targetId])).rows[0];
      if (!targetRow) throw notFound("That person is not on this case.");
      const court = f.caseRow!.court_organisation_id;
      const inCourt = !!(court && (await tx.query("SELECT 1 FROM app.memberships WHERE organisation_id = $1 AND user_id = $2", [court, targetId])).rowCount);
      return { type: "participant.remove", role: targetRow.case_role, side: targetRow.side, targetUserId: targetId, targetInCaseCourt: inCourt, caseHasCourt: court !== null };
    });
    await withActor(pool, user.id, async (tx) => {
      const r = await tx.query("UPDATE app.participants SET status = 'removed' WHERE case_id = $1 AND user_id = $2 AND status = 'active'", [caseId, targetId]);
      if (!r.rowCount) throw notFound("That person is not on this case.");
      const t = targetRow!;
      const privateToSide = PRIVATE_TO_SIDE.includes(t.case_role);
      await tx.query("SELECT app.case_log($1, 'participant.removed', $2, $3, $4, NULL)",
        [caseId, `${t.full_name} (${ROLE_WORDS[t.case_role]}) was removed from the case`, privateToSide ? "side" : "case", privateToSide ? t.side_id : null]);
      await appendAudit(tx, { action: "case.participant.remove", outcome: "success", resourceType: "case", resourceId: caseId, ipAddress: req.ip, metadata: { userId: targetId } });
    });
    return { ok: true };
  });

  app.post("/cases/:id/parties", async (req, reply) => {
    const caseId = uuid.parse((req.params as { id: string }).id);
    const body = addParty.parse(req.body);
    const { user, facts } = await authorizeCase(req, pool, caseId, () => ({ type: "party.add", side: body.side }));
    await withActor(pool, user.id, async (tx) => {
      await tx.query("INSERT INTO app.parties (case_id, side_id, name, party_type, created_by) VALUES ($1, $2, $3, $4, $5)",
        [caseId, facts.sideIds[body.side], body.name, body.type, user.id]);
      await tx.query("SELECT app.case_log($1, 'party.added', $2, 'case', NULL, NULL)", [caseId, `${body.name} added as a party for the ${body.side}`]);
      await appendAudit(tx, { action: "case.party.add", outcome: "success", resourceType: "case", resourceId: caseId, ipAddress: req.ip });
    });
    return reply.status(201).send({ ok: true });
  });

  app.get("/cases/:id/timeline", async (req) => {
    const caseId = uuid.parse((req.params as { id: string }).id);
    const { user } = await authorizeCase(req, pool, caseId, () => ({ type: "case.view" }));
    const { rows } = await withActor(pool, user.id, (tx) => tx.query(
      `SELECT e.id, e.occurred_at, e.kind, e.summary, e.visibility, u.full_name AS actor
       FROM app.case_events e LEFT JOIN app.users u ON u.id = e.actor_id
       WHERE e.case_id = $1 ORDER BY e.id DESC LIMIT 100`, [caseId]));
    return { events: rows.map((r) => ({ id: Number(r.id), at: r.occurred_at, kind: r.kind, summary: r.summary, privateToSide: r.visibility === "side", actor: r.actor })) };
  });
}
