import pg from "pg";
import { asOwner, type TestDatabase } from "../src/testing";

export interface Fixture {
  superAdmin: string;
  orgA: string;
  orgB: string;
  adminA: string;
  memberA: string;
  adminB: string;
  outsider: string;
}

/** A small, fictional world: two firms, their admins and members, and one unaffiliated user. */
export async function seedWorld(db: TestDatabase): Promise<Fixture> {
  return asOwner(db, async (c) => {
    const user = async (email: string, role: "none" | "super_admin" = "none") =>
      (await c.query<{ id: string }>(
        "INSERT INTO app.users (email, full_name, platform_role, status) VALUES ($1, $2, $3, 'active') RETURNING id",
        [email, `Test ${email.split("@")[0]}`, role],
      )).rows[0]!.id;
    const org = async (name: string) =>
      (await c.query<{ id: string }>("INSERT INTO app.organisations (name, type) VALUES ($1, 'law_firm') RETURNING id", [name])).rows[0]!.id;
    const superAdmin = await user("super@example.test", "super_admin");
    const orgA = await org("Alpha LLP (fictional)");
    const orgB = await org("Beta & Co (fictional)");
    const adminA = await user("admin.a@example.test");
    const memberA = await user("member.a@example.test");
    const adminB = await user("admin.b@example.test");
    const outsider = await user("outsider@example.test");
    const member = (u: string, o: string, r: "org_admin" | "member") =>
      c.query("INSERT INTO app.memberships (user_id, organisation_id, org_role, created_by) VALUES ($1, $2, $3, $4)", [u, o, r, superAdmin]);
    await member(adminA, orgA, "org_admin");
    await member(memberA, orgA, "member");
    await member(adminB, orgB, "org_admin");
    return { superAdmin, orgA, orgB, adminA, memberA, adminB, outsider };
  });
}

/** Runs one query as the application role with the given user (or nobody). */
export async function asApp<T extends pg.QueryResultRow>(db: TestDatabase, actor: string | null, sql: string, params: unknown[] = []) {
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
