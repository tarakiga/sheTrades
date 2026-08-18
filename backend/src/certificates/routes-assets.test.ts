import test, { after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import { disconnectPrismaForTests } from "../admin/prisma.js";
import {
  createCertificateAssetRouter,
  type CertificateAssetDeps,
  type CertificateAssetSummary
} from "./routes-assets.js";

process.env.ADMIN_CONFIG_JWT_SECRET = process.env.ADMIN_CONFIG_JWT_SECRET ?? "test-secret";

after(disconnectPrismaForTests);

const A_BACKGROUND: CertificateAssetSummary = {
  key: "certificate-background-v1",
  kind: "background",
  mimeType: "image/png",
  width: 2048,
  height: 1450,
  byteSize: 812_345,
  uploadedBy: "seed",
  uploadedAt: "2026-08-01T00:00:00.000Z"
};

/** Enough of a working store to exercise the handlers. `created` is what the
 * assertions inspect. */
function stubDeps(overrides: Partial<CertificateAssetDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const deps: Partial<CertificateAssetDeps> = {
    list: async () => [A_BACKGROUND],
    exists: async () => false,
    create: async (input) => {
      created.push({ ...input, bytes: input.bytes.length });
    },
    read: async (key) =>
      key === A_BACKGROUND.key ? { bytes: Buffer.from("PNGBYTES"), mimeType: "image/png" } : null,
    probe: async () => ({ format: "png", width: 2048, height: 1450 }),
    ...overrides
  };
  return { deps, created };
}

function appWith(overrides: Partial<CertificateAssetDeps> = {}) {
  const { deps, created } = stubDeps(overrides);
  const app = express();
  // Mirrors app.ts: the global JSON parser is in front, and the upload route's
  // own raw parser has to survive being mounted behind it.
  app.use(express.json());
  app.use("/api/admin", createCertificateAssetRouter(deps));
  return { app, created };
}

function token(role: "admin" | "editor" | "viewer") {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests(
    { sub: "admin-1", role, iat: now, exp: now + 3600 },
    process.env.ADMIN_CONFIG_JWT_SECRET as string
  );
}

const PNG = "image/png";

test("no asset route answers an unauthenticated caller", async () => {
  const { app } = appWith();
  await request(app).get("/api/admin/certificate-assets").expect(401);
  await request(app).post("/api/admin/certificate-assets?key=a-b&kind=logo").expect(401);
  await request(app).get("/api/admin/certificate-assets/certificate-background-v1/raw").expect(401);
});

test("a viewer can look at the artwork list but cannot upload", async () => {
  const { app } = appWith();
  const auth = `Bearer ${token("viewer")}`;
  await request(app).get("/api/admin/certificate-assets").set("Authorization", auth).expect(200);
  await request(app)
    .post("/api/admin/certificate-assets?key=logo-new-v1&kind=logo")
    .set("Authorization", auth)
    .set("Content-Type", PNG)
    .send(Buffer.from("x"))
    .expect(403);
});

test("the list never carries the image bytes", async () => {
  // A picker needs names and sizes. Shipping the pixels would make the page
  // tens of megabytes and put artwork in every browser cache that sees it.
  const { app } = appWith();
  const response = await request(app)
    .get("/api/admin/certificate-assets")
    .set("Authorization", `Bearer ${token("editor")}`)
    .expect(200);
  assert.equal(response.body.items.length, 1);
  assert.equal("bytes" in response.body.items[0], false);
  assert.equal(response.body.items[0].byteSize, 812_345);
});

test("a valid upload is stored with the type its bytes decode as", async () => {
  const { app, created } = appWith();
  const response = await request(app)
    .post("/api/admin/certificate-assets?key=certificate-background-v2&kind=background")
    .set("Authorization", `Bearer ${token("editor")}`)
    .set("Content-Type", PNG)
    .send(Buffer.from("pretend-png-bytes"))
    .expect(201);
  assert.equal(response.body.key, "certificate-background-v2");
  assert.equal(response.body.width, 2048);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.mimeType, "image/png");
  assert.equal(created[0]?.uploadedBy, "admin-1");
  assert.equal(typeof created[0]?.checksum, "string");
});

