import pg from "pg";

export const OWNER_ROLE = "magistrad_owner";
export const APP_ROLE = "magistrad_app";

const ident = (s: string) => pg.escapeIdentifier(s);
const literal = (s: string) => pg.escapeLiteral(s);

/**
 * Creates the two database roles and the database. Must run as a superuser
 * (or, on Azure, the server administrator). Idempotent.
 *
 * - owner: owns schema objects and runs migrations; never used by the running app.
 * - app:   what the API connects as; owns nothing, cannot bypass row-level security.
 */
export async function bootstrapDatabase(opts: {
  adminUrl: string;
  database: string;
  ownerPassword: string;
  appPassword: string;
}): Promise<void> {
  const admin = new pg.Client({ connectionString: opts.adminUrl });
  await admin.connect();
  try {
    // Roles are cluster-wide: serialise concurrent bootstraps (e.g. parallel test files).
    await admin.query("SELECT pg_advisory_lock(74201338)");
    for (const [role, password] of [[OWNER_ROLE, opts.ownerPassword], [APP_ROLE, opts.appPassword]] as const) {
      const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      const verb = exists.rowCount ? "ALTER" : "CREATE";
      await admin.query(
        `${verb} ROLE ${ident(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${literal(password)}`,
      );
    }
    const db = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [opts.database]);
    if (!db.rowCount) await admin.query(`CREATE DATABASE ${ident(opts.database)} OWNER ${ident(OWNER_ROLE)}`);
    await admin.query("SELECT pg_advisory_unlock(74201338)");
  } finally {
    await admin.end();
  }

  const url = new URL(opts.adminUrl);
  url.pathname = `/${opts.database}`;
  const inDb = new pg.Client({ connectionString: url.toString() });
  await inDb.connect();
  try {
    await inDb.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await inDb.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await inDb.query(`REVOKE ALL ON DATABASE ${ident(opts.database)} FROM PUBLIC`);
    await inDb.query(`GRANT CONNECT ON DATABASE ${ident(opts.database)} TO ${ident(APP_ROLE)}`);
  } finally {
    await inDb.end();
  }
}
