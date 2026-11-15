import { randomBytes } from "node:crypto";
import pg from "pg";
import { bootstrapDatabase } from "./roles";
import { migrate } from "./migrator";

export interface TestDatabase {
  name: string;
  ownerUrl: string;
  appUrl: string;
  adminUrl: string;
}

const withDb = (url: string, db: string, user?: string, password?: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) {
    u.username = user;
    u.password = password ?? "";
  }
  return u.toString();
};

/**
 * Creates a brand-new, fully migrated database for a test run.
 * Refuses any name that does not end in "_test", so it can never touch real data.
 */
export async function createTestDatabase(prefix = "magistrad"): Promise<TestDatabase> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error("TEST_DATABASE_ADMIN_URL is not set (a superuser URL for a disposable server)");
  const name = `${prefix}_${randomBytes(4).toString("hex")}_test`;
  if (!name.endsWith("_test")) throw new Error("refusing to create a non-test database");
  // Roles are shared by every database on the server, so reuse the configured passwords
  // rather than overwriting the ones a local development database depends on.
  const ownerPassword = process.env.DATABASE_OWNER_PASSWORD ?? "test-owner-password";
  const appPassword = process.env.DATABASE_APP_PASSWORD ?? "test-app-password";
  await bootstrapDatabase({ adminUrl, database: name, ownerPassword, appPassword });
  const ownerUrl = withDb(adminUrl, name, "magistrad_owner", ownerPassword);
  await migrate(ownerUrl);
  return { name, adminUrl, ownerUrl, appUrl: withDb(adminUrl, name, "magistrad_app", appPassword) };
}

export async function dropTestDatabase(db: TestDatabase): Promise<void> {
  if (!db.name.endsWith("_test")) throw new Error("refusing to drop a non-test database");
  const admin = new pg.Client({ connectionString: db.adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(db.name)} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

/** Owner-level insert used only to arrange test fixtures (bypasses guards, never used by the app). */
export async function asOwner<T>(db: TestDatabase, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export interface World {
  superAdmin: string;
  orgA: string;
  orgB: string;
  adminA: string;
  memberA: string;
  adminB: string;
  outsider: string;
  emails: Record<"superAdmin" | "adminA" | "memberA" | "adminB" | "outsider", string>;
}

/**
 * A small, fictional world: two firms, their admins and members, a super admin and
 * one unaffiliated user. `tag` keeps emails unique so many worlds can share a database.
 */
export async function seedWorld(db: TestDatabase, tag = randomBytes(3).toString("hex")): Promise<World> {
  return asOwner(db, async (c) => {
    const emails = {
      superAdmin: `super.${tag}@example.test`, adminA: `admin.a.${tag}@example.test`, memberA: `member.a.${tag}@example.test`,
      adminB: `admin.b.${tag}@example.test`, outsider: `outsider.${tag}@example.test`,
    };
    const user = async (email: string, role: "none" | "super_admin" = "none") =>
      (await c.query<{ id: string }>(
        "INSERT INTO app.users (email, full_name, platform_role, status) VALUES ($1, $2, $3, 'active') RETURNING id",
        [email, `Test ${email.split("@")[0]}`, role],
      )).rows[0]!.id;
    const org = async (name: string) =>
      (await c.query<{ id: string }>("INSERT INTO app.organisations (name, type) VALUES ($1, 'law_firm') RETURNING id", [name])).rows[0]!.id;
    const superAdmin = await user(emails.superAdmin, "super_admin");
    const orgA = await org(`Alpha LLP ${tag} (fictional)`);
    const orgB = await org(`Beta & Co ${tag} (fictional)`);
    const adminA = await user(emails.adminA);
    const memberA = await user(emails.memberA);
    const adminB = await user(emails.adminB);
    const outsider = await user(emails.outsider);
    const member = (u: string, o: string, r: "org_admin" | "member") =>
      c.query("INSERT INTO app.memberships (user_id, organisation_id, org_role, created_by) VALUES ($1, $2, $3, $4)", [u, o, r, superAdmin]);
    await member(adminA, orgA, "org_admin");
    await member(memberA, orgA, "member");
    await member(adminB, orgB, "org_admin");
    return { superAdmin, orgA, orgB, adminA, memberA, adminB, outsider, emails };
  });
}

export const CASE_SUBJECTS = [
  "claimantSolicitor", "claimantColleague", "claimantBarrister", "claimantExpert", "claimantClient",
  "defendantSolicitor", "judge", "courtAdmin", "outsider", "superAdmin",
] as const;
export type CaseSubject = (typeof CASE_SUBJECTS)[number];

export interface CaseWorld {
  users: Record<CaseSubject, string>;
  emails: Record<CaseSubject, string>;
  firmA: string;
  firmB: string;
  court: string;
  caseId: string;
  sides: { claimant: string; defendant: string };
  spaces: { claimantPrivate: string; defendantPrivate: string; shared: string; record: string };
}

/** Runs SQL as the application role acting as `actor` (the way the API does). */
export async function actAs<T extends pg.QueryResultRow = pg.QueryResultRow>(db: TestDatabase, actor: string | null, sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: db.appUrl });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.user_id', $1, true)", [actor ?? ""]);
    const res = await c.query<T>(sql, params);
    await c.query("COMMIT");
    return res;
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await c.end();
  }
}

