import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";

type ProviderMode = "postgres" | "firestore";

type SmokeConfig = {
  runPostgres: boolean;
  runFirestore: boolean;
  analyticsStrategy: "snapshot" | "live";
  requireReady: boolean;
};

function requiredEnvForMode(mode: ProviderMode) {
  if (mode === "postgres") {
    return ["POSTGRES_URL"];
  }
  return ["FIRESTORE_PROJECT_ID"];
}

function assertModePrerequisites(mode: ProviderMode) {
  const missing = requiredEnvForMode(mode).filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[${mode}] missing required env variable(s): ${missing.join(", ")}. ` +
        `Set required provider connectivity env before running smoke.`
    );
  }
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function getSmokeConfig(): SmokeConfig {
  const strategyRaw = process.env.SMOKE_ANALYTICS_STRATEGY;
  if (strategyRaw && strategyRaw !== "snapshot" && strategyRaw !== "live") {
    throw new Error("Invalid SMOKE_ANALYTICS_STRATEGY. Use snapshot | live.");
  }
  const analyticsStrategy: "snapshot" | "live" = strategyRaw === "snapshot" ? "snapshot" : "live";

  return {
    runPostgres: parseBooleanEnv(process.env.SMOKE_RUN_POSTGRES, true),
    runFirestore: parseBooleanEnv(process.env.SMOKE_RUN_FIRESTORE, true),
    analyticsStrategy,
    requireReady: parseBooleanEnv(process.env.SMOKE_REQUIRE_READY, true)
  };
}

async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(env)) {
      const previousValue = previous[key];
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

function selectedModes(config: SmokeConfig): ProviderMode[] {
  const modes: ProviderMode[] = [];
  if (config.runPostgres) modes.push("postgres");
  if (config.runFirestore) modes.push("firestore");
  return modes;
}

function assertAnalyticsShape(body: Record<string, unknown>) {
  assert.equal(typeof body.registrationRate, "string");
  assert.equal(typeof body.completionRate, "string");
  assert.equal(typeof body.passRate, "string");
  assert.equal(typeof body.funnelOverall, "string");
}

async function smokeMode(
  app: ReturnType<typeof createApp>,
  mode: ProviderMode,
  analyticsStrategy: "snapshot" | "live",
  requireReady: boolean
) {
  assertModePrerequisites(mode);

  await withEnv(
    {
      ADMIN_DATA_PROVIDER: mode,
      ADMIN_ANALYTICS_STRATEGY: analyticsStrategy,
      NODE_ENV: "production"
    },
    async () => {
      const readiness = await request(app).get("/ready");
      if (requireReady) {
        if (readiness.status !== 200) {
          const payload = JSON.stringify(readiness.body);
          throw new Error(
            `[${mode}] /ready expected 200 but received ${readiness.status}. payload=${payload}`
          );
        }
      }

      const users = await request(app).get("/api/admin/users");
      assert.equal(users.status, 200, `[${mode}] /api/admin/users failed`);
      assert.ok(Array.isArray(users.body.users), `[${mode}] users payload is invalid`);

      const analytics = await request(app).get("/api/admin/analytics");
      assert.equal(analytics.status, 200, `[${mode}] /api/admin/analytics failed`);
      assertAnalyticsShape(analytics.body as Record<string, unknown>);

      const content = await request(app).get("/api/admin/content");
      assert.equal(content.status, 200, `[${mode}] /api/admin/content failed`);
      assert.ok(Array.isArray(content.body.lessons), `[${mode}] content payload is invalid`);

      const rewards = await request(app).get("/api/admin/rewards");
      assert.equal(rewards.status, 200, `[${mode}] /api/admin/rewards failed`);
      assert.ok(Array.isArray(rewards.body.rewards), `[${mode}] rewards payload is invalid`);

      const reports = await request(app).get("/api/admin/reports");
      assert.equal(reports.status, 200, `[${mode}] /api/admin/reports failed`);
      assert.ok(Array.isArray(reports.body.exports), `[${mode}] reports payload is invalid`);

      console.log(
        `[smoke] mode=${mode} strategy=${analyticsStrategy} ready=${readiness.status} endpoints=ok`
      );
    }
  );
}

async function main() {
  const config = getSmokeConfig();
  const modes = selectedModes(config);
  if (modes.length === 0) {
    throw new Error(
      "No smoke mode selected. Set SMOKE_RUN_POSTGRES or SMOKE_RUN_FIRESTORE to true."
    );
  }

  const app = createApp();
  for (const mode of modes) {
    await smokeMode(app, mode, config.analyticsStrategy, config.requireReady);
  }

  console.log("[smoke] staging provider smoke checks passed");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke] failed: ${message}`);
  process.exitCode = 1;
});
