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
