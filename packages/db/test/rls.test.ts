import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, dropTestDatabase, type TestDatabase } from "../src/testing";
import { asApp, seedWorld, type Fixture } from "./fixtures";

let db: TestDatabase;
let w: Fixture;
beforeAll(async () => {
  db = await createTestDatabase("rls");
  w = await seedWorld(db);
});
afterAll(async () => { if (db) await dropTestDatabase(db); });

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("database enforcement (application role, no API in front)", () => {
  it("shows nothing at all when no user is set", async () => {
    for (const table of ["organisations", "users", "memberships", "audit_events"]) {
      expect((await asApp(db, null, `SELECT * FROM app.${table}`)).rowCount).toBe(0);
    }
  });

  it("limits organisations to the ones you belong to", async () => {
    expect(ids((await asApp<{ id: string }>(db, w.memberA, "SELECT id FROM app.organisations")).rows)).toEqual([w.orgA]);
    expect((await asApp(db, w.outsider, "SELECT id FROM app.organisations")).rowCount).toBe(0);
    expect((await asApp(db, w.superAdmin, "SELECT id FROM app.organisations")).rowCount).toBe(2);
  });

  it("limits users to yourself and people in your organisations", async () => {
    const seen = ids((await asApp<{ id: string }>(db, w.memberA, "SELECT id FROM app.users")).rows);
    expect(seen).toEqual([w.adminA, w.memberA].sort());
    expect(ids((await asApp<{ id: string }>(db, w.outsider, "SELECT id FROM app.users")).rows)).toEqual([w.outsider]);
  });

  it("never exposes sessions or sign-in flows to the application role", async () => {
    await expect(asApp(db, w.superAdmin, "SELECT * FROM app.sessions")).rejects.toThrow(/permission denied/);
    await expect(asApp(db, w.superAdmin, "SELECT * FROM app.auth_flows")).rejects.toThrow(/permission denied/);
  });

  it("only super admins create organisations", async () => {
    await expect(asApp(db, w.adminA, "INSERT INTO app.organisations (name, type) VALUES ('Rogue', 'law_firm')"))
      .rejects.toThrow(/row-level security/);
    await expect(asApp(db, w.superAdmin, "INSERT INTO app.organisations (name, type) VALUES ('Gamma Chambers', 'chambers') RETURNING id"))
      .resolves.toMatchObject({ rowCount: 1 });
  });

  it("lets an org admin add members to their own organisation only", async () => {
    const add = (actor: string, user: string, org: string, role = "member") =>
      asApp(db, actor, "INSERT INTO app.memberships (user_id, organisation_id, org_role, created_by) VALUES ($1, $2, $3, $4)", [user, org, role, actor]);
    await expect(add(w.adminA, w.outsider, w.orgA)).resolves.toMatchObject({ rowCount: 1 });
    await expect(add(w.adminA, w.adminB, w.orgB)).rejects.toThrow(/row-level security/);
    await expect(add(w.memberA, w.adminB, w.orgA)).rejects.toThrow(/row-level security/);
  });

  it("forbids anyone, including a super admin, from granting themselves membership or a higher role", async () => {
    await expect(asApp(db, w.superAdmin,
      "INSERT INTO app.memberships (user_id, organisation_id, created_by) VALUES ($1, $2, $1)", [w.superAdmin, w.orgA]))
      .rejects.toThrow(/row-level security/);
    // adminA tries to promote their own membership -> no row is visible for update.
    const res = await asApp(db, w.adminA,
      "UPDATE app.memberships SET org_role = 'org_admin' WHERE user_id = $1 RETURNING id", [w.adminA]);
    expect(res.rowCount).toBe(0);
  });

  it("guards platform roles and account status", async () => {
    await expect(asApp(db, w.superAdmin, "UPDATE app.users SET platform_role = 'none' WHERE id = $1", [w.superAdmin]))
      .rejects.toThrow(/another super administrator/);
    await expect(asApp(db, w.adminA, "UPDATE app.users SET platform_role = 'super_admin' WHERE id = $1", [w.adminA]))
      .rejects.toThrow(/another super administrator/);
    await expect(asApp(db, w.adminA,
      "INSERT INTO app.users (email, full_name, platform_role) VALUES ('sneaky@example.test', 'Sneaky', 'super_admin')"))
      .rejects.toThrow(/privileged users/);
    await expect(asApp(db, w.adminA,
      "INSERT INTO app.users (email, full_name, status) VALUES ('active@example.test', 'Pre Active', 'active')"))
      .rejects.toThrow(/start as invited/);
    await expect(asApp(db, w.superAdmin, "UPDATE app.users SET status = 'suspended' WHERE id = $1 RETURNING id", [w.memberA]))
      .resolves.toMatchObject({ rowCount: 1 });
    await asApp(db, w.superAdmin, "UPDATE app.users SET status = 'active' WHERE id = $1", [w.memberA]);
  });

  it("has no delete path for identity data", async () => {
    const res = await asApp(db, w.superAdmin, "DELETE FROM app.memberships WHERE user_id = $1", [w.memberA]).catch((e: Error) => e);
    expect(res instanceof Error ? res.message : "deleted").toMatch(/permission denied/);
  });
});

