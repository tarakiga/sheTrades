import test, { after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import { disconnectPrismaForTests } from "../admin/prisma.js";
import { createCertificateAdminRouter, type CertificateAdminDeps } from "./routes-admin.js";

process.env.ADMIN_CONFIG_JWT_SECRET = process.env.ADMIN_CONFIG_JWT_SECRET ?? "test-secret";
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "https://example.test";

after(disconnectPrismaForTests);

function appWith(overrides: Partial<CertificateAdminDeps> = {}) {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createCertificateAdminRouter(overrides));
  return app;
}

function token(role: "admin" | "editor" | "viewer") {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests(
    { sub: "admin-1", role, iat: now, exp: now + 3600 },
    process.env.ADMIN_CONFIG_JWT_SECRET as string
  );
}

/**
 * Every route here touches an issued credential -- renaming, revoking,
 * re-sending, issuing by hand. A regression that dropped the guard would
 * expose a learner's name and let a stranger revoke her certificate, so the
 * guard is pinned route by route rather than assumed from the router-level
 * `use`.
 */
test("no route answers an unauthenticated caller", async () => {
  const app = appWith();
  await request(app).get("/api/admin/certificates").expect(401);
  await request(app).get("/api/admin/certificates/abc").expect(401);
  await request(app).patch("/api/admin/certificates/abc").send({ learnerName: "Ada" }).expect(401);
  await request(app).post("/api/admin/certificates/abc/revoke").send({ reason: "x" }).expect(401);
  await request(app).post("/api/admin/certificates/abc/unrevoke").send({}).expect(401);
  await request(app).post("/api/admin/certificates/abc/resend").send({}).expect(401);
  await request(app).post("/api/admin/certificates").send({ userId: "u", learnerName: "Ada" }).expect(401);
});

test("a viewer cannot change anything", async () => {
  // Read-only roles exist so a programme manager can look without being able
  // to withdraw someone's credential by accident.
  const app = appWith();
  const auth = `Bearer ${token("viewer")}`;
  await request(app).patch("/api/admin/certificates/abc").set("Authorization", auth).send({ learnerName: "Ada" }).expect(403);
  await request(app).post("/api/admin/certificates/abc/revoke").set("Authorization", auth).send({ reason: "x" }).expect(403);
  await request(app).post("/api/admin/certificates/abc/resend").set("Authorization", auth).send({}).expect(403);
});

test("a name the sanitiser refuses is rejected before any write", async () => {
  // Reaches the handler with a real editor token, so this exercises the
  // validation rather than stopping at the guard. A 61-character name cannot
  // fit the artwork, and truncating it onto a permanent credential would be
  // worse than asking again.
  const response = await request(appWith())
    .patch("/api/admin/certificates/abc")
    .set("Authorization", `Bearer ${token("editor")}`)
    .send({ learnerName: "a".repeat(61) });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /too long/i);
});

test("a resend sends the stored certificate and never issues a new one", async () => {
  // Load-bearing. Routing a resend through the issuing path would let the
  // template's `enabled` flag break resends for learners who ALREADY hold a
  // certificate -- the public route still renders their frozen snapshot, so
  // the image is there to send. Asserted with a real token so it runs the
  // handler, not the guard.
  let issueCalls = 0;
  const sent: Array<{ to: string; link: string; caption: string }> = [];
  const app = appWith({
    findForResend: async (id) => ({ id, publicId: "pub-123", user: { phone: "2348000000000" } }),
    issue: async () => {
      issueCalls += 1;
      return { status: "failed", reason: "the issuing path must not be reached" };
    },
    sendImage: async (to, payload) => {
      if (payload.kind === "image") {
        sent.push({ to, link: payload.link, caption: payload.caption ?? "" });
      }
      return { status: "sent", providerMessageId: "wamid.test" };
    }
  });

  const response = await request(app)
    .post("/api/admin/certificates/abc/resend")
    .set("Authorization", `Bearer ${token("editor")}`)
    .send({});

  assert.equal(response.status, 200);
  assert.equal(issueCalls, 0, "a resend must not mint a new certificate");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, "2348000000000");
  assert.ok(sent[0]?.link.endsWith("/c/pub-123.png"), "sends the image for the STORED publicId");
  assert.ok(sent[0]?.caption.includes("/c/pub-123"), "the caption carries the verify link");
});

test("a resend for an unknown certificate is a 404, not a send", async () => {
  let sends = 0;
  const app = appWith({
    findForResend: async () => null,
    sendImage: async () => {
      sends += 1;
      return { status: "sent", providerMessageId: "x" };
    }
  });
  const response = await request(app)
    .post("/api/admin/certificates/abc/resend")
    .set("Authorization", `Bearer ${token("admin")}`)
    .send({});
  assert.equal(response.status, 404);
  assert.equal(sends, 0);
});

test("a failed send is reported rather than swallowed", async () => {
  // The operator clicked Resend and needs to know it did not go, otherwise
  // she tells the learner it is on its way.
  const app = appWith({
    findForResend: async (id) => ({ id, publicId: "pub-123", user: { phone: "2348000000000" } }),
    sendImage: async () => ({ status: "failed", reason: "Meta rejected the send (HTTP 400)" })
  });
  const response = await request(app)
    .post("/api/admin/certificates/abc/resend")
    .set("Authorization", `Bearer ${token("admin")}`)
    .send({});
  assert.equal(response.status, 502);
  assert.match(response.body.message, /Meta rejected/);
});
