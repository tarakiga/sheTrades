/**
 * Prepares a Postgres database for the backend test suite by running the same
 * schema bootstrap the server performs at startup (see index.ts):
 *   - ensurePrismaTables()  — creates the Prisma-managed tables
 *   - initializeAdminViews() — creates the admin_users_view over them
 *   - runMigrations()        — creates the config-platform tables
 *
 * Used by CI (.github/workflows/ci.yml) before `npm run test:ci`. Requires
 * POSTGRES_URL to point at a reachable database.
 */
import { ensurePrismaTables, initializeAdminViews } from "../admin/prisma.js";
import { runMigrations } from "../config-platform/migrate.js";

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL must be set to set up the test database.");
  }
  await ensurePrismaTables();
  await initializeAdminViews();
  await runMigrations();
  // eslint-disable-next-line no-console
  console.log("Test database schema is ready.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to set up the test database:", error);
    process.exit(1);
  });
