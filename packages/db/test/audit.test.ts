import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asOwner, createTestDatabase, dropTestDatabase, type TestDatabase } from "../src/testing";
import { asApp, seedWorld, type Fixture } from "./fixtures";

let db: TestDatabase;
let w: Fixture;
beforeAll(async () => {
  db = await createTestDatabase("audit");
  w = await seedWorld(db);
});
afterAll(async () => { if (db) await dropTestDatabase(db); });

const append = (actor: string | null, action: string, org: string | null = null, meta: object | null = null) =>
  asApp(db, actor, "SELECT app.audit_append($1, 'success', 'test', NULL, $2, '127.0.0.1', $3)",
    [action, org, meta ? JSON.stringify(meta) : null]);

describe("audit log", () => {
  it("chains every event and verifies, even under concurrent writes", async () => {
    await Promise.all(Array.from({ length: 30 }, (_, i) => append(w.adminA, "test.event", w.orgA, { i, b: 1, a: 2 })));
    const verify = await asApp<{ checked: string; first_broken_seq: string | null }>(db, w.superAdmin, "SELECT * FROM app.audit_verify()");
    expect(verify.rows[0]).toEqual({ checked: "30", first_broken_seq: null });
  });

  it("records the signed-in user as the actor, whatever the caller claims", async () => {
    await asApp(db, w.memberA, "SELECT app.audit_append('test.spoof', 'success', NULL, NULL, NULL, NULL, NULL, $1)", [w.superAdmin]);
    const row = await asOwner(db, (c) => c.query("SELECT actor_id FROM app.audit_events WHERE action = 'test.spoof'"));
    expect(row.rows[0].actor_id).toBe(w.memberA);
  });

  it("cannot be written, changed or deleted directly by the application", async () => {
    await expect(asApp(db, w.superAdmin,
      "INSERT INTO app.audit_events (seq, occurred_at, action, outcome, prev_hash, hash) VALUES (999, now(), 'x.forged', 'success', 'a', 'b')"))
      .rejects.toThrow(/permission denied/);
    await expect(asApp(db, w.superAdmin, "UPDATE app.audit_events SET outcome = 'denied'")).rejects.toThrow(/permission denied/);
    await expect(asApp(db, w.superAdmin, "DELETE FROM app.audit_events")).rejects.toThrow(/permission denied/);
  });

  it("is append-only even for the owner, unless the trigger is deliberately disabled", async () => {
    await expect(asOwner(db, (c) => c.query("UPDATE app.audit_events SET outcome = 'denied' WHERE seq = 1"))).rejects.toThrow(/append-only/);
    await expect(asOwner(db, (c) => c.query("TRUNCATE app.audit_events"))).rejects.toThrow(/append-only/);
  });

  it("scopes reading: super admin sees all, org admin sees their organisation, members see none", async () => {
    await append(w.adminB, "test.other_org", w.orgB);
    const count = async (actor: string) => Number((await asApp<{ n: string }>(db, actor, "SELECT count(*) AS n FROM app.audit_events")).rows[0]!.n);
    const total = await count(w.superAdmin);
    expect(await count(w.adminA)).toBe(30);
    expect(await count(w.adminB)).toBe(1);
    expect(await count(w.memberA)).toBe(0);
    expect(total).toBeGreaterThan(31);
  });

  it("detects tampering and reports where", async () => {
    await asOwner(db, async (c) => {
      await c.query("ALTER TABLE app.audit_events DISABLE TRIGGER audit_no_update_delete");
      await c.query("UPDATE app.audit_events SET metadata = '{\"i\": 999}' WHERE seq = 5");
      await c.query("ALTER TABLE app.audit_events ENABLE TRIGGER audit_no_update_delete");
    });
    const verify = await asApp<{ first_broken_seq: string }>(db, w.superAdmin, "SELECT * FROM app.audit_verify()");
    expect(verify.rows[0]!.first_broken_seq).toBe("5");
  });

  it("only super admins can run a chain verification", async () => {
    await expect(asApp(db, w.adminA, "SELECT * FROM app.audit_verify()")).rejects.toThrow(/not permitted/);
  });

  it("checkpoints are super-admin only", async () => {
    await expect(asApp(db, w.adminA, "SELECT app.audit_checkpoint()")).rejects.toThrow(/not permitted/);
    await expect(asApp(db, w.superAdmin, "SELECT (app.audit_checkpoint()).seq")).resolves.toBeTruthy();
  });
});

void pg;
