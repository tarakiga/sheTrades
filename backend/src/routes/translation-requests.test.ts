import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import { getConfigPlatformService } from "../config-platform/service.js";
import { getTranslationRequestService } from "../translation-requests/service.js";

const app = createApp();
const configService = getConfigPlatformService();
const translationRequestService = getTranslationRequestService();

// GAP-D1: translation requests are now persisted in Postgres (they used to sit
// in an in-memory Map and were lost whenever Cloud Run scaled to zero), so
// these are integration tests. Skip cleanly when no database is configured
// rather than failing with a connection error.
const skipWithoutDb = process.env.POSTGRES_URL
  ? false
  : "requires POSTGRES_URL (translation requests are DB-backed)";

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
      sub: "translator-admin",
      role,
      iat: now,
      exp: now + 3600
    },
    secret
  );
}

async function seedTranslationConfig() {
  const actor = { id: "seed-admin", role: "admin" as const };

  const lessonContent = await configService.createDocument(actor, {
    namespace: "content",
    key: "content.lesson.onboarding",
    type: "lesson_content",
    title: "Onboarding Lesson",
    initialPayload: {
      title: "Onboarding Lesson",
      languages: {
        en: "Welcome"
      }
    }
  });

  const uiCopyContent = await configService.createDocument(actor, {
    namespace: "content",
    key: "content.message.welcome",
    type: "ui_copy",
    title: "Welcome Message",
    initialPayload: {
      en: "Welcome to SheTrades"
    }
  });

  await configService.createDocument(actor, {
    namespace: "options",
    key: "options.settings.translation_request_methods",
    type: "option_set",
    title: "Translation Request Methods",
    initialPayload: {
      title: "Translation Request Methods",
      items: [
        {
          id: "method-internal",
          value: "internal_request",
          label: "Send Internal Request",
          enabled: true,
          sortOrder: 1,
          metadata: {}
        },
        {
          id: "method-integration",
          value: "integration_job",
          label: "Translate With Integration",
          enabled: true,
          sortOrder: 2,
          metadata: {}
        }
      ]
    }
  });

  await configService.createDocument(actor, {
    namespace: "options",
    key: "options.settings.translation_request_languages",
    type: "option_set",
    title: "Translation Request Languages",
    initialPayload: {
      title: "Translation Request Languages",
      items: [
        { id: "lang-en", value: "en", label: "English", enabled: true, sortOrder: 1, metadata: {} },
        { id: "lang-pcm", value: "pcm", label: "Pidgin", enabled: true, sortOrder: 2, metadata: {} }
      ]
    }
  });

  await configService.createDocument(actor, {
    namespace: "options",
    key: "options.settings.translation_request_priorities",
    type: "option_set",
    title: "Translation Request Priorities",
    initialPayload: {
      title: "Translation Request Priorities",
      items: [
        { id: "prio-low", value: "low", label: "Low", enabled: true, sortOrder: 1, metadata: {} },
        {
          id: "prio-normal",
          value: "normal",
          label: "Normal",
          enabled: true,
          sortOrder: 2,
          metadata: {}
        }
      ]
    }
  });

  return {
    lessonContentDocumentId: lessonContent.document.id,
    uiCopyContentDocumentId: uiCopyContent.document.id
  };
}

test(
  "translation request bootstrap returns managed content items and option sets",
  { skip: skipWithoutDb, concurrency: false },
  async () => {
    configService.resetForTests();
    await translationRequestService.resetForTests();

    const { lessonContentDocumentId } = await seedTranslationConfig();

    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      const token = createToken("editor", "test-secret");

      await request(app)
        .post("/api/content/admin/translation-requests")
        .set("Authorization", `Bearer ${token}`)
        .send({
          contentDocumentId: lessonContentDocumentId,
          method: "internal_request",
          targetLanguage: "pcm",
          priority: "normal",
          note: "Translate the welcome lesson next."
        })
        .expect(201);

      const response = await request(app)
        .get("/api/content/admin/translation-requests/bootstrap")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      assert.equal(response.body.actorRole, "editor");
      assert.equal(response.body.contentItems.length, 2);
      assert.ok(
        response.body.contentItems.some(
          (item: { title: string; key: string }) =>
            item.title === "Onboarding Lesson" && item.key === "content.lesson.onboarding"
        )
      );
      assert.equal(response.body.methodOptions[0].value, "internal_request");
      assert.equal(response.body.targetLanguageOptions[0].value, "en");
      assert.equal(response.body.priorityOptions[1].value, "normal");
      assert.equal(response.body.requests.length, 1);
      assert.equal(response.body.requests[0].contentKey, "content.lesson.onboarding");
      assert.equal(response.body.requests[0].method, "internal_request");
      assert.equal(response.body.requests[0].status, "pending");
    });
  }
);

