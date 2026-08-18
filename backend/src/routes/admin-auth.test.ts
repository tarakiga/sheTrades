import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { getAdminAuthService } from "../auth/service.js";
import { resetThrottleForTests } from "../auth/throttle-store.js";

const skipWithoutDb = process.env.POSTGRES_URL ? false : "requires POSTGRES_URL";

const app = createApp();
const authService = getAdminAuthService();

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

function bootstrapEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ADMIN_CONFIG_JWT_SECRET: "test-secret",
    ADMIN_AUTH_BOOTSTRAP_EMAIL: "admin@shetrades.test",
    ADMIN_AUTH_BOOTSTRAP_PASSWORD: "Password123!",
    ADMIN_AUTH_BOOTSTRAP_FULL_NAME: "Aisha Yusuf",
    ADMIN_AUTH_BOOTSTRAP_ROLE: "admin",
    ...overrides
  };
}

test("admin auth login returns session token and user payload", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await withEnv(bootstrapEnv(), async () => {
    const response = await request(app).post("/api/admin/auth/login").send({
      email: "admin@shetrades.test",
      password: "Password123!"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, "admin@shetrades.test");
    assert.equal(response.body.user.role, "admin");
    assert.equal(typeof response.body.session.token, "string");
    assert.match(String(response.body.message), /sign-in successful/i);
  });
});

test("admin auth rejects disabled bootstrap account", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await withEnv(bootstrapEnv({ ADMIN_AUTH_BOOTSTRAP_STATUS: "disabled" }), async () => {
    const response = await request(app).post("/api/admin/auth/login").send({
      email: "admin@shetrades.test",
      password: "Password123!"
    });

    assert.equal(response.status, 401);
    assert.match(String(response.body.message), /disabled/i);
  });
});

test("admin auth me and profile update work with session token", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await withEnv(bootstrapEnv(), async () => {
    const loginResponse = await request(app).post("/api/admin/auth/login").send({
      email: "admin@shetrades.test",
      password: "Password123!"
    });
    const token = String(loginResponse.body.session.token);

    const meResponse = await request(app)
      .get("/api/admin/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    assert.equal(meResponse.body.user.fullName, "Aisha Yusuf");
    assert.equal(meResponse.body.user.email, "admin@shetrades.test");

    const profileResponse = await request(app)
      .patch("/api/admin/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Aisha Yusuf Updated",
        avatarUrl: "https://example.com/avatar.png"
      })
      .expect(200);

    assert.equal(profileResponse.body.user.fullName, "Aisha Yusuf Updated");
    assert.equal(profileResponse.body.user.avatarUrl, "https://example.com/avatar.png");
  });
});

test("admin auth change-password rotates credentials", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await withEnv(bootstrapEnv(), async () => {
    const loginResponse = await request(app).post("/api/admin/auth/login").send({
      email: "admin@shetrades.test",
      password: "Password123!"
    });
    const token = String(loginResponse.body.session.token);

    await request(app)
      .post("/api/admin/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: "Password123!",
        newPassword: "Password456!"
      })
      .expect(200);

    const oldLogin = await request(app).post("/api/admin/auth/login").send({
      email: "admin@shetrades.test",
      password: "Password123!"
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await request(app).post("/api/admin/auth/login").send({
      email: "admin@shetrades.test",
      password: "Password456!"
    });
    assert.equal(newLogin.status, 200);
  });
});

test("admin auth logout revokes session token", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await withEnv(bootstrapEnv(), async () => {
    const loginResponse = await request(app).post("/api/admin/auth/login").send({
      email: "admin@shetrades.test",
      password: "Password123!"
    });
    const token = String(loginResponse.body.session.token);

    await request(app)
      .post("/api/admin/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const meResponse = await request(app)
      .get("/api/admin/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);

    assert.match(String(meResponse.body.message), /revoked|session/i);
  });
});

test("new session token is accepted by existing protected config routes", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await withEnv(bootstrapEnv(), async () => {
    const loginResponse = await request(app).post("/api/admin/auth/login").send({
      email: "admin@shetrades.test",
      password: "Password123!"
    });
    const token = String(loginResponse.body.session.token);

    const response = await request(app)
      .get("/api/config/admin/session")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    assert.equal(response.body.actor.role, "admin");
  });
});

// --- Login rate limiting (2026-08-18) --------------------------------------
// Before this, /auth/login could be guessed against indefinitely: no counter,
// no lockout. These lock in the behaviour that matters most - that the limiter
// actually stops attempts, that it recovers, and that it never becomes an
// account-enumeration oracle.

