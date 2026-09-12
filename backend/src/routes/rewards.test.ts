import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import { resetRewardServiceState } from "../rewards/service.js";
import { resetLearningEngineState } from "../learning/engine.js";

const skipWithoutDb = process.env.POSTGRES_URL ? false : "requires POSTGRES_URL";

// These routes went behind authenticateJwt in the August hardening. The
// tests are database-only, so they were skipped on every developer machine
// and never ran in CI - nobody saw them start failing. Sign the same kind of
// token the console sends.
process.env.ADMIN_CONFIG_JWT_SECRET = process.env.ADMIN_CONFIG_JWT_SECRET ?? "test-secret";
const now = Math.floor(Date.now() / 1000);
const BEARER = `Bearer ${signJwtHs256ForTests(
  { sub: "test-operator", role: "admin", iat: now, exp: now + 3600 },
  process.env.ADMIN_CONFIG_JWT_SECRET
)}`;

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

test("POST /api/rewards/issue supports manual issuance", { skip: skipWithoutDb }, async () => {
  resetRewardServiceState();
  const response = await request(app)
    .post("/api/rewards/issue").set("Authorization", BEARER)
    .send({
      issueId: "manual-1",
      phone: "+234800001201",
      moduleId: 1,
      amount: 200,
      mode: "manual",
      channel: "airtime_api",
      reason: "admin_manual_approval"
    })
    .expect(200);

  assert.equal(response.body.status, "issued");
  assert.equal(response.body.reward.mode, "manual");
  assert.equal(response.body.reward.status, "issued");
});

test("POST /api/rewards/issue is idempotent by issue id", { skip: skipWithoutDb }, async () => {
  resetRewardServiceState();
  const payload = {
    issueId: "manual-2",
    phone: "+234800001202",
    moduleId: 2,
    amount: 300,
    mode: "manual",
    channel: "airtime_api"
  };

  const first = await request(app).post("/api/rewards/issue").set("Authorization", BEARER).send(payload).expect(200);
  const second = await request(app).post("/api/rewards/issue").set("Authorization", BEARER).send(payload).expect(200);

  assert.equal(first.body.status, "issued");
  assert.equal(second.body.status, "duplicate");
  assert.equal(second.body.reward.issueId, "manual-2");
});

test("POST /api/rewards/issue retries transient provider failure", { skip: skipWithoutDb }, async () => {
  resetRewardServiceState();
  await withEnv({ REWARD_PROVIDER_MODE: "flaky_once", REWARD_RETRY_ATTEMPTS: "3" }, async () => {
    const response = await request(app)
      .post("/api/rewards/issue").set("Authorization", BEARER)
      .send({
        issueId: "manual-3",
        phone: "+234800001203",
        moduleId: 1,
        mode: "manual",
        channel: "airtime_api"
      })
      .expect(200);

    assert.equal(response.body.status, "issued");
    assert.equal(response.body.reward.attempts, 2);
  });
});

test("POST /api/rewards/issue returns failed status with audit trail on persistent failure", { skip: skipWithoutDb }, async () => {
  resetRewardServiceState();
  await withEnv({ REWARD_PROVIDER_MODE: "always_fail", REWARD_RETRY_ATTEMPTS: "2" }, async () => {
    const response = await request(app)
      .post("/api/rewards/issue").set("Authorization", BEARER)
      .send({
        issueId: "manual-4",
        phone: "+234800001204",
        moduleId: 3,
        mode: "manual",
        channel: "airtime_api"
      })
      .expect(200);

    assert.equal(response.body.status, "failed");
    assert.equal(response.body.reward.status, "failed");
    assert.equal(response.body.reward.attempts, 2);

    const audit = await request(app)
      .get("/api/rewards/audit").set("Authorization", BEARER)
      .query({ phone: "+234800001204" })
      .expect(200);
    assert.ok(Array.isArray(audit.body.audit));
    assert.ok(audit.body.audit.some((entry: { status?: string }) => entry.status === "failed"));
  });
});

test("POST /api/progress triggers automated reward issuance on module pass", { skip: skipWithoutDb }, async () => {
  resetLearningEngineState();
  resetRewardServiceState();
  const phone = "+234800001205";

  await request(app)
    .post("/api/progress").set("Authorization", BEARER)
    .send({
      phone,
      updateId: "auto-1",
      event: { type: "lesson_completed", moduleId: 1, lessonId: 1 }
    })
    .expect(200);
  await request(app)
    .post("/api/progress").set("Authorization", BEARER)
    .send({
      phone,
      updateId: "auto-2",
      event: { type: "lesson_completed", moduleId: 1, lessonId: 2 }
    })
    .expect(200);
  await request(app)
    .post("/api/progress").set("Authorization", BEARER)
    .send({
      phone,
      updateId: "auto-3",
      event: { type: "lesson_completed", moduleId: 1, lessonId: 3 }
    })
    .expect(200);
  await request(app)
    .post("/api/progress").set("Authorization", BEARER)
    .send({
      phone,
      updateId: "auto-4",
      event: {
        type: "quiz_submitted",
        moduleId: 1,
        selectedAnswers: [0, 1, 2],
        answerKey: [0, 1, 2]
      }
    })
    .expect(200);

  const rewards = await request(app)
    .get(`/api/rewards/${encodeURIComponent(phone)}`)
    .set("Authorization", BEARER)
    .expect(200);
  assert.ok(Array.isArray(rewards.body.rewards));
  assert.ok(
    rewards.body.rewards.some((r: { mode?: string; status?: string }) => r.mode === "automated")
  );
  assert.ok(rewards.body.rewards.some((r: { status?: string }) => r.status === "issued"));
});