describe("sign-in functions", () => {
  it("activates an invited user on first verified sign-in and binds their identity", async () => {
    await asApp(db, w.superAdmin, "INSERT INTO app.users (email, full_name) VALUES ('new.user@example.test', 'New User')");
    const first = await asApp<{ user_id: string; status: string }>(db, null,
      "SELECT * FROM app.auth_resolve_login('https://idp.test', 'sub-123', 'New.User@example.test', true)");
    expect(first.rows[0]?.status).toBe("active");
    const again = await asApp<{ user_id: string }>(db, null,
      "SELECT * FROM app.auth_resolve_login('https://idp.test', 'sub-123', 'whatever@else.test', true)");
    expect(again.rows[0]?.user_id).toBe(first.rows[0]?.user_id);
  });

  it("refuses unverified emails, unknown people and a second identity for the same invite", async () => {
    await asApp(db, w.superAdmin, "INSERT INTO app.users (email, full_name) VALUES ('pending@example.test', 'Pending')");
    expect((await asApp(db, null, "SELECT * FROM app.auth_resolve_login('https://idp.test', 'x1', 'pending@example.test', false)")).rowCount).toBe(0);
    expect((await asApp(db, null, "SELECT * FROM app.auth_resolve_login('https://idp.test', 'x2', 'stranger@example.test', true)")).rowCount).toBe(0);
    await asApp(db, null, "SELECT * FROM app.auth_resolve_login('https://idp.test', 'x3', 'pending@example.test', true)");
    expect((await asApp(db, null, "SELECT * FROM app.auth_resolve_login('https://idp.test', 'x4', 'pending@example.test', true)")).rowCount).toBe(0);
  });

  it("resolves sessions only while valid, and never for suspended users", async () => {
    await asApp(db, null, "SELECT app.auth_create_session($1, 'hash-1', interval '1 hour', '127.0.0.1', 'test')", [w.memberA]);
    const resolve = () => asApp<{ user_id: string }>(db, null, "SELECT * FROM app.auth_resolve_session('hash-1', interval '30 minutes')");
    expect((await resolve()).rows[0]?.user_id).toBe(w.memberA);
    await asApp(db, w.superAdmin, "UPDATE app.users SET status = 'suspended' WHERE id = $1", [w.memberA]);
    expect((await resolve()).rowCount).toBe(0);
    await asApp(db, w.superAdmin, "UPDATE app.users SET status = 'active' WHERE id = $1", [w.memberA]);
    await asApp(db, null, "SELECT app.auth_revoke_session('hash-1')");
    expect((await resolve()).rowCount).toBe(0);
  });

  it("only lets a super admin revoke someone else's sessions", async () => {
    await expect(asApp(db, w.adminA, "SELECT app.auth_revoke_user_sessions($1)", [w.memberA])).rejects.toThrow(/not permitted/);
    await expect(asApp(db, w.superAdmin, "SELECT app.auth_revoke_user_sessions($1)", [w.memberA])).resolves.toBeTruthy();
  });

  it("uses each sign-in flow exactly once", async () => {
    await asApp(db, null, "SELECT app.auth_begin_flow('state-1', 'verifier', 'nonce', '/')");
    expect((await asApp(db, null, "SELECT * FROM app.auth_take_flow('state-1')")).rowCount).toBe(1);
    expect((await asApp(db, null, "SELECT * FROM app.auth_take_flow('state-1')")).rowCount).toBe(0);
  });
});
