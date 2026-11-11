import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

/**
 * Applies migrations/*.sql in name order, each in its own transaction, as the owner role.
 * A checksum is stored per file; editing an applied migration is refused.
 */
export async function migrate(ownerUrl: string, log: (m: string) => void = () => {}): Promise<string[]> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Map(
      (await client.query<{ version: string; checksum: string }>("SELECT version, checksum FROM public.schema_migrations"))
        .rows.map((r) => [r.version, r.checksum]),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = done.get(file);
      if (previous) {
        if (previous !== checksum) throw new Error(`Migration ${file} was changed after being applied`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
      log(`applied ${file}`);
    }
    return applied;
  } finally {
    await client.end();
  }
}
