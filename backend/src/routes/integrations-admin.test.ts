import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

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

function createToken(role: "admin" | "editor" | "viewer", secret: string) {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests(
    {
      sub: "user-1",
      role,
      iat: now,
      exp: now + 3600
    },
    secret
  );
}

test("integration admin test endpoint requires admin auth", { concurrency: false }, async () => {
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const editorToken = createToken("editor", "test-secret");
    const response = await request(app)
      .post("/api/integrations/admin/whatsapp/test")
      .set("Authorization", `Bearer ${editorToken}`)
      .send({
        config: {
          title: "Primary WhatsApp Integration",
          provider: "meta_whatsapp_cloud",
          enabled: true,
          verifyToken: "verify-token",
          accessToken: "access-token",
          phoneNumberId: "123456789",
          webhookPath: "/webhook/whatsapp",
          apiVersion: "v23.0",
          notes: ""
        }
      })
      .expect(403);

    assert.match(String(response.body.message), /insufficient role/i);
  });
});

test("integration admin test endpoint validates payloads", { concurrency: false }, async () => {
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const adminToken = createToken("admin", "test-secret");
    const response = await request(app)
      .post("/api/integrations/admin/notification/test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        config: {
          title: "SMTP Integration",
          provider: "smtp",
          enabled: true,
          host: "",
          port: 70000,
          secure: false,
          username: "",
          password: "",
          fromName: "",
          fromEmail: "not-an-email"
        }
      })
      .expect(400);

    assert.match(String(response.body.message), /Invalid integration connection test payload/i);
    assert.ok(Array.isArray(response.body.details));
  });
});
