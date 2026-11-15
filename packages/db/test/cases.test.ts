import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, asOwner, createTestDatabase, dropTestDatabase, seedCaseWorld, type CaseWorld, type TestDatabase } from "../src/testing";

let db: TestDatabase;
let w: CaseWorld;
beforeAll(async () => {
  db = await createTestDatabase("cases");
  w = await seedCaseWorld(db);
});
afterAll(async () => { if (db) await dropTestDatabase(db); });

const spacesSeenBy = async (who: keyof CaseWorld["users"]) =>
  (await actAs<{ id: string }>(db, w.users[who], "SELECT id FROM app.spaces WHERE case_id = $1", [w.caseId])).rows.map((r) => r.id).sort();

describe("the three-layer separation, enforced by the database alone", () => {
  it("claimant's team sees its own private space, shared and record — never the defendant's private space", async () => {
    for (const who of ["claimantSolicitor", "claimantBarrister", "claimantClient"] as const) {
      expect(await spacesSeenBy(who)).toEqual([w.spaces.claimantPrivate, w.spaces.shared, w.spaces.record].sort());
    }
  });

  it("defendant's solicitor sees their own private space, shared and record — never the claimant's", async () => {
    expect(await spacesSeenBy("defendantSolicitor")).toEqual([w.spaces.defendantPrivate, w.spaces.shared, w.spaces.record].sort());
  });

  it("the judge sees shared and record, and neither side's private space", async () => {
    expect(await spacesSeenBy("judge")).toEqual([w.spaces.shared, w.spaces.record].sort());
  });

  it("experts see nothing until given specific folders (Phase 2)", async () => {
    expect(await spacesSeenBy("claimantExpert")).toEqual([]);
  });

  it("people not on the case see nothing — including a colleague at the same firm, the court's registry and the super administrator", async () => {
    for (const who of ["claimantColleague", "outsider", "superAdmin", "courtAdmin"] as const) {
      expect(await spacesSeenBy(who)).toEqual([]);
    }
  });

  it("the case itself is invisible to non-participants, but the linked court's registry can see that it exists", async () => {
    const seen = async (who: keyof CaseWorld["users"]) =>
      (await actAs(db, w.users[who], "SELECT 1 FROM app.cases WHERE id = $1", [w.caseId])).rowCount;
    expect(await seen("claimantColleague")).toBe(0);
    expect(await seen("superAdmin")).toBe(0);
    expect(await seen("outsider")).toBe(0);
    expect(await seen("courtAdmin")).toBe(1);
    expect(await seen("judge")).toBe(1);
  });
});

describe("members list visibility", () => {
  const visible = async (who: keyof CaseWorld["users"]) =>
    (await actAs<{ user_id: string }>(db, w.users[who], "SELECT user_id FROM app.participants WHERE case_id = $1", [w.caseId])).rows.map((r) => r.user_id);

  it("the other side sees who is on the record, but not the claimant's counsel or expert", async () => {
    const seen = await visible("defendantSolicitor");
    expect(seen).toEqual(expect.arrayContaining([w.users.claimantSolicitor, w.users.claimantClient, w.users.judge, w.users.defendantSolicitor]));
    expect(seen).not.toContain(w.users.claimantBarrister);
    expect(seen).not.toContain(w.users.claimantExpert);
  });

  it("the court and the claimant's own side see everyone on the claimant side", async () => {
    for (const who of ["judge", "claimantClient"] as const) {
      expect(await visible(who)).toEqual(expect.arrayContaining([w.users.claimantBarrister, w.users.claimantExpert]));
    }
  });

  it("names follow the same rule", async () => {
    const names = async (who: keyof CaseWorld["users"], target: string) =>
      (await actAs(db, w.users[who], "SELECT 1 FROM app.users WHERE id = $1", [target])).rowCount;
    expect(await names("defendantSolicitor", w.users.claimantExpert)).toBe(0);
    expect(await names("claimantSolicitor", w.users.claimantExpert)).toBe(1);
  });
});