test("uploading over an existing key is refused and nothing is written", async () => {
  // The property: an issued certificate's frozen snapshot names its artwork by
  // key, so replacing those bytes would redraw credentials already delivered.
  const { app, created } = appWith({ exists: async () => true });
  const response = await request(app)
    .post("/api/admin/certificate-assets?key=certificate-background-v1&kind=background")
    .set("Authorization", `Bearer ${token("admin")}`)
    .set("Content-Type", PNG)
    .send(Buffer.from("pretend-png-bytes"));
  assert.equal(response.status, 409);
  assert.match(response.body.message, /certificate-background-v2/);
  assert.equal(created.length, 0);
});

test("a file whose contents contradict its declared type is refused", async () => {
  const { app, created } = appWith({
    probe: async () => ({ format: "jpeg", width: 2048, height: 1450 })
  });
  const response = await request(app)
    .post("/api/admin/certificate-assets?key=certificate-background-v2&kind=background")
    .set("Authorization", `Bearer ${token("editor")}`)
    .set("Content-Type", PNG)
    .send(Buffer.from("actually-a-jpeg"));
  assert.equal(response.status, 400);
  assert.match(response.body.message, /contents are jpeg/);
  assert.equal(created.length, 0);
});

test("a file sharp cannot read at all is refused rather than throwing", async () => {
  const { app } = appWith({ probe: async () => ({ format: undefined, width: 0, height: 0 }) });
  const response = await request(app)
    .post("/api/admin/certificate-assets?key=logo-broken-v1&kind=logo")
    .set("Authorization", `Bearer ${token("editor")}`)
    .set("Content-Type", PNG)
    .send(Buffer.from("not-an-image"));
  assert.equal(response.status, 400);
});

test("a disallowed content type is refused", async () => {
  const { app } = appWith();
  const response = await request(app)
    .post("/api/admin/certificate-assets?key=logo-new-v1&kind=logo")
    .set("Authorization", `Bearer ${token("editor")}`)
    .set("Content-Type", "image/gif")
    .send(Buffer.from("GIF89a"));
  assert.equal(response.status, 400);
  assert.match(response.body.message, /PNG, a JPEG, or an SVG/);
});

test("an undersized background is refused, and the same image passes as a logo", async () => {
  const small = { format: "png" as const, width: 400, height: 300 };
  const asBackground = await request(appWith({ probe: async () => small }).app)
    .post("/api/admin/certificate-assets?key=certificate-background-v2&kind=background")
    .set("Authorization", `Bearer ${token("editor")}`)
    .set("Content-Type", PNG)
    .send(Buffer.from("tiny"));
  assert.equal(asBackground.status, 400);
  assert.match(asBackground.body.message, /at least 800x600/);

  const asLogo = await request(appWith({ probe: async () => small }).app)
    .post("/api/admin/certificate-assets?key=logo-partner-v1&kind=logo")
    .set("Authorization", `Bearer ${token("editor")}`)
    .set("Content-Type", PNG)
    .send(Buffer.from("tiny"));
  assert.equal(asLogo.status, 201);
});

test("a missing kind is a 400, not a 500", async () => {
  const { app } = appWith();
  const response = await request(app)
    .post("/api/admin/certificate-assets?key=logo-new-v1")
    .set("Authorization", `Bearer ${token("editor")}`)
    .set("Content-Type", PNG)
    .send(Buffer.from("x"));
  assert.equal(response.status, 400);
});

test("the raw route serves the stored type with nosniff, and 404s an unknown key", async () => {
  const { app } = appWith();
  const auth = `Bearer ${token("viewer")}`;
  const found = await request(app)
    .get("/api/admin/certificate-assets/certificate-background-v1/raw")
    .set("Authorization", auth)
    .expect(200);
  assert.equal(found.headers["content-type"], "image/png");
  assert.equal(found.headers["x-content-type-options"], "nosniff");
  assert.match(found.headers["cache-control"] ?? "", /private/);

  await request(app)
    .get("/api/admin/certificate-assets/nope/raw")
    .set("Authorization", auth)
    .expect(404);
});
