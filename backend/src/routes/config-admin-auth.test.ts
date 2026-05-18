import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import { getConfigPlatformService } from "../config-platform/service.js";

const app = createApp();
const configService = getConfigPlatformService();

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

test("config admin route returns 401 without bearer token", { concurrency: false }, async () => {
  configService.resetForTests();
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const response = await request(app).get("/api/config/admin/session").expect(401);
    assert.match(String(response.body.message), /Authorization bearer token/i);
  });
});

test(
  "config admin route returns 403 when role is insufficient",
  { concurrency: false },
  async () => {
    configService.resetForTests();
    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      const token = createToken("viewer", "test-secret");
      const response = await request(app)
        .post("/api/config/admin/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          namespace: "content",
          key: "lesson.intro",
          type: "lesson_content",
          title: "Intro lesson",
          initialPayload: {
            title: "Welcome",
            body: { en: "Welcome to SheTrades" }
          }
        })
        .expect(403);
      assert.match(String(response.body.message), /insufficient role/i);
    });
  }
);

test("config admin route returns actor session for valid JWT", { concurrency: false }, async () => {
  configService.resetForTests();
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const token = createToken("editor", "test-secret");
    const response = await request(app)
      .get("/api/config/admin/session")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    assert.equal(response.body.actor.id, "user-1");
    assert.equal(response.body.actor.role, "editor");
  });
});

test("config admin route validates payload and returns 400", { concurrency: false }, async () => {
  configService.resetForTests();
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const token = createToken("admin", "test-secret");
    const response = await request(app)
      .post("/api/config/admin/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        namespace: "content",
        key: "BAD KEY WITH SPACES",
        type: "lesson_content",
        title: "Broken",
        initialPayload: {
          title: "Broken",
          body: { en: "Broken" }
        }
      })
      .expect(400);

    assert.match(String(response.body.message), /Invalid config admin request payload/i);
    assert.ok(Array.isArray(response.body.details));
  });
});

test(
  "config admin route supports create -> draft update -> publish -> rollback workflow",
  { concurrency: false },
  async () => {
    configService.resetForTests();
    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      const editorToken = createToken("editor", "test-secret");
      const adminToken = createToken("admin", "test-secret");

      const createResponse = await request(app)
        .post("/api/config/admin/documents")
        .set("Authorization", `Bearer ${editorToken}`)
        .send({
          namespace: "content",
          key: "lesson.pricing.intro",
          type: "lesson_content",
          title: "Pricing intro",
          initialPayload: {
            title: "Pricing Basics",
            body: {
              en: "Draft v1"
            }
          }
        })
        .expect(201);

      const documentId = String(createResponse.body.document.id);

      const updateResponse = await request(app)
        .put(`/api/config/admin/documents/${documentId}/draft`)
        .set("Authorization", `Bearer ${editorToken}`)
        .send({
          payload: {
            title: "Pricing Basics",
            body: {
              en: "Draft v2"
            }
          },
          changeSummary: "Refresh onboarding copy"
        })
        .expect(200);

      const draftId = String(updateResponse.body.draft.id);

      const publishResponse = await request(app)
        .post(`/api/config/admin/documents/${documentId}/publish`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          expectedDraftVersionId: draftId,
          publishNote: "Approve copy update"
        })
        .expect(200);

      assert.equal(publishResponse.body.published.state, "published");

      const rollbackResponse = await request(app)
        .post(`/api/config/admin/documents/${documentId}/rollback`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          targetVersionId: publishResponse.body.published.id,
          rollbackReason: "Rollback verification"
        })
        .expect(200);

      assert.equal(rollbackResponse.body.published.state, "published");

      const history = await request(app)
        .get(`/api/config/admin/documents/${documentId}/history`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      assert.ok(Array.isArray(history.body.versions));
      assert.ok(Array.isArray(history.body.audit));
      assert.ok(history.body.versions.length >= 2);
      assert.ok(history.body.audit.length >= 3);
    });
  }
);

test("domain endpoint enforces namespace/type compatibility", { concurrency: false }, async () => {
  configService.resetForTests();
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const editorToken = createToken("editor", "test-secret");
    const response = await request(app)
      .post("/api/config/admin/options/documents")
      .set("Authorization", `Bearer ${editorToken}`)
      .send({
        key: "content.onboarding.title",
        type: "lesson_content",
        title: "Invalid",
        initialPayload: {
          title: "Invalid",
          body: { en: "Invalid" }
        }
      })
      .expect(409);

    assert.match(String(response.body.message), /not allowed/i);
  });
});

