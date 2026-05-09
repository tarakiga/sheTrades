import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { resetContentServiceState } from "../content/service.js";

const app = createApp();

test("GET /api/content/lessons returns lesson list", async () => {
  resetContentServiceState();
  const response = await request(app).get("/api/content/lessons").expect(200);
  assert.ok(Array.isArray(response.body.lessons));
  assert.ok(response.body.lessons.length >= 2);
});

test("POST /api/content/lessons creates draft lesson", async () => {
  resetContentServiceState();
  const response = await request(app)
    .post("/api/content/lessons")
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
    .post("/api/content/lessons")
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
  const list = await request(app).get("/api/content/lessons").expect(200);
  const lessonId = list.body.lessons[0].id;

  const response = await request(app)
    .put(`/api/content/lessons/${lessonId}`)
    .send({ title: "Updated Lesson Title" })
    .expect(200);

  assert.equal(response.body.lesson.title, "Updated Lesson Title");
});

test("POST /api/content/lessons/:id/publish sets lesson to Published", async () => {
  resetContentServiceState();
  const create = await request(app)
    .post("/api/content/lessons")
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
  const published = await request(app).post(`/api/content/lessons/${lessonId}/publish`).expect(200);
  assert.equal(published.body.lesson.status, "Published");
});

test("POST /api/content/validate returns validation errors for invalid lesson shape", async () => {
  resetContentServiceState();
  const response = await request(app)
    .post("/api/content/validate")
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
  const response = await request(app).get("/api/content/admin-view").expect(200);
  assert.ok(Array.isArray(response.body.lessons));
  const row = response.body.lessons[0];
  assert.equal(typeof row.module, "string");
  assert.equal(typeof row.lesson, "string");
  assert.equal(typeof row.language, "string");
  assert.equal(typeof row.quiz, "string");
});
