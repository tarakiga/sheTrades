import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

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

test("GET /api/admin/users returns users payload", { concurrency: false }, async () => {
  const response = await request(app).get("/api/admin/users").expect(200);
  assert.ok(Array.isArray(response.body.users));
});

test("GET /api/admin/analytics returns analytics payload", { concurrency: false }, async () => {
  const response = await request(app).get("/api/admin/analytics").expect(200);
  assert.equal(typeof response.body.registrationRate, "string");
  assert.equal(typeof response.body.completionRate, "string");
  assert.equal(typeof response.body.passRate, "string");
});

test("GET /api/admin/content returns content payload", { concurrency: false }, async () => {
  const response = await request(app).get("/api/admin/content").expect(200);
  assert.ok(Array.isArray(response.body.lessons));
});

test("GET /api/admin/rewards returns rewards payload", { concurrency: false }, async () => {
  const response = await request(app).get("/api/admin/rewards").expect(200);
  assert.ok(Array.isArray(response.body.rewards));
});

test("GET /api/admin/reports returns reports payload", { concurrency: false }, async () => {
  const response = await request(app).get("/api/admin/reports").expect(200);
  assert.ok(Array.isArray(response.body.exports));
});

test("returns 500 for invalid ADMIN_DATA_PROVIDER", { concurrency: false }, async () => {
  await withEnv({ ADMIN_DATA_PROVIDER: "invalid-provider" }, async () => {
    await request(app).get("/api/admin/users").expect(500);
  });
});

test("returns 500 for invalid SQL identifier mapping", { concurrency: false }, async () => {
  await withEnv(
    {
      ADMIN_DATA_PROVIDER: "postgres",
      PG_ADMIN_USERS_VIEW: "admin_users;DROP_TABLE",
      POSTGRES_URL: "postgres://invalid:invalid@127.0.0.1:1/invalid"
    },
    async () => {
      await request(app).get("/api/admin/users").expect(500);
    }
  );
});

test(
  "returns 500 for invalid SQL live analytics column mapping",
  { concurrency: false },
  async () => {
    await withEnv(
      {
        ADMIN_DATA_PROVIDER: "postgres",
        ADMIN_ANALYTICS_STRATEGY: "live",
        PG_USERS_ID_COLUMN: "user.id",
        POSTGRES_URL: "postgres://invalid:invalid@127.0.0.1:1/invalid"
      },
      async () => {
        await request(app).get("/api/admin/analytics").expect(500);
      }
    );
  }
);

test("returns 500 for invalid Firestore mapping", { concurrency: false }, async () => {
  await withEnv(
    {
      ADMIN_DATA_PROVIDER: "firestore",
      FS_ADMIN_USERS_COLLECTION: "admin/users"
    },
    async () => {
      await request(app).get("/api/admin/users").expect(500);
    }
  );
});

test(
  "returns 500 for invalid Firestore live analytics field mapping",
  { concurrency: false },
  async () => {
    await withEnv(
      {
        ADMIN_DATA_PROVIDER: "firestore",
        ADMIN_ANALYTICS_STRATEGY: "live",
        FS_LIVE_STARTED_FIELD: "progress/started"
      },
      async () => {
        await request(app).get("/api/admin/analytics").expect(500);
      }
    );
  }
);

test(
  "returns empty dataset when ADMIN_FORCE_EMPTY_DATA is true",
  { concurrency: false },
  async () => {
    await withEnv({ ADMIN_FORCE_EMPTY_DATA: "true" }, async () => {
      const response = await request(app).get("/api/admin/users").expect(200);
      assert.deepEqual(response.body.users, []);
    });
  }
);

test(
  "returns 500 on provider connection error in production mode",
  { concurrency: false },
  async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        ADMIN_DATA_PROVIDER: "postgres",
        POSTGRES_URL: "postgres://invalid:invalid@127.0.0.1:1/invalid"
      },
      async () => {
        await request(app).get("/api/admin/users").expect(500);
      }
    );
  }
);

test(
  "GET /ready returns 503 when required provider config is missing",
  { concurrency: false },
  async () => {
    await withEnv(
      {
        ADMIN_DATA_PROVIDER: "postgres",
        POSTGRES_URL: undefined
      },
      async () => {
        const response = await request(app).get("/ready").expect(503);
        assert.equal(response.body.ok, false);
        assert.equal(response.body.mode, "postgres");
      }
    );
  }
);

test(
  "GET /ready returns 503 in hybrid mode when no providers are configured",
  { concurrency: false },
  async () => {
    await withEnv(
      {
        ADMIN_DATA_PROVIDER: "hybrid",
        POSTGRES_URL: undefined,
        FIRESTORE_PROJECT_ID: undefined
      },
      async () => {
        const response = await request(app).get("/ready").expect(503);
        assert.equal(response.body.ok, false);
        assert.equal(response.body.mode, "hybrid");
      }
    );
  }
);
