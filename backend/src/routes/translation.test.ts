import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import { setRuntimeIntegrationConfigForTests } from "../config-platform/runtime-config.js";

process.env.ADMIN_CONFIG_JWT_SECRET = process.env.ADMIN_CONFIG_JWT_SECRET ?? "test-translation-secret";
const now = Math.floor(Date.now() / 1000);
const adminToken = signJwtHs256ForTests(
  { sub: "translation-test", role: "admin", iat: now, exp: now + 3600 },
  process.env.ADMIN_CONFIG_JWT_SECRET
);
const auth = { authorization: `Bearer ${adminToken}` };
const app = createApp();

test("GET /api/admin/translation without a token is 401", async () => {
  await request(app).get("/api/admin/translation").expect(401);
});

test("POST /api/admin/translation/run without a token is 401", async () => {
  await request(app).post("/api/admin/translation/run").send({ documentIds: "all", language: "ig" }).expect(401);
});

test("POST /run with no published translation config returns 400, not a crash", async () => {
  setRuntimeIntegrationConfigForTests("integration.translation.primary", null);
  const res = await request(app).post("/api/admin/translation/run").set(auth)
    .send({ documentIds: "all", language: "ig" });
  assert.equal(res.status, 400);
  assert.match(res.body.message ?? "", /configure|publish/i);
});

test("POST /run rejects a provider that cannot produce the language, before spending anything", async () => {
  // pcm routed to igbo_api is a misconfiguration — the Igbo API can't produce Pidgin.
  setRuntimeIntegrationConfigForTests("integration.translation.primary", {
    kind: "translation", title: "t", enabled: true,
    providerByLanguage: { pcm: "igbo_api", ig: "gemini" },
    igboApi: { apiKey: "k", baseUrl: "https://igboapi.com", dailyRequestLimit: 2500 },
    gemini: { apiKey: "g", model: "gemini-2.5-flash" },
    anthropic: { apiKey: "", model: "claude-sonnet-5" }
  });
  const res = await request(app).post("/api/admin/translation/run").set(auth)
    .send({ documentIds: "all", language: "pcm" });
  assert.equal(res.status, 400);
  assert.match(res.body.message ?? "", /pidgin|cannot produce|igbo_api/i);
  setRuntimeIntegrationConfigForTests("integration.translation.primary", null);
});

test("POST /api/integrations/admin/translation/test without a token is 401", async () => {
  await request(app).post("/api/integrations/admin/translation/test").send({ config: {} }).expect(401);
});
