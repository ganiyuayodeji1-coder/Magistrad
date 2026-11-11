/**
 * Creates the first Super Administrator as an *invited* account. They become active
 * the first time they sign in through the identity provider with that email (and MFA).
 *   SEED_SUPER_ADMIN_EMAIL=admin@example.test SEED_SUPER_ADMIN_NAME="Platform Admin" pnpm db:seed
 */
import pg from "pg";
import { loadRootEnv, requireEnv } from "../src/index";

loadRootEnv();
const email = requireEnv("SEED_SUPER_ADMIN_EMAIL").trim().toLowerCase();
const name = process.env.SEED_SUPER_ADMIN_NAME ?? "Platform Administrator";
const client = new pg.Client({ connectionString: requireEnv("DATABASE_OWNER_URL") });
await client.connect();
try {
  const { rowCount } = await client.query(
    `INSERT INTO app.users (email, full_name, platform_role, status)
     VALUES ($1, $2, 'super_admin', 'invited') ON CONFLICT (email) DO NOTHING`,
    [email, name],
  );
  console.log(rowCount ? `Invited super administrator ${email}.` : `${email} already exists; nothing changed.`);
} finally {
  await client.end();
}
