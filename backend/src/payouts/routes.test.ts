import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

test("POST /internal/payouts/dispatch rejects without the worker token", async () => {
  await request(app).post("/internal/payouts/dispatch").expect(403);
});

test("POST /internal/payouts/dispatch rejects with a wrong token", async () => {
  process.env.PAYOUTS_WORKER_TOKEN = "expected";
  await request(app)
    .post("/internal/payouts/dispatch")
    .set("X-Internal-Worker-Token", "wrong")
    .expect(403);
});

test("POST /internal/payouts/dispatch returns a summary with the correct shape", async () => {
  process.env.PAYOUTS_WORKER_TOKEN = "expected";
  const response = await request(app)
    .post("/internal/payouts/dispatch")
    .set("X-Internal-Worker-Token", "expected")
    .expect(200);
  assert.ok(typeof response.body.scannedAt === "string");
  for (const key of ["examined", "dispatched", "retried", "movedToFailed", "skipped"]) {
    assert.equal(typeof response.body[key], "number", `${key} should be number`);
  }
});
