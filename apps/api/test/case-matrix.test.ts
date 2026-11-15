/**
 * Phase 1 permission matrix (packages/policy/src/case-matrix.ts) checked against
 *   1. the API over HTTP, and
 *   2. PostgreSQL row-level security directly, with no API.
 * Each cell gets its own freshly built fictional case.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CASE_SUBJECTS, PHASE1_MATRIX, type CaseMatrixCase, type CaseSubject } from "@magistrad/policy";
import { actAs, asOwner, seedCaseWorld, type CaseWorld } from "@magistrad/db/testing";
import { asBrowser, sessionFor, startHarness, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { if (h) await h.close(); });

const SIDE_EVENT = "Claimant team: privileged step recorded";

async function world() {
  const w = await seedCaseWorld(h.db);
  // A private claimant-side timeline entry, and a second court member who could be assigned as judge.
  await actAs(h.db, w.users.claimantSolicitor, "SELECT app.case_log($1, 'test.private', $2, 'side', $3, NULL)", [w.caseId, SIDE_EVENT, w.sides.claimant]);
  const courtMember = await asOwner(h.db, async (c) => {
    const id = randomUUID();
    const email = `judge2.${id.slice(0, 8)}@example.test`;
    await c.query("INSERT INTO app.users (id, email, full_name, status) VALUES ($1, $2, 'Second Judge', 'active')", [id, email]);
    await c.query("INSERT INTO app.memberships (user_id, organisation_id, created_by) VALUES ($1, $2, $1)", [id, w.court]);
    return { id, email };
  });
  return { w, courtMember };
}

const spaceId = (w: CaseWorld, s: "claimantPrivate" | "defendantPrivate" | "shared" | "record") => w.spaces[s];

async function viaHttp(c: CaseMatrixCase, subject: CaseSubject): Promise<boolean> {
  const { w, courtMember } = await world();
  const headers = asBrowser(await sessionFor(h, w.users[subject]));
  const get = (url: string) => h.app.inject({ method: "GET", url, headers });
  const send = (method: "POST" | "PATCH", url: string, payload: object) => h.app.inject({ method, url, headers, payload });
  const base = `/cases/${w.caseId}`;
  const expectDenied = (status: number) => {
    expect([403, 404], `unexpected status ${status}`).toContain(status);
    return false;
  };
  switch (c.action) {
    case "case.view": {
      const r = await get(base);
      return r.statusCode === 200 ? true : expectDenied(r.statusCode);
    }
    case "space.read": {
      const r = await get(base);
      if (r.statusCode !== 200) return expectDenied(r.statusCode);
      return r.json().spaces.some((s: { id: string }) => s.id === spaceId(w, c.space));
    }
    case "participant.see": {
      const r = await get(`${base}/participants`);
      if (r.statusCode !== 200) return expectDenied(r.statusCode);
      return r.json().participants.some((p: { userId: string }) => p.userId === w.users[c.target]);
    }
    case "timeline.readSide": {
      const r = await get(`${base}/timeline`);
      if (r.statusCode !== 200) return expectDenied(r.statusCode);
      return r.json().events.some((e: { summary: string }) => e.summary === SIDE_EVENT);
    }
    case "participant.add": {
      const email = c.target === "self" ? w.emails[subject] : c.target === "courtMember" ? courtMember.email : `new.${randomUUID().slice(0, 8)}@example.test`;
      const r = await send("POST", `${base}/participants`, { email, fullName: "New Person", role: c.role, side: c.side });
      return r.statusCode === 201 ? true : expectDenied(r.statusCode);
    }
    case "participant.remove": {
      const r = await send("PATCH", `${base}/participants/${w.users[c.target]}`, { status: "removed" });
      return r.statusCode === 200 ? true : expectDenied(r.statusCode);
    }
    case "party.add": {
      const r = await send("POST", `${base}/parties`, { side: c.side, name: "Second Claimant Ltd (fictional)", type: "organisation" });
      return r.statusCode === 201 ? true : expectDenied(r.statusCode);
    }
    case "case.update": {
      const r = await send("PATCH", base, { status: "issued" });
      return r.statusCode === 200 ? true : expectDenied(r.statusCode);
    }
  }
}

async function viaDatabase(c: CaseMatrixCase, subject: CaseSubject): Promise<boolean> {
  const { w, courtMember } = await world();
  const me = w.users[subject];
  const rows = async (sql: string, params: unknown[]) => {
    try {
      return (await actAs(h.db, me, sql, params)).rowCount ?? 0;
    } catch (err) {
      if ((err as { code?: string }).code === "42501") return 0;
      throw err;
    }
  };
  switch (c.action) {
    case "case.view": return (await rows("SELECT 1 FROM app.cases WHERE id = $1", [w.caseId])) === 1;
    case "space.read": return (await rows("SELECT 1 FROM app.spaces WHERE id = $1", [spaceId(w, c.space)])) === 1;
    case "participant.see": return (await rows("SELECT 1 FROM app.participants WHERE case_id = $1 AND user_id = $2", [w.caseId, w.users[c.target]])) === 1;
    case "timeline.readSide": return (await rows("SELECT 1 FROM app.case_events WHERE case_id = $1 AND summary = $2", [w.caseId, SIDE_EVENT])) === 1;
    case "participant.add": {
      const target = c.target === "self" ? me : c.target === "courtMember" ? courtMember.id
        : await asOwner(h.db, async (o) => {
          const id = randomUUID();
          await o.query("INSERT INTO app.users (id, email, full_name) VALUES ($1, $2, 'New Person')", [id, `db.${id.slice(0, 8)}@example.test`]);
          return id;
        });
      const side = c.side ? w.sides[c.side] : null;
      return (await rows("INSERT INTO app.participants (case_id, user_id, case_role, side_id, added_by) VALUES ($1, $2, $3, $4, $5)",
        [w.caseId, target, c.role, side, me])) === 1;
    }
    case "participant.remove":
      return (await rows("UPDATE app.participants SET status = 'removed' WHERE case_id = $1 AND user_id = $2", [w.caseId, w.users[c.target]])) === 1;
    case "party.add":
      return (await rows("INSERT INTO app.parties (case_id, side_id, name, party_type, created_by) VALUES ($1, $2, 'Second Claimant Ltd', 'organisation', $3)",
        [w.caseId, w.sides[c.side], me])) === 1;
    case "case.update":
      return (await rows("UPDATE app.cases SET status = 'issued' WHERE id = $1", [w.caseId])) === 1;
  }
}

const expected = (row: (typeof PHASE1_MATRIX)[number], subject: CaseSubject) =>
  row.allowed.includes(subject) || (row.case.action === "participant.see" && row.case.target === subject);

describe("case permission matrix — API over HTTP", () => {
  for (const row of PHASE1_MATRIX) {
    for (const subject of CASE_SUBJECTS) {
      const allowed = expected(row, subject);
      it(`${row.label}: ${subject} → ${allowed ? "allowed" : "denied"}`, async () => {
        expect(await viaHttp(row.case, subject)).toBe(allowed);
      });
    }
  }
});

describe("case permission matrix — database row-level security alone", () => {
  for (const row of PHASE1_MATRIX) {
    for (const subject of CASE_SUBJECTS) {
      const allowed = expected(row, subject);
      it(`${row.label}: ${subject} → ${allowed ? "allowed" : "refused"}`, async () => {
        expect(await viaDatabase(row.case, subject)).toBe(allowed);
      });
    }
  }
});
