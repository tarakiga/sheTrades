import { createApp } from "./app.js";
import { initializeAdminViews } from "./admin/prisma.js";
import { runMigrations } from "./config-platform/migrate.js";
import { ensureCacheInitialized } from "./config-platform/runtime-config.js";

try {
  await runMigrations();
} catch (error) {
  console.warn(
    "Startup migrations failed; continuing with in-memory config fallback.",
    error instanceof Error ? error.message : error
  );
}

try {
  await ensureCacheInitialized();
} catch (error) {
  console.warn(
    "Runtime config cache could not be warmed; continuing with in-memory fallback.",
    error instanceof Error ? error.message : error
  );
}

await initializeAdminViews();

const port = Number(process.env.PORT ?? 8080);
const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
