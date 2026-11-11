import { loadRootEnv, migrate, requireEnv } from "../src/index";

loadRootEnv();
const applied = await migrate(requireEnv("DATABASE_OWNER_URL"), console.log);
console.log(applied.length ? `${applied.length} migration(s) applied.` : "Database is up to date.");
