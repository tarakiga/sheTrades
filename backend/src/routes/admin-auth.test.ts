import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { getAdminAuthService } from "../auth/service.js";

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

test("admin auth login returns session token and user payload", { concurrency: false }, async () => {
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

test("admin auth rejects disabled bootstrap account", { concurrency: false }, async () => {
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

test("admin auth me and profile update work with session token", { concurrency: false }, async () => {
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

test("admin auth change-password rotates credentials", { concurrency: false }, async () => {
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

test("admin auth logout revokes session token", { concurrency: false }, async () => {
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

test("new session token is accepted by existing protected config routes", { concurrency: false }, async () => {
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