describe("who can add and remove people", () => {
  const tryAdd = (actor: string, user: string, role: string, side: string | null) =>
    actAs(db, actor, "INSERT INTO app.participants (case_id, user_id, case_role, side_id, added_by) VALUES ($1, $2, $3, $4, $5)",
      [w.caseId, user, role, side, actor]);

  it("nobody can add themselves to a case — not a colleague, not the super administrator", async () => {
    await expect(tryAdd(w.users.claimantColleague, w.users.claimantColleague, "solicitor", w.sides.claimant)).rejects.toThrow(/row-level security/);
    await expect(tryAdd(w.users.superAdmin, w.users.superAdmin, "solicitor", w.sides.claimant)).rejects.toThrow(/row-level security/);
  });

  it("a solicitor cannot staff the other side once it has someone on it", async () => {
    await expect(tryAdd(w.users.claimantSolicitor, w.users.outsider, "solicitor", w.sides.defendant)).rejects.toThrow(/row-level security/);
  });

  it("counsel and clients cannot add people", async () => {
    await expect(tryAdd(w.users.claimantBarrister, w.users.outsider, "expert", w.sides.claimant)).rejects.toThrow(/row-level security/);
    await expect(tryAdd(w.users.claimantClient, w.users.outsider, "expert", w.sides.claimant)).rejects.toThrow(/row-level security/);
  });

  it("only the linked court can assign judges, and only its own members", async () => {
    await expect(tryAdd(w.users.claimantSolicitor, w.users.outsider, "judge", null)).rejects.toThrow(/row-level security/);
    await expect(tryAdd(w.users.courtAdmin, w.users.outsider, "judge", null)).rejects.toThrow(/row-level security/);
  });

  it("a solicitor cannot remove the other side's people, but can remove their own", async () => {
    const remove = (actor: string, user: string) =>
      actAs(db, actor, "UPDATE app.participants SET status = 'removed' WHERE case_id = $1 AND user_id = $2", [w.caseId, user]);
    expect((await remove(w.users.claimantSolicitor, w.users.defendantSolicitor)).rowCount).toBe(0);
    expect((await remove(w.users.defendantSolicitor, w.users.claimantClient)).rowCount).toBe(0);
    expect((await remove(w.users.claimantSolicitor, w.users.claimantExpert)).rowCount).toBe(1);
    await asOwner(db, (c) => c.query("UPDATE app.participants SET status = 'active' WHERE case_id = $1 AND user_id = $2", [w.caseId, w.users.claimantExpert]));
  });

  it("a participant's role and side cannot be rewritten in place", async () => {
    await expect(actAs(db, w.users.claimantSolicitor,
      "UPDATE app.participants SET case_role = 'solicitor' WHERE case_id = $1 AND user_id = $2", [w.caseId, w.users.claimantBarrister]))
      .rejects.toThrow(/permission denied/);
  });

  it("only the court can change the court once linked", async () => {
    await asOwner(db, async (c) => {
      await c.query("INSERT INTO app.organisations (id, name, type) VALUES ('00000000-0000-4000-8000-000000000001', 'Other Court (fictional)', 'court') ON CONFLICT DO NOTHING");
    });
    await expect(actAs(db, w.users.claimantSolicitor, "UPDATE app.cases SET court_organisation_id = '00000000-0000-4000-8000-000000000001' WHERE id = $1", [w.caseId]))
      .rejects.toThrow(/only the court/);
  });
});

describe("case timeline", () => {
  it("side-private events are invisible to the other side and to the court", async () => {
    await actAs(db, w.users.claimantSolicitor, "SELECT app.case_log($1, 'participant.added', 'Expert instructed', 'side', $2, NULL)", [w.caseId, w.sides.claimant]);
    const count = async (who: keyof CaseWorld["users"]) => (await actAs(db, w.users[who],
      "SELECT 1 FROM app.case_events WHERE case_id = $1 AND summary = 'Expert instructed'", [w.caseId])).rowCount;
    expect(await count("claimantBarrister")).toBe(1);
    expect(await count("defendantSolicitor")).toBe(0);
    expect(await count("judge")).toBe(0);
  });

  it("nobody can log a private event for the other side, and the timeline is append-only", async () => {
    await expect(actAs(db, w.users.defendantSolicitor, "SELECT app.case_log($1, 'x.spoof', 'Spoof', 'side', $2, NULL)", [w.caseId, w.sides.claimant]))
      .rejects.toThrow(/your own side/);
    await expect(asOwner(db, (c) => c.query("UPDATE app.case_events SET summary = 'changed'"))).rejects.toThrow(/append-only/);
  });
});

describe("opening a case", () => {
  it("only members of a law firm, court or tribunal can open one", async () => {
    const open = (actor: string, org: string) => actAs(db, actor,
      "SELECT app.create_case($1, 'Some matter', 'Some Court', 'other', NULL, 'claimant', 'A (fictional)', 'individual', 'B (fictional)', 'individual')", [org]);
    await expect(open(w.users.outsider, w.firmA)).rejects.toThrow(/members of a law firm/);
    await expect(open(w.users.claimantBarrister, w.firmA)).rejects.toThrow(/members of a law firm/);
    await expect(open(w.users.claimantColleague, w.firmA)).resolves.toBeTruthy();
  });
});
