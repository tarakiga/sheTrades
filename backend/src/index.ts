import { createApp } from "./app.js";
import { runMigrations } from "./config-platform/migrate.js";
import { ensureCacheInitialized } from "./config-platform/runtime-config.js";

// Run config platform database migrations on boot if configured
await runMigrations();

// Initialize runtime config cache before booting Express
await ensureCacheInitialized();

const port = Number(process.env.PORT ?? 8080);
const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

