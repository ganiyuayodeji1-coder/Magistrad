import { bootstrapDatabase, loadRootEnv, requireEnv } from "../src/index";

loadRootEnv();
await bootstrapDatabase({
  adminUrl: requireEnv("DATABASE_ADMIN_URL"),
  database: requireEnv("DATABASE_NAME"),
  ownerPassword: requireEnv("DATABASE_OWNER_PASSWORD"),
  appPassword: requireEnv("DATABASE_APP_PASSWORD"),
});
console.log("Roles and database are ready.");