test("integration namespace is restricted to admins", { concurrency: false }, async () => {
  configService.resetForTests();
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const editorToken = createToken("editor", "test-secret");
    const response = await request(app)
      .get("/api/config/admin/integration/documents")
      .set("Authorization", `Bearer ${editorToken}`)
      .expect(403);

    assert.match(String(response.body.message), /integration settings/i);
  });
});

test("admin can create and publish integration config documents", { concurrency: false }, async () => {
  configService.resetForTests();
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const adminToken = createToken("admin", "test-secret");
    const created = await request(app)
      .post("/api/config/admin/integration/documents")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        key: "integration.whatsapp.primary",
        type: "integration_config",
        title: "Primary WhatsApp Integration",
        initialPayload: {
          title: "Primary WhatsApp Integration",
          provider: "meta_whatsapp_cloud",
          enabled: true,
          verifyToken: "verify-token",
          accessToken: "access-token",
          appSecret: "app-secret",
          phoneNumberId: "123456789",
          businessAccountId: "987654321",
          webhookPath: "/webhook/whatsapp",
          apiVersion: "v23.0",
          notes: "Primary managed WhatsApp config"
        }
      })
      .expect(201);

    assert.equal(created.body.document.namespace, "integration");
    assert.equal(created.body.document.type, "integration_config");

    const published = await request(app)
      .post("/api/config/admin/integration/documents/integration.whatsapp.primary/publish")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        expectedDraftVersionId: created.body.draft.id
      })
      .expect(200);

    assert.equal(published.body.published.state, "published");
  });
});

test(
  "domain endpoint supports history lookup by namespace and key",
  { concurrency: false },
  async () => {
    configService.resetForTests();
    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      const editorToken = createToken("editor", "test-secret");
      const adminToken = createToken("admin", "test-secret");

      const created = await request(app)
        .post("/api/config/admin/legal/documents")
        .set("Authorization", `Bearer ${editorToken}`)
        .send({
          key: "legal.privacy.notice",
          type: "legal_block",
          title: "Privacy notice",
          initialPayload: {
            title: "Privacy notice",
            body: { en: "Draft legal copy" },
            complianceTag: "privacy",
            effectiveFrom: "2026-01-01T00:00:00.000Z"
          }
        })
        .expect(201);

      await request(app)
        .post("/api/config/admin/legal/documents/legal.privacy.notice/publish")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          expectedDraftVersionId: created.body.draft.id
        })
        .expect(200);

      const history = await request(app)
        .get("/api/config/admin/legal/documents/legal.privacy.notice/history")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      assert.ok(Array.isArray(history.body.versions));
      assert.ok(Array.isArray(history.body.audit));
      assert.ok(history.body.versions.length >= 1);
    });
  }
);

test("domain endpoint supports hide then show again workflow", { concurrency: false }, async () => {
  configService.resetForTests();
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    const editorToken = createToken("editor", "test-secret");
    const adminToken = createToken("admin", "test-secret");

    const created = await request(app)
      .post("/api/config/admin/content/documents")
      .set("Authorization", `Bearer ${editorToken}`)
      .send({
        key: "content.welcome.message",
        type: "ui_copy",
        title: "Welcome message",
        initialPayload: {
          en: "Welcome to SheTrades"
        }
      })
      .expect(201);

    await request(app)
      .post("/api/config/admin/content/documents/content.welcome.message/publish")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        expectedDraftVersionId: created.body.draft.id
      })
      .expect(200);

    const archived = await request(app)
      .post("/api/config/admin/content/documents/content.welcome.message/archive")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        archiveReason: "Temporarily hide message"
      })
      .expect(200);

    assert.equal(archived.body.document.isActive, false);

    const reactivated = await request(app)
      .post("/api/config/admin/content/documents/content.welcome.message/reactivate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reactivateReason: "Show message again"
      })
      .expect(200);

    assert.equal(reactivated.body.document.isActive, true);
    assert.equal(reactivated.body.published.state, "published");
  });
});
