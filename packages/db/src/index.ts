import pg from "pg";

export { migrate } from "./migrator";
export { bootstrapDatabase, APP_ROLE, OWNER_ROLE } from "./roles";
export { loadRootEnv, requireEnv } from "./env";

export type Pool = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max, application_name: "magistrad-api" });
}

/**
 * Runs `fn` in a transaction where the database knows who is acting.
 * Every row-level security policy reads app.user_id; with `null` the database
 * treats the caller as nobody and every policy denies.
 */
export async function withActor<T>(pool: pg.Pool, actorId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT set_config('app.user_id', $1, true)", [actorId ?? ""]);
    const result = await fn(tx);
    await tx.query("COMMIT");
    return result;
  } catch (err) {
    await tx.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    tx.release();
  }
}

export interface AuditInput {
  action: string;
  outcome: "success" | "denied" | "failure";
  resourceType?: string | null;
  resourceId?: string | null;
  organisationId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Only used when no user is signed in (e.g. a failed sign-in for a known account). */
  actorId?: string | null;
}

/** Appends to the hash-chained audit log, inside the caller's transaction. */
export async function appendAudit(tx: Tx, e: AuditInput): Promise<number> {
  const { rows } = await tx.query<{ seq: string }>(
    "SELECT app.audit_append($1, $2, $3, $4, $5, $6, $7, $8) AS seq",
    [e.action, e.outcome, e.resourceType ?? null, e.resourceId ?? null, e.organisationId ?? null,
      e.ipAddress ?? null, e.metadata ? JSON.stringify(e.metadata) : null, e.actorId ?? null],
  );
  return Number(rows[0]!.seq);
}

/** Postgres "insufficient privilege" — raised by policies, guards and definer functions. */
export const isPermissionError = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && ((err as { code: string }).code === "42501");