const throttleEnv = (overrides: Record<string, string | undefined> = {}) =>
  bootstrapEnv({
    AUTH_THROTTLE_MAX_FAILURES: "3",
    AUTH_THROTTLE_WINDOW_SECONDS: "900",
    AUTH_THROTTLE_LOCKOUT_SECONDS: "900",
    ...overrides
  });

async function attemptLogin(email: string, password: string) {
  return request(app).post("/api/admin/auth/login").send({ email, password });
}

test("login locks out after the configured failures and answers 429 + Retry-After", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await resetThrottleForTests();
  await withEnv(throttleEnv(), async () => {
    // Prime the bootstrap account.
    assert.equal((await attemptLogin("admin@shetrades.test", "Password123!")).status, 200);
    await resetThrottleForTests();

    for (let i = 0; i < 3; i++) {
      assert.equal((await attemptLogin("admin@shetrades.test", "wrong")).status, 401, `attempt ${i + 1} should be a plain 401`);
    }

    const locked = await attemptLogin("admin@shetrades.test", "wrong");
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers["retry-after"]) > 0, "Retry-After must be set");
    assert.equal(typeof locked.body.retryAfterSeconds, "number");

    // The lock must hold even against the CORRECT password - otherwise it
    // only throttles the attacker until they happen to get it right.
    const correctButLocked = await attemptLogin("admin@shetrades.test", "Password123!");
    assert.equal(correctButLocked.status, 429, "a valid password must not bypass an active lockout");
  });
  await resetThrottleForTests();
});

test("a successful login clears the failure count", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await resetThrottleForTests();
  await withEnv(throttleEnv(), async () => {
    assert.equal((await attemptLogin("admin@shetrades.test", "Password123!")).status, 200);
    await resetThrottleForTests();

    // Two failures, then success, then two more failures: still under the
    // threshold because the success wiped the slate.
    await attemptLogin("admin@shetrades.test", "wrong");
    await attemptLogin("admin@shetrades.test", "wrong");
    assert.equal((await attemptLogin("admin@shetrades.test", "Password123!")).status, 200);
    assert.equal((await attemptLogin("admin@shetrades.test", "wrong")).status, 401);
    assert.equal((await attemptLogin("admin@shetrades.test", "wrong")).status, 401, "counter did not reset on success");
  });
  await resetThrottleForTests();
});

test("throttling does not leak whether an account exists", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await resetThrottleForTests();
  await withEnv(throttleEnv(), async () => {
    assert.equal((await attemptLogin("admin@shetrades.test", "Password123!")).status, 200);
    await resetThrottleForTests();

    // An address that does not exist must throttle identically to one that
    // does; otherwise the 429 itself reveals which addresses are real.
    for (let i = 0; i < 3; i++) {
      const response = await attemptLogin("nobody@shetrades.test", "wrong");
      assert.equal(response.status, 401);
      assert.match(String(response.body.message), /invalid email or password/i);
    }
    const locked = await attemptLogin("nobody@shetrades.test", "wrong");
    assert.equal(locked.status, 429, "unknown addresses must lock out too");
  });
  await resetThrottleForTests();
});

test("throttling is per-account: locking one admin does not lock another", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await resetThrottleForTests();
  await withEnv(throttleEnv(), async () => {
    assert.equal((await attemptLogin("admin@shetrades.test", "Password123!")).status, 200);
    await resetThrottleForTests();

    for (let i = 0; i < 4; i++) await attemptLogin("someone-else@shetrades.test", "wrong");
    assert.equal((await attemptLogin("someone-else@shetrades.test", "wrong")).status, 429);

    // The real admin must still be able to sign in.
    assert.equal((await attemptLogin("admin@shetrades.test", "Password123!")).status, 200);
  });
  await resetThrottleForTests();
});

test("the throttle key is case- and whitespace-insensitive", { concurrency: false, skip: skipWithoutDb }, async () => {
  await authService.resetForTests();
  await resetThrottleForTests();
  await withEnv(throttleEnv(), async () => {
    assert.equal((await attemptLogin("admin@shetrades.test", "Password123!")).status, 200);
    await resetThrottleForTests();

    // Vary the casing each time - a naive key would treat these as four
    // separate buckets and never lock.
    await attemptLogin("Admin@SheTrades.test", "wrong");
    await attemptLogin("ADMIN@shetrades.TEST", "wrong");
    await attemptLogin("admin@shetrades.test", "wrong");
    const locked = await attemptLogin("AdMiN@sHeTrAdEs.tEsT", "wrong");
    assert.equal(locked.status, 429, "case variants must share one throttle bucket");
  });
  await resetThrottleForTests();
});
