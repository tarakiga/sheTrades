import { createApp } from "./app.js";
import { ensurePrismaTables, initializeAdminViews } from "./admin/prisma.js";
import { runMigrations } from "./config-platform/migrate.js";
import {
  ensureCacheInitialized,
  refreshRuntimeConfigCache
} from "./config-platform/runtime-config.js";

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

// Prisma tables must exist before initializeAdminViews creates VIEWs over them,
// and before the WhatsApp handler queries UserSession during /webhook/whatsapp.
await ensurePrismaTables();
await initializeAdminViews();

// Cross-instance staleness bound: a publish/promote refreshes the in-memory
// config cache only on the instance that served the request. When the service
// runs more than one instance, the others converge within this interval
// instead of serving stale lessons/branding until they recycle. 0 disables.
const refreshSeconds = Number(process.env.CONFIG_CACHE_REFRESH_SECONDS ?? "60");
if (Number.isFinite(refreshSeconds) && refreshSeconds > 0) {
  setInterval(() => {
    refreshRuntimeConfigCache().catch((error) => {
      console.warn(
        "Periodic config cache refresh failed; keeping the last good cache.",
        error instanceof Error ? error.message : error
      );
    });
  }, refreshSeconds * 1000).unref();
}

const port = Number(process.env.PORT ?? 8080);
const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
