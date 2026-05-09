import { performance } from "node:perf_hooks";
import request from "supertest";
import { createApp } from "../app.js";

type CheckResult = {
  name: string;
  passed: boolean;
  details: string;
};

type EndpointSample = {
  name: string;
  run: () => Promise<number>;
};

const LATENCY_P95_THRESHOLD_MS = Number(process.env.RELIABILITY_P95_THRESHOLD_MS ?? "250");
const UPTIME_SAMPLE_SIZE = Number(process.env.RELIABILITY_UPTIME_SAMPLE_SIZE ?? "100");
const LATENCY_SAMPLE_SIZE = Number(process.env.RELIABILITY_LATENCY_SAMPLE_SIZE ?? "20");

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

async function runLatencyProfile(): Promise<CheckResult> {
  const app = createApp();
  const adminHeaders = {
    "x-admin-role": "admin",
    "x-admin-token": process.env.ADMIN_REPORTS_API_TOKEN ?? "local-dev-reports-token"
  };

  const endpoints: EndpointSample[] = [
    {
      name: "GET /health",
      run: async () => {
        const start = performance.now();
        await request(app).get("/health").expect(200);
        return performance.now() - start;
      }
    },
    {
      name: "GET /api/admin/users",
      run: async () => {
        const start = performance.now();
        await request(app).get("/api/admin/users").expect(200);
        return performance.now() - start;
      }
    },
    {
      name: "GET /api/content/lessons",
      run: async () => {
        const start = performance.now();
        await request(app).get("/api/content/lessons").expect(200);
        return performance.now() - start;
      }
    },
    {
      name: "GET /api/reports/schemas",
      run: async () => {
        const start = performance.now();
        await request(app).get("/api/reports/schemas").set(adminHeaders).expect(200);
        return performance.now() - start;
      }
    }
  ];

  const summaries: string[] = [];
  for (const endpoint of endpoints) {
    const times: number[] = [];
    for (let i = 0; i < LATENCY_SAMPLE_SIZE; i += 1) {
      times.push(await endpoint.run());
    }
    const p95 = percentile(times, 95);
    summaries.push(`${endpoint.name} p95=${p95.toFixed(1)}ms`);
    if (p95 > LATENCY_P95_THRESHOLD_MS) {
      return {
        name: "Latency Profile",
        passed: false,
        details: `${endpoint.name} exceeded threshold (${p95.toFixed(1)}ms > ${LATENCY_P95_THRESHOLD_MS}ms)`
      };
    }
  }

  return {
    name: "Latency Profile",
    passed: true,
    details: summaries.join(" | ")
  };
}

async function runUptimeProbe(): Promise<CheckResult> {
  const app = createApp();
  let failed = 0;
  for (let i = 0; i < UPTIME_SAMPLE_SIZE; i += 1) {
    const response = await request(app).get("/health");
    if (response.status !== 200) failed += 1;
  }
  const errorRate = (failed / UPTIME_SAMPLE_SIZE) * 100;
  if (errorRate > 0) {
    return {
      name: "Uptime Probe",
      passed: false,
      details: `health probe failures=${failed}/${UPTIME_SAMPLE_SIZE} (${errorRate.toFixed(2)}%)`
    };
  }
  return {
    name: "Uptime Probe",
    passed: true,
    details: `health probe failures=${failed}/${UPTIME_SAMPLE_SIZE}`
  };
}

async function runOperationalReadinessChecks(): Promise<CheckResult> {
  const app = createApp();
  const checks: string[] = [];

  await withEnv(
    {
      ADMIN_DATA_PROVIDER: "hybrid",
      POSTGRES_URL: undefined,
      FIRESTORE_PROJECT_ID: undefined
    },
    async () => {
      const response = await request(app).get("/ready").expect(503);
      checks.push(`hybrid_no_provider=${response.status}`);
    }
  );

  await withEnv(
    {
      ADMIN_DATA_PROVIDER: "postgres",
      POSTGRES_URL: "postgres://invalid:invalid@127.0.0.1:1/invalid"
    },
    async () => {
      const response = await request(app).get("/ready").expect(503);
      checks.push(`postgres_unavailable=${response.status}`);
    }
  );

  await withEnv(
    {
      ADMIN_DATA_PROVIDER: "hybrid",
      ADMIN_FORCE_EMPTY_DATA: "true"
    },
    async () => {
      const response = await request(app).get("/api/admin/users").expect(200);
      const users = response.body.users as unknown[];
      checks.push(`forced_empty_users=${users.length}`);
    }
  );

  return {
    name: "Operational Readiness",
    passed: true,
    details: checks.join(" | ")
  };
}

async function runAccessControlCheck(): Promise<CheckResult> {
  const app = createApp();
  const unauthorized = await request(app).get("/api/reports/schemas").expect(403);
  if (unauthorized.status !== 403) {
    return {
      name: "Access Control",
      passed: false,
      details: `expected 403 for missing report auth, got ${unauthorized.status}`
    };
  }
  return {
    name: "Access Control",
    passed: true,
    details: "unauthorized report access blocked with 403"
  };
}

async function main() {
  const results: CheckResult[] = [];
  await withEnv({ ADMIN_FORCE_EMPTY_DATA: "true", ADMIN_DATA_PROVIDER: "hybrid" }, async () => {
    results.push(await runLatencyProfile());
  });
  results.push(await runUptimeProbe());
  results.push(await runOperationalReadinessChecks());
  results.push(await runAccessControlCheck());

  let failures = 0;
  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    if (!result.passed) failures += 1;
    console.log(`[${status}] ${result.name}: ${result.details}`);
  }

  if (failures > 0) {
    throw new Error(`Reliability validation failed (${failures} check(s) failed).`);
  }
  console.log("Reliability validation completed successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
