import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/** Loads the single repo-root .env (if present). Real environments set variables directly. */
export function loadRootEnv(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  config({ path: path.join(root, ".env"), quiet: true });
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