test(
  "translation request create route rejects viewer role and invalid option values",
  { skip: skipWithoutDb, concurrency: false },
  async () => {
    configService.resetForTests();
    await translationRequestService.resetForTests();

    const { lessonContentDocumentId } = await seedTranslationConfig();

    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      const viewerToken = createToken("viewer", "test-secret");
      await request(app)
        .post("/api/content/admin/translation-requests")
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          contentDocumentId: lessonContentDocumentId,
          method: "internal_request",
          targetLanguage: "pcm",
          priority: "normal"
        })
        .expect(403);

      const editorToken = createToken("editor", "test-secret");
      const invalidResponse = await request(app)
        .post("/api/content/admin/translation-requests")
        .set("Authorization", `Bearer ${editorToken}`)
        .send({
          contentDocumentId: lessonContentDocumentId,
          method: "internal_request",
          targetLanguage: "fr",
          priority: "normal"
        })
        .expect(400);

      assert.match(String(invalidResponse.body.message), /target language/i);
    });
  }
);

test(
  "translation request create route queues integration jobs with method-aware status",
  { skip: skipWithoutDb, concurrency: false },
  async () => {
    configService.resetForTests();
    await translationRequestService.resetForTests();

    const { lessonContentDocumentId } = await seedTranslationConfig();

    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      const adminToken = createToken("admin", "test-secret");
      const response = await request(app)
        .post("/api/content/admin/translation-requests")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          contentDocumentId: lessonContentDocumentId,
          method: "integration_job",
          targetLanguage: "pcm",
          priority: "normal",
          note: "Send this through the translation integration."
        })
        .expect(201);

      assert.equal(response.body.request.method, "integration_job");
      assert.equal(response.body.request.status, "queued_for_integration");
      assert.equal(response.body.request.integrationState, "queued");
    });
  }
);

test(
  "translation completion writes lesson translations into a review draft and updates queue status",
  { skip: skipWithoutDb, concurrency: false },
  async () => {
    configService.resetForTests();
    await translationRequestService.resetForTests();

    const { lessonContentDocumentId } = await seedTranslationConfig();

    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      const editorToken = createToken("editor", "test-secret");
      const created = await request(app)
        .post("/api/content/admin/translation-requests")
        .set("Authorization", `Bearer ${editorToken}`)
        .send({
          contentDocumentId: lessonContentDocumentId,
          method: "internal_request",
          targetLanguage: "pcm",
          priority: "normal",
          note: "Translate this lesson for review."
        })
        .expect(201);

      const completion = await request(app)
        .post(`/api/content/admin/translation-requests/${created.body.request.id}/complete`)
        .set("Authorization", `Bearer ${editorToken}`)
        .send({
          translatedContent: "Welcome to the lesson in Pidgin.",
          completionNote: "Ready for editorial review."
        })
        .expect(200);

      assert.equal(completion.body.request.status, "ready_for_review");
      assert.equal(completion.body.request.reviewDraftVersionId, completion.body.draft.id);
      assert.equal(completion.body.request.completedBy, "translator-admin");
      assert.equal(completion.body.draft.payload.languages.pcm, "Welcome to the lesson in Pidgin.");
      assert.equal(completion.body.draft.payload.languages.en, "Welcome");
    });
  }
);

test(
  "translation completion writes ui copy translations into the draft payload root",
  { skip: skipWithoutDb, concurrency: false },
  async () => {
    configService.resetForTests();
    await translationRequestService.resetForTests();

    const { uiCopyContentDocumentId } = await seedTranslationConfig();

    await withEnv({ ADMIN_CONFIG_JWT_SECRET: "test-secret" }, async () => {
      const adminToken = createToken("admin", "test-secret");
      const created = await request(app)
        .post("/api/content/admin/translation-requests")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          contentDocumentId: uiCopyContentDocumentId,
          method: "integration_job",
          targetLanguage: "pcm",
          priority: "normal",
          note: "Translate this UI copy through the integration queue."
        })
        .expect(201);

      const completion = await request(app)
        .post(`/api/content/admin/translation-requests/${created.body.request.id}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          translatedContent: "Welcome to SheTrades for Pidgin users.",
          completionNote: "Imported from integration output."
        })
        .expect(200);

      assert.equal(completion.body.request.status, "ready_for_review");
      assert.equal(completion.body.request.integrationState, "completed");
      assert.equal(completion.body.draft.payload.en, "Welcome to SheTrades");
      assert.equal(completion.body.draft.payload.pcm, "Welcome to SheTrades for Pidgin users.");
    });
  }
);
