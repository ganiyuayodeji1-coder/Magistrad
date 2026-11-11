/**
 * The permission matrix (packages/policy/src/matrix.ts), checked against two
 * independent layers:
 *   1. the API over HTTP (policy module + database together), and
 *   2. PostgreSQL row-level security directly, as the application role, with no API.
 * Every cell gets a fresh, fictional world so mutations in one cell can't affect another.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHASE0_MATRIX, SUBJECTS, resolveTarget, type ConcreteUserRef, type MatrixCase, type Subject } from "@magistrad/policy";
import { asOwner, seedWorld, type World } from "@magistrad/db/testing";
import { asBrowser, sessionFor, startHarness, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { if (h) await h.close(); });

const userId = (w: World, ref: ConcreteUserRef, newUserId: string) => (ref === "newUser" ? newUserId : w[ref]);

async function worldWithAudit(): Promise<World> {
  const w = await seedWorld(h.db);
  // One platform-level and one Firm A event, so audit visibility is observable.
  await asOwner(h.db, async (c) => {
    await c.query("SELECT app.audit_append('test.platform_event', 'success')");
    await c.query("SELECT app.audit_append('test.firm_event', 'success', NULL, NULL, $1)", [w.orgA]);
  });
  return w;
}

// ── Layer 1: HTTP ──────────────────────────────────────────────────────
async function viaHttp(w: World, c: MatrixCase, subject: Subject): Promise<number> {
  const token = await sessionFor(h, w[subject]);
  const headers = asBrowser(token);
  const org = "org" in c ? w[c.org] : "";
  const send = (method: "GET" | "POST" | "PATCH", url: string, payload?: object) =>
    h.app.inject({ method, url, headers: payload ? headers : { ...headers, "content-length": "0" }, ...(payload ? { payload } : {}) });
  let res;
  switch (c.action) {
    case "organisation.create": res = await send("POST", "/organisations", { name: "New Firm (fictional)", type: "law_firm" }); break;
    case "organisation.view": res = await send("GET", `/organisations/${org}`); break;
    case "organisation.update": res = await send("PATCH", `/organisations/${org}`, { name: "Renamed (fictional)" }); break;
    case "member.list": res = await send("GET", `/organisations/${org}/members`); break;
    case "member.add": {
      const target = resolveTarget(c.target, subject);
      const email = target === "newUser" ? `new.${Math.random().toString(36).slice(2)}@example.test` : w.emails[target];
      res = await send("POST", `/organisations/${org}/members`, { email, fullName: "New Person", role: c.role });
      break;
    }
    case "member.changeRole":
      res = await send("PATCH", `/organisations/${org}/members/${w[resolveTarget(c.target, subject) as Subject]}`, { role: "org_admin" }); break;
    case "member.remove":
      res = await send("PATCH", `/organisations/${org}/members/${w[resolveTarget(c.target, subject) as Subject]}`, { status: "removed" }); break;
    case "user.suspend": case "user.reinstate":
      res = await send("POST", `/users/${w[resolveTarget(c.target, subject) as Subject]}/${c.action === "user.suspend" ? "suspend" : "reinstate"}`); break;
    case "user.list": res = await send("GET", "/users"); break;
    case "audit.viewPlatform": res = await send("GET", "/audit"); break;
    case "audit.verify": res = await send("GET", "/audit/verify"); break;
    case "audit.viewOrganisation": res = await send("GET", `/audit?organisationId=${org}`); break;
  }
  return res.statusCode;
}

// ── Layer 2: the database alone ────────────────────────────────────────
/** Returns true if the database let the action take effect, false if it refused or hid it. */
async function viaDatabase(w: World, c: MatrixCase, subject: Subject): Promise<boolean | "not-applicable"> {
  const client = new pg.Client({ connectionString: h.db.appUrl });
  await client.connect();
  const me = w[subject];
  const org = "org" in c ? w[c.org] : "";
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [me]);
    const rows = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rowCount ?? 0;
    switch (c.action) {
      case "organisation.create":
        return (await rows("INSERT INTO app.organisations (name, type) VALUES ('Db Firm', 'law_firm')")) === 1;
      case "organisation.view":
        return (await rows("SELECT 1 FROM app.organisations WHERE id = $1", [org])) === 1;
      case "organisation.update":
        return (await rows("UPDATE app.organisations SET name = 'Renamed' WHERE id = $1", [org])) === 1;
      case "member.list":
        return (await rows("SELECT 1 FROM app.memberships WHERE organisation_id = $1", [org])) > 0;
      case "member.add": {
        const target = resolveTarget(c.target, subject);
        let id: string;
        if (target === "newUser") {
          id = crypto.randomUUID();
          await client.query("INSERT INTO app.users (id, email, full_name) VALUES ($1, $2, 'New Person')", [id, `db.${id}@example.test`]);
        } else id = userId(w, target, "");
        return (await rows("INSERT INTO app.memberships (user_id, organisation_id, org_role, created_by) VALUES ($1, $2, $3, $4)",
          [id, org, c.role, me])) === 1;
      }
      case "member.changeRole":
        return (await rows("UPDATE app.memberships SET org_role = 'org_admin' WHERE user_id = $1 AND organisation_id = $2",
          [w[resolveTarget(c.target, subject) as Subject], org])) === 1;
      case "member.remove":
        return (await rows("UPDATE app.memberships SET status = 'removed' WHERE user_id = $1 AND organisation_id = $2",
          [w[resolveTarget(c.target, subject) as Subject], org])) === 1;
      case "user.suspend":
        return (await rows("UPDATE app.users SET status = 'suspended' WHERE id = $1", [w[resolveTarget(c.target, subject) as Subject]])) === 1;
      case "audit.viewPlatform":
        return (await rows("SELECT 1 FROM app.audit_events WHERE action = 'test.platform_event'")) > 0;
      case "audit.verify":
        await client.query("SELECT * FROM app.audit_verify()");
        return true;
      case "audit.viewOrganisation":
        return (await rows("SELECT 1 FROM app.audit_events WHERE organisation_id = $1", [org])) > 0;
      default:
        return "not-applicable"; // API-only concerns (e.g. listing all accounts is a policy question, not a data rule)
    }
  } catch (err) {
    if ((err as { code?: string }).code === "42501") return false;
    throw err;
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

describe("permission matrix — API over HTTP", () => {
  for (const row of PHASE0_MATRIX) {
    for (const subject of SUBJECTS) {
      const allowed = row.allowed.includes(subject);
      it(`${row.label}: ${subject} → ${allowed ? "allowed" : "denied"}`, async () => {
        const status = await viaHttp(await worldWithAudit(), row.case, subject);
        if (allowed) expect(status, `expected success, got ${status}`).toBeLessThan(300);
        else expect(status).toBe(403);
      });
    }
  }
});

describe("permission matrix — database row-level security alone", () => {
  for (const row of PHASE0_MATRIX) {
    for (const subject of SUBJECTS) {
      const allowed = row.allowed.includes(subject);
      it(`${row.label}: ${subject} → ${allowed ? "allowed" : "refused"}`, async (ctx) => {
        const result = await viaDatabase(await worldWithAudit(), row.case, subject);
        if (result === "not-applicable") return ctx.skip();
        expect(result).toBe(allowed);
      });
    }
  }
});
