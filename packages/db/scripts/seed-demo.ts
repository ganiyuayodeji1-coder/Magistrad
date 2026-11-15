/**
 * PREVIEW / DEMO DATA. Fills a development database with a fictional world: firms, a court,
 * and the case Acme Widgets Ltd v Bloggs Builders Ltd. Accounts are bound to the preview
 * sign-in. Refuses to run against a database whose name doesn't contain "preview" or "dev".
 */
import pg from "pg";
import { loadRootEnv, requireEnv } from "../src/index";

loadRootEnv();
const ownerUrl = requireEnv("DATABASE_OWNER_URL");
const appUrl = requireEnv("DATABASE_URL");
const dbName = new URL(ownerUrl).pathname.slice(1);
if (!/preview|dev/.test(dbName)) throw new Error(`Refusing to load demo data into "${dbName}" (name must contain "preview" or "dev").`);

const PEOPLE = [
  ["dev-super-admin", "admin@magistrad.test", "Morgan Platform", "super_admin"],
  ["dev-alpha-admin", "alice@alpha-llp.test", "Alice Admin", "none"],
  ["dev-claimant-sol", "grace@northgate.test", "Grace Northgate", "none"],
  ["dev-defendant-sol", "dave@defence-llp.test", "Dave Defence", "none"],
  ["dev-barrister", "eve@chambers.test", "Eve Counsel", "none"],
  ["dev-expert", "frank@experts.test", "Frank Expert", "none"],
  ["dev-judge", "judge.ray@court.test", "HHJ Ray", "none"],
  ["dev-registry", "registry@court.test", "Rita Registry", "none"],
] as const;

const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
const exists = await owner.query("SELECT 1 FROM app.users WHERE email = 'grace@northgate.test'");
if (exists.rowCount) {
  console.log("Demo data already present.");
  await owner.end();
  process.exit(0);
}
const id: Record<string, string> = {};
for (const [sub, email, name, role] of PEOPLE) {
  id[email] = (await owner.query<{ id: string }>(
    "INSERT INTO app.users (email, full_name, platform_role, status, idp_issuer, idp_subject) VALUES ($1, $2, $3, 'active', 'magistrad-preview', $4) RETURNING id",
    [email, name, role, sub])).rows[0]!.id;
}
const org = async (name: string, type: string) =>
  (await owner.query<{ id: string }>("INSERT INTO app.organisations (name, type) VALUES ($1, $2) RETURNING id", [name, type])).rows[0]!.id;
const member = (email: string, o: string, r = "member") =>
  owner.query("INSERT INTO app.memberships (user_id, organisation_id, org_role, created_by) VALUES ($1, $2, $3, $4)", [id[email], o, r, id["admin@magistrad.test"]]);
const alpha = await org("Alpha LLP (fictional)", "law_firm");
const northgate = await org("Northgate Solicitors (fictional)", "law_firm");
const defence = await org("Defence LLP (fictional)", "law_firm");
const chambers = await org("Exampletown Chambers (fictional)", "chambers");
const court = await org("County Court at Exampletown (fictional)", "court");
await member("alice@alpha-llp.test", alpha, "org_admin");
await member("grace@northgate.test", northgate, "org_admin");
await member("dave@defence-llp.test", defence, "org_admin");
await member("eve@chambers.test", chambers);
await member("judge.ray@court.test", court);
await member("registry@court.test", court, "org_admin");
await owner.end();

// The case is built through the application role, exactly as the app does it.
async function as<T extends pg.QueryResultRow>(email: string, sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: appUrl });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.user_id', $1, true)", [id[email]]);
    const r = await c.query<T>(sql, params);
    await c.query("COMMIT");
    return r;
  } finally {
    await c.end();
  }
}
const grace = "grace@northgate.test";
const caseId = (await as<{ id: string }>(grace,
  "SELECT app.create_case($1, 'Acme Widgets Ltd v Bloggs Builders Ltd (fictional)', 'County Court at Exampletown', 'commercial', NULL, 'claimant', 'Acme Widgets Ltd (fictional)', 'organisation', 'Bloggs Builders Ltd (fictional)', 'organisation') AS id",
  [northgate])).rows[0]!.id;
const sides = (await as<{ id: string; kind: string }>(grace, "SELECT id, kind FROM app.sides WHERE case_id = $1", [caseId])).rows;
const side = (k: string) => sides.find((s) => s.kind === k)!.id;
const add = async (actor: string, email: string, role: string, s: string | null, summary: string, privateToSide: boolean) => {
  await as(actor, "INSERT INTO app.participants (case_id, user_id, case_role, side_id, added_by) VALUES ($1, $2, $3, $4, $5)", [caseId, id[email], role, s, id[actor]]);
  await as(actor, "SELECT app.case_log($1, 'participant.added', $2, $3, $4, NULL)", [caseId, summary, privateToSide ? "side" : "case", privateToSide ? s : null]);
};
await add(grace, "eve@chambers.test", "barrister", side("claimant"), "Eve Counsel joined as barrister for the claimant", true);
await add(grace, "frank@experts.test", "expert", side("claimant"), "Frank Expert joined as expert for the claimant", true);
await add(grace, "dave@defence-llp.test", "solicitor", side("defendant"), "Dave Defence joined as solicitor for the defendant", false);
await as(grace, "UPDATE app.cases SET court_organisation_id = $2 WHERE id = $1", [caseId, court]);
await as(grace, "SELECT app.case_log($1, 'case.updated', 'Case details updated: case linked to a court on Magistrad', 'case', NULL, NULL)", [caseId]);
await add("registry@court.test", "judge.ray@court.test", "judge", null, "HHJ Ray joined as judge", false);
console.log("Demo data loaded: 8 fictional people, 5 organisations and the case Acme v Bloggs.");
