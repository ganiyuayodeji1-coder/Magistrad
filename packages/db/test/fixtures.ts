import pg from "pg";
import { seedWorld as seedWorldShared, type TestDatabase, type World } from "../src/testing";

export type Fixture = World;
export const seedWorld = (db: TestDatabase) => seedWorldShared(db);

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
