import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { getConfigPlatformService } from "../config-platform/service.js";
import { resetWhatsAppState } from "../whatsapp/handler.js";
import { refreshRuntimeConfigCache } from "../config-platform/runtime-config.js";

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

function makeWebhookPayload(messageId: string, from: string, body: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: messageId,
                  from,
                  text: { body }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

test("GET /webhook/whatsapp verifies webhook challenge", { concurrency: false }, async () => {
  resetWhatsAppState();
  configService.resetForTests();
  await withEnv({ WHATSAPP_VERIFY_TOKEN: "abc123" }, async () => {
    const response = await request(app)
      .get("/webhook/whatsapp")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "abc123",
        "hub.challenge": "challenge-token"
      })
      .expect(200);

    assert.equal(response.text, "challenge-token");
  });
});

test(
  "GET /webhook/whatsapp uses published integration config before env fallback",
  { concurrency: false },
  async () => {
    resetWhatsAppState();
    configService.resetForTests();

    const created = await configService.createDocument(
      { id: "admin-1", role: "admin" },
      {
        namespace: "integration",
        key: "integration.whatsapp.primary",
        type: "integration_config",
        title: "Primary WhatsApp Integration",
        initialPayload: {
          title: "Primary WhatsApp Integration",
          provider: "meta_whatsapp_cloud",
          enabled: true,
          verifyToken: "managed-token",
          accessToken: "access-token",
          appSecret: "app-secret",
          phoneNumberId: "123456789",
          businessAccountId: "987654321",
          webhookPath: "/webhook/whatsapp",
          apiVersion: "v23.0",
          notes: ""
        }
      }
    );
    await configService.publishDocument(
      { id: "admin-1", role: "admin" },
      created.document.id,
      { expectedDraftVersionId: created.draft.id }
    );
    await refreshRuntimeConfigCache();

    await withEnv({ WHATSAPP_VERIFY_TOKEN: "env-token" }, async () => {
      const response = await request(app)
        .get("/webhook/whatsapp")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "managed-token",
          "hub.challenge": "challenge-token"
        })
        .expect(200);

      assert.equal(response.text, "challenge-token");
    });
  }
);

test("POST /webhook/whatsapp transitions onboarding to language step", async () => {
  resetWhatsAppState();
  configService.resetForTests();
  const response = await request(app)
    .post("/webhook/whatsapp")
    .send(makeWebhookPayload("m1", "+234800000001", "Amaka Obi"))
    .expect(200);

  assert.equal(response.body.status, "processed");
  assert.equal(response.body.state, "awaiting_language");
  assert.match(String(response.body.reply), /Choose language/i);
});

test("POST /webhook/whatsapp applies language and routes to main menu", async () => {
  resetWhatsAppState();
  configService.resetForTests();
  await request(app)
    .post("/webhook/whatsapp")
    .send(makeWebhookPayload("m1", "+234800000002", "Ruth Okon"))
    .expect(200);

  const response = await request(app)
    .post("/webhook/whatsapp")
    .send(makeWebhookPayload("m2", "+234800000002", "2"))
    .expect(200);

  assert.equal(response.body.status, "processed");
  assert.equal(response.body.state, "main_menu");
  assert.match(String(response.body.reply), /Main Menu/i);
  assert.match(String(response.body.reply), /Language set: Pidgin/i);
});

test("POST /webhook/whatsapp ignores duplicate message ids", async () => {
  resetWhatsAppState();
  configService.resetForTests();
  await request(app)
    .post("/webhook/whatsapp")
    .send(makeWebhookPayload("dup-1", "+234800000003", "Ifeoma"))
    .expect(200);

  const duplicate = await request(app)
    .post("/webhook/whatsapp")
    .send(makeWebhookPayload("dup-1", "+234800000003", "3"))
    .expect(200);

  assert.equal(duplicate.body.status, "duplicate");
  assert.equal(duplicate.body.state, "awaiting_language");
});

test("POST /webhook/whatsapp returns ignored for unsupported payload", async () => {
  resetWhatsAppState();
  configService.resetForTests();
  const response = await request(app)
    .post("/webhook/whatsapp")
    .send({ object: "whatsapp" })
    .expect(200);
  assert.equal(response.body.status, "ignored");
});