/**
 * A fictional case, built the way real users would build it: the claimant's solicitor
 * opens the case, staffs their side and invites the defendant's solicitor; the case is
 * linked to a court, whose registry assigns a judge.
 */
export async function seedCaseWorld(db: TestDatabase, tag = randomBytes(3).toString("hex")): Promise<CaseWorld> {
  const emails = Object.fromEntries(CASE_SUBJECTS.map((s) => [s, `${s.toLowerCase()}.${tag}@example.test`])) as Record<CaseSubject, string>;
  const ids = await asOwner(db, async (c) => {
    const users = {} as Record<CaseSubject, string>;
    for (const s of CASE_SUBJECTS) {
      users[s] = (await c.query<{ id: string }>(
        "INSERT INTO app.users (email, full_name, platform_role, status) VALUES ($1, $2, $3, 'active') RETURNING id",
        [emails[s], `Test ${s}`, s === "superAdmin" ? "super_admin" : "none"])).rows[0]!.id;
    }
    const org = async (name: string, type: string) =>
      (await c.query<{ id: string }>("INSERT INTO app.organisations (name, type) VALUES ($1, $2) RETURNING id", [name, type])).rows[0]!.id;
    const firmA = await org(`Claimant Firm ${tag} (fictional)`, "law_firm");
    const firmB = await org(`Defendant Firm ${tag} (fictional)`, "law_firm");
    const chambers = await org(`Chambers ${tag} (fictional)`, "chambers");
    const court = await org(`County Court ${tag} (fictional)`, "court");
    const member = (u: string, o: string, r = "member") =>
      c.query("INSERT INTO app.memberships (user_id, organisation_id, org_role, created_by) VALUES ($1, $2, $3, $4)", [u, o, r, users.superAdmin]);
    await member(users.claimantSolicitor, firmA);
    await member(users.claimantColleague, firmA);
    await member(users.defendantSolicitor, firmB);
    await member(users.claimantBarrister, chambers);
    await member(users.courtAdmin, court, "org_admin");
    await member(users.judge, court);
    return { users, firmA, firmB, court };
  });
  const { users } = ids;
  const caseId = (await actAs<{ id: string }>(db, users.claimantSolicitor,
    "SELECT app.create_case($1, $2, 'County Court at Exampletown', 'commercial', NULL, 'claimant', 'Acme Widgets Ltd (fictional)', 'organisation', 'Bloggs Builders Ltd (fictional)', 'organisation') AS id",
    [ids.firmA, `Acme v Bloggs ${tag}`])).rows[0]!.id;
  const sides = await asOwner(db, async (c) => {
    const r = await c.query<{ id: string; kind: string }>("SELECT id, kind FROM app.sides WHERE case_id = $1", [caseId]);
    return { claimant: r.rows.find((x) => x.kind === "claimant")!.id, defendant: r.rows.find((x) => x.kind === "defendant")!.id };
  });
  const add = (actor: string, user: string, role: string, side: string | null) =>
    actAs(db, actor, "INSERT INTO app.participants (case_id, user_id, case_role, side_id, added_by) VALUES ($1, $2, $3, $4, $5)",
      [caseId, user, role, side, actor]);
  await add(users.claimantSolicitor, users.claimantBarrister, "barrister", sides.claimant);
  await add(users.claimantSolicitor, users.claimantExpert, "expert", sides.claimant);
  await add(users.claimantSolicitor, users.claimantClient, "party", sides.claimant);
  await add(users.claimantSolicitor, users.defendantSolicitor, "solicitor", sides.defendant);
  await actAs(db, users.claimantSolicitor, "UPDATE app.cases SET court_organisation_id = $2 WHERE id = $1", [caseId, ids.court]);
  await add(users.courtAdmin, users.judge, "judge", null);
  const spaces = await asOwner(db, async (c) => {
    const r = await c.query<{ id: string; kind: string; side_id: string | null }>("SELECT id, kind, side_id FROM app.spaces WHERE case_id = $1", [caseId]);
    const find = (k: string, s: string | null) => r.rows.find((x) => x.kind === k && x.side_id === s)!.id;
    return { claimantPrivate: find("side_private", sides.claimant), defendantPrivate: find("side_private", sides.defendant), shared: find("shared", null), record: find("court_record", null) };
  });
  return { users, emails, firmA: ids.firmA, firmB: ids.firmB, court: ids.court, caseId, sides, spaces };
}
