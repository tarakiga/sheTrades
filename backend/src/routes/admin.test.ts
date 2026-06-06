import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import { setRuntimeIntegrationConfigForTests } from "../config-platform/runtime-config.js";

process.env.ADMIN_CONFIG_JWT_SECRET = process.env.ADMIN_CONFIG_JWT_SECRET ?? "test-secret";

const app = createApp();

function createToken(role: "admin" | "editor" | "viewer", secret: string) {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests({ sub: "user-1", role, iat: now, exp: now + 3600 }, secret);
}

const ADMIN_TOKEN = createToken("admin", process.env.ADMIN_CONFIG_JWT_SECRET!);

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

test("GET /api/admin/users without a token returns 401", async () => {
  await request(app).get("/api/admin/users").expect(401);
});

test("GET /api/admin/users returns users payload", { concurrency: false }, async () => {
  const response = await request(app)
    .get("/api/admin/users")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .expect(200);
  assert.ok(Array.isArray(response.body.users));
});

test("GET /api/admin/analytics returns analytics payload", { concurrency: false }, async () => {
  const response = await request(app)
    .get("/api/admin/analytics")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .expect(200);
  assert.equal(typeof response.body.registrationRate, "string");
  assert.equal(typeof response.body.completionRate, "string");
  assert.equal(typeof response.body.passRate, "string");
});

test("GET /api/admin/content returns content payload", { concurrency: false }, async () => {
  const response = await request(app)
    .get("/api/admin/content")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .expect(200);
  assert.ok(Array.isArray(response.body.lessons));
});

test("GET /api/admin/rewards returns rewards payload", { concurrency: false }, async () => {
  const response = await request(app)
    .get("/api/admin/rewards")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .expect(200);
  assert.ok(Array.isArray(response.body.rewards));
});

test(
  "GET /api/admin/rewards returns meta.activeProvider null when no payouts config published",
  { concurrency: false },
  async () => {
    setRuntimeIntegrationConfigForTests("integration.payouts.primary", null);
    const response = await request(app)
      .get("/api/admin/rewards")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .expect(200);
    assert.equal(response.body.meta.activeProvider, null);
  }
);

test(
  "GET /api/admin/rewards returns meta.activeProvider populated when payouts config is published",
  { concurrency: false },
  async () => {
    setRuntimeIntegrationConfigForTests("integration.payouts.primary", {
      provider: "africas_talking",
      sandbox: true,
      africasTalking: { username: "u", apiKey: "k" },
      defaults: { currency: "NGN", channel: "airtime" }
    });
    try {
      const response = await request(app)
        .get("/api/admin/rewards")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      assert.deepEqual(response.body.meta.activeProvider, {
        key: "africas_talking",
        sandbox: true
      });
    } finally {
      setRuntimeIntegrationConfigForTests("integration.payouts.primary", null);
    }
  }
);

test(
  "GET /api/admin/rewards?status=Pending accepts and forwards the status filter",
  { concurrency: false },
  async () => {
    // Smoke: confirm the route accepts the filter and returns 200 with rewards/meta shape.
    setRuntimeIntegrationConfigForTests("integration.payouts.primary", null);
    const response = await request(app)
      .get("/api/admin/rewards?status=Pending")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .expect(200);
    assert.ok(Array.isArray(response.body.rewards));
    assert.ok(response.body.meta);
  }
);

test("GET /api/admin/reports returns reports payload", { concurrency: false }, async () => {
  const response = await request(app)
    .get("/api/admin/reports")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .expect(200);
  assert.ok(Array.isArray(response.body.exports));
});

test("returns 500 for invalid ADMIN_DATA_PROVIDER", { concurrency: false }, async () => {
  await withEnv({ ADMIN_DATA_PROVIDER: "invalid-provider" }, async () => {
    await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .expect(500);
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
      await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .expect(500);
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
        await request(app)
          .get("/api/admin/analytics")
          .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
          .expect(500);
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
      await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .expect(500);
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
        await request(app)
          .get("/api/admin/analytics")
          .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
          .expect(500);
      }
    );
  }
);

