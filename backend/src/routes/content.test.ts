import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { resetContentServiceState } from "../content/service.js";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

// The legacy content router is now auth-gated (GAP-A6), so requests carry a
// valid admin bearer token. A token without `sid` skips the DB session lookup.
process.env.ADMIN_CONFIG_JWT_SECRET = process.env.ADMIN_CONFIG_JWT_SECRET ?? "test-content-secret";
const nowSeconds = Math.floor(Date.now() / 1000);
const adminToken = signJwtHs256ForTests(
  { sub: "content-test", role: "admin", iat: nowSeconds, exp: nowSeconds + 3600 },
  process.env.ADMIN_CONFIG_JWT_SECRET
);
const auth = { authorization: `Bearer ${adminToken}` };

const app = createApp();

test("GET /api/content/lessons returns lesson list", async () => {
  resetContentServiceState();
  const response = await request(app).get("/api/content/lessons").set(auth).expect(200);
  assert.ok(Array.isArray(response.body.lessons));
  assert.ok(response.body.lessons.length >= 0);
});

test("GAP-A6: legacy content routes reject unauthenticated callers", async () => {
  resetContentServiceState();
  // No bearer token → 401 (previously these were reachable anonymously).
  await request(app).get("/api/content/lessons").expect(401);
  await request(app).post("/api/content/lessons").send({ moduleId: 1, title: "x" }).expect(401);
  await request(app).get("/api/content/admin-view").expect(401);
});

test("POST /api/content/lessons creates draft lesson", async () => {
  resetContentServiceState();
  const response = await request(app)
    .post("/api/content/lessons").set(auth)
    .send({
      moduleId: 3,
      title: "Inventory Planning",
      languages: {
        en: "Count your stock weekly.",
        pcm: "Count your stock every week."
      },
      quiz: [
        {
          question: "Why track inventory?",
          options: ["To prevent stockouts", "To increase rent"],
          answerIndex: 0
        }
      ]
    })
    .expect(201);

  assert.equal(response.body.lesson.status, "Draft");
  assert.equal(response.body.lesson.moduleId, 3);
});

test("POST /api/content/lessons returns 400 for invalid quiz payload", async () => {
  resetContentServiceState();
  const response = await request(app)
    .post("/api/content/lessons").set(auth)
    .send({
      moduleId: 3,
      title: "Invalid Lesson",
      languages: { en: "text" },
      quiz: [
        {
          question: "Bad answer index",
          options: ["A", "B"],
          answerIndex: 4
        }
      ]
    })
    .expect(400);

  assert.equal(response.body.message, "Invalid content payload.");
  assert.ok(Array.isArray(response.body.details));
});

test("PUT /api/content/lessons/:id updates existing lesson", async () => {
  resetContentServiceState();
  const created = await request(app)
    .post("/api/content/lessons").set(auth)
    .send({
      moduleId: 1,
      title: "Starter Lesson",
      languages: { en: "Starter content." },
      quiz: [{ question: "Q1", options: ["A", "B"], answerIndex: 0 }]
    })
    .expect(201);
  const lessonId = created.body.lesson.id;

  const response = await request(app)
    .put(`/api/content/lessons/${lessonId}`).set(auth)
    .send({ title: "Updated Lesson Title" })
    .expect(200);

  assert.equal(response.body.lesson.title, "Updated Lesson Title");
});

test("POST /api/content/lessons/:id/publish sets lesson to Published", async () => {
  resetContentServiceState();
  const create = await request(app)
    .post("/api/content/lessons").set(auth)
    .send({
      moduleId: 4,
      title: "Supplier Negotiation",
      languages: { en: "Negotiate with confidence." },
      quiz: [
        {
          question: "Best first step?",
          options: ["Know your target price", "Accept first offer"],
          answerIndex: 0
        }
      ]
    })
    .expect(201);

  const lessonId = create.body.lesson.id;
  const published = await request(app).post(`/api/content/lessons/${lessonId}/publish`).set(auth).expect(200);
  assert.equal(published.body.lesson.status, "Published");
});

test("POST /api/content/validate returns validation errors for invalid lesson shape", async () => {
  resetContentServiceState();
  const response = await request(app)
    .post("/api/content/validate").set(auth)
    .send({
      moduleId: 0,
      title: "",
      languages: { en: "" },
      quiz: []
    })
    .expect(200);

  assert.equal(response.body.valid, false);
  assert.ok(Array.isArray(response.body.errors));
  assert.ok(response.body.errors.length > 0);
});

test("GET /api/content/admin-view returns admin content contract shape", async () => {
  resetContentServiceState();
  await request(app)
    .post("/api/content/lessons").set(auth)
    .send({
      moduleId: 1,
      title: "Starter Lesson",
      languages: { en: "Starter content." },
      quiz: [{ question: "Q1", options: ["A", "B"], answerIndex: 0 }]
    })
    .expect(201);
  const response = await request(app).get("/api/content/admin-view").set(auth).expect(200);
  assert.ok(Array.isArray(response.body.lessons));
  const row = response.body.lessons[0];
  assert.equal(typeof row.module, "string");
  assert.equal(typeof row.lesson, "string");
  assert.equal(typeof row.language, "string");
  assert.equal(typeof row.quiz, "string");
});
