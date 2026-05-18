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
      sub: "config-user",
      role,
      iat: now,
      exp: now + 3600
    },
    secret
  );
}

async function seedPublishedContentDocument() {
  const secret = "test-secret";
  const editorToken = createToken("editor", secret);
  const adminToken = createToken("admin", secret);

  const created = await request(app)
    .post("/api/config/admin/content/documents")
    .set("Authorization", `Bearer ${editorToken}`)
    .send({
      key: "lesson.pricing.published",
      type: "lesson_content",
      title: "Pricing published",
      initialPayload: {
        title: "Pricing",
        body: { en: "Published body" }
      }
    })
    .expect(201);

  await request(app)
    .post("/api/config/admin/content/documents/lesson.pricing.published/publish")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      expectedDraftVersionId: created.body.draft.id
    })
    .expect(200);
}

test(
  "public bundle returns empty payload when no documents are published",
  { concurrency: false },
  async () => {
    configService.resetForTests();
    const response = await request(app).get("/api/config/public/bundle").expect(200);

    assert.equal(response.body.versionTag, "empty");
    assert.ok(Array.isArray(response.body.documents));
    assert.equal(response.body.documents.length, 0);
    assert.equal(
      response.headers["cache-control"],
      "public, max-age=60, stale-while-revalidate=300"
    );
    assert.equal(response.headers.etag, '"empty"');
  }
);

test(
  "public namespace endpoint returns published documents only",
  { concurrency: false },
  async () => {
    configService.resetForTests();
    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      await seedPublishedContentDocument();
    });

    const response = await request(app).get("/api/config/public/content").expect(200);
    assert.equal(response.body.documents.length, 1);
    assert.equal(response.body.documents[0].key, "lesson.pricing.published");
    assert.ok(typeof response.body.versionTag === "string");
  }
);

test("public key endpoint returns 404 when key is missing", { concurrency: false }, async () => {
  configService.resetForTests();
  await request(app).get("/api/config/public/content/missing.key").expect(404);
});

test("public endpoints support etag with 304 responses", { concurrency: false }, async () => {
  configService.resetForTests();
  await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
    await seedPublishedContentDocument();
  });

  const first = await request(app).get("/api/config/public/bundle").expect(200);
  const etag = String(first.headers.etag);
  assert.ok(etag.length > 0);

  await request(app).get("/api/config/public/bundle").set("If-None-Match", etag).expect(304);
});