test(
  "returns empty dataset when ADMIN_FORCE_EMPTY_DATA is true",
  { concurrency: false },
  async () => {
    await withEnv({ ADMIN_FORCE_EMPTY_DATA: "true" }, async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
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
        await request(app)
          .get("/api/admin/users")
          .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
          .expect(500);
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

test(
  "POST /api/admin/rewards/:id/retry rejects when reward not found",
  { concurrency: false },
  async () => {
    const fakeId = "00000000-0000-4000-8000-000000000000";
    await request(app)
      .post(`/api/admin/rewards/${fakeId}/retry`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .expect(404);
  }
);

test(
  "POST /api/admin/rewards/:id/mark-issued rejects body with short note",
  { concurrency: false },
  async () => {
    const fakeId = "00000000-0000-4000-8000-000000000001";
    // Validation should fire before the existence check (Zod first).
    const response = await request(app)
      .post(`/api/admin/rewards/${fakeId}/mark-issued`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ note: "short" })
      .expect(400);
    assert.match(response.body.message, /at least 10/);
  }
);

test(
  "POST /api/admin/rewards/manual rejects body with missing userId",
  { concurrency: false },
  async () => {
    const response = await request(app)
      .post("/api/admin/rewards/manual")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ amount: 500, note: "one-time discretionary payout for completion" })
      .expect(400);
    assert.ok(response.body.message);
  }
);

test(
  "GET /api/admin/rewards/export returns CSV with the expected columns",
  { concurrency: false },
  async () => {
    const response = await request(app)
      .get("/api/admin/rewards/export")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .expect(200);
    assert.match(response.headers["content-type"] ?? "", /text\/csv/);
    assert.match(
      response.headers["content-disposition"] ?? "",
      /attachment; filename="rewards-/
    );
    const lines = response.text.split("\n");
    assert.equal(
      lines[0],
      "Learner,Phone,Module,Amount,Currency,Channel,Status,Created (UTC),Issued (UTC),Provider Txn ID,Failure Reason,Actor Note"
    );
  }
);

test(
  "POST /api/admin/rewards/manual rejects when amount is zero",
  { concurrency: false },
  async () => {
    const response = await request(app)
      .post("/api/admin/rewards/manual")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({
        userId: "00000000-0000-4000-8000-000000000002",
        amount: 0,
        note: "valid length note for the request"
      })
      .expect(400);
    assert.ok(response.body.message);
  }
);

test("GET /api/admin/users/:phone returns 404 for unknown learner", async () => {
  await request(app)
    .get("/api/admin/users/%2B234000000nope")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .expect(404);
});

test("GET /api/admin/users/export returns CSV with the expected header", async () => {
  const res = await request(app)
    .get("/api/admin/users/export")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .expect(200);
  assert.match(res.headers["content-type"] ?? "", /text\/csv/);
  assert.match(res.headers["content-disposition"] ?? "", /attachment; filename="users-/);
  const firstLine = res.text.split("\n")[0];
  assert.equal(firstLine, "Name,Phone,Location,Language,Completion,Status,Flagged,Follow-up Note");
});

test("POST /api/admin/users/:phone/flag returns 404 for unknown learner", async () => {
  await request(app)
    .post("/api/admin/users/%2B234000nope/flag")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .send({ flagged: true })
    .expect(404);
});

const VIEWER_TOKEN = createToken("viewer", process.env.ADMIN_CONFIG_JWT_SECRET as string);

test("POST /api/admin/rewards/manual with a viewer token returns 403", async () => {
  await request(app)
    .post("/api/admin/rewards/manual")
    .set("Authorization", `Bearer ${VIEWER_TOKEN}`)
    .send({ phone: "+2340000000000", amount: 500, note: "viewer should be blocked" })
    .expect(403);
});

test("POST /api/admin/users/:phone/flag with a viewer token returns 403", async () => {
  await request(app)
    .post("/api/admin/users/+2340000000000/flag")
    .set("Authorization", `Bearer ${VIEWER_TOKEN}`)
    .send({ flagged: true })
    .expect(403);
});
