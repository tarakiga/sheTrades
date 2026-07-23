import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { getConfigPlatformService } from "../config-platform/service.js";
import { resetWhatsAppState } from "../whatsapp/handler.js";
import { refreshRuntimeConfigCache, setRuntimeIntegrationConfigForTests } from "../config-platform/runtime-config.js";

const skipWithoutDb = process.env.POSTGRES_URL ? false : "requires POSTGRES_URL";

import { disconnectPrismaForTests } from "../admin/prisma.js";

// A failed pg connection (local runs without POSTGRES_URL) leaves a socket
// open that pins the test runner for ~60s - tear the client down explicitly.
after(async () => {
  await disconnectPrismaForTests();
});

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
  if (!skipWithoutDb) void resetWhatsAppState();
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
    if (!skipWithoutDb) void resetWhatsAppState();
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

test("POST /webhook/whatsapp transitions onboarding to language step", { skip: skipWithoutDb }, async () => {
  if (!skipWithoutDb) void resetWhatsAppState();
  configService.resetForTests();
  const response = await request(app)
    .post("/webhook/whatsapp")
    .send(makeWebhookPayload("m1", "+234800000001", "Amaka Obi"))
    .expect(200);

  assert.equal(response.body.status, "processed");
  assert.equal(response.body.state, "awaiting_language");
  assert.match(String(response.body.reply), /Choose language/i);
});

test("POST /webhook/whatsapp applies language and routes to main menu", { skip: skipWithoutDb }, async () => {
  if (!skipWithoutDb) void resetWhatsAppState();
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

test("POST /webhook/whatsapp ignores duplicate message ids", { skip: skipWithoutDb }, async () => {
  if (!skipWithoutDb) void resetWhatsAppState();
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

test("POST /webhook/whatsapp returns ignored for unsupported payload", { skip: skipWithoutDb }, async () => {
  if (!skipWithoutDb) void resetWhatsAppState();
  configService.resetForTests();
  const response = await request(app)
    .post("/webhook/whatsapp")
    .send({ object: "whatsapp" })
    .expect(200);
  assert.equal(response.body.status, "ignored");
});

test("POST /webhook/whatsapp delivers via Meta when NOT sandbox-marked", { skip: skipWithoutDb }, async () => {
  setRuntimeIntegrationConfigForTests("integration.whatsapp.primary", { accessToken: "tok", phoneNumberId: "pn1", apiVersion: "v23.0" });
  const graphCalls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init: RequestInit) => {
    if (String(url).includes("graph.facebook.com")) {
      graphCalls.push(String(url));
      return new Response(JSON.stringify({ messages: [{ id: "x" }] }), { status: 200 });
    }
    return realFetch(url as string, init);
  }) as typeof fetch;
  try {
    await request(app).post("/webhook/whatsapp").send(makeWebhookPayload("m-real-1", "+234999000222", "hi"));
    assert.ok(graphCalls.length >= 1);
  } finally {
    globalThis.fetch = realFetch;
    setRuntimeIntegrationConfigForTests("integration.whatsapp.primary", null);
  }
});

test("POST /webhook/whatsapp does NOT deliver when sandbox-marked", async () => {
  setRuntimeIntegrationConfigForTests("integration.whatsapp.primary", { accessToken: "tok", phoneNumberId: "pn1", apiVersion: "v23.0" });
  const graphCalls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init: RequestInit) => {
    if (String(url).includes("graph.facebook.com")) {
      graphCalls.push(String(url));
      return new Response("{}", { status: 200 });
    }
    return realFetch(url as string, init);
  }) as typeof fetch;
  try {
    await request(app).post("/webhook/whatsapp").set("X-SheTrades-Source", "sandbox").send(makeWebhookPayload("m-sb-1", "+234999000333", "hi"));
    assert.equal(graphCalls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
    setRuntimeIntegrationConfigForTests("integration.whatsapp.primary", null);
  }
});

test("POST /webhook/whatsapp/reset without a token returns 401", async () => {
  await request(app).post("/webhook/whatsapp/reset").expect(401);
});

test("GET /webhook/whatsapp/session/:phone without a token returns 401", async () => {
  await request(app).get("/webhook/whatsapp/session/2348000000000").expect(401);
});
