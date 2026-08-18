import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createApp } from "../app.js";
import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";
import {
  buildVerifyPageHtml,
  createCertificatePublicRouter,
  type CertificatePublicDeps,
  type PublicCertificateRow
} from "./routes-public.js";

const PUBLIC_ID = "aaaabbbbccccddddeeeeffffgggghhhh";
const BASE_URL = "https://verify.example";
const IMAGE_URL = `${BASE_URL}/c/${PUBLIC_ID}.png`;

/**
 * A phone number is the one piece of learner data most likely to be widened
 * onto this page by accident -- it sits on the same User row as the name, and
 * "let me just pass the whole record" is the natural refactor. Seven or more
 * consecutive digits catches every national and international form; nothing
 * legitimate on this page (a four-digit year, a CSS length) comes close.
 */
const SEVEN_DIGIT_RUN = /[0-9]{7,}/;
const INTERNATIONAL_PREFIX = /[+][0-9]{6,}/;

const TEMPLATE: CertificateTemplatePayload = certificateTemplatePayloadSchema.parse({
  kind: "certificate_template",
  enabled: true,
  programmeName: "SheTrades Nigeria",
  issuerName: "ITC SheTrades",
  assetKey: "certificate.background.v1",
  canvas: { width: 1200, height: 850 },
  fields: [
    {
      id: "name",
      variable: "learnerName",
      x: 0.5,
      y: 0.45,
      maxWidth: 0.7,
      align: "center",
      font: "DejaVu Sans",
      size: 0.06,
      weight: 600,
      color: "#1a1a1a"
    }
  ]
});

const ROW: PublicCertificateRow = {
  publicId: PUBLIC_ID,
  learnerName: "Adaeze Okonkwo",
  programmeName: "SheTrades Nigeria",
  issuedAt: new Date("2026-08-18T09:30:00Z"),
  revokedAt: null
};

const PNG_BYTES = Buffer.from("fake-png-bytes");

type Recorder = { lookups: string[]; renders: number };

function buildTestApp(overrides: Partial<CertificatePublicDeps> = {}): {
  app: express.Express;
  recorder: Recorder;
} {
  const recorder: Recorder = { lookups: [], renders: 0 };
  const deps: Partial<CertificatePublicDeps> = {
    findByPublicId: async (publicId) => {
      recorder.lookups.push(publicId);
      return publicId === PUBLIC_ID ? ROW : null;
    },
    getTemplate: () => TEMPLATE,
    renderPng: async () => {
      recorder.renders += 1;
      return PNG_BYTES;
    },
    baseUrl: () => BASE_URL,
    ...overrides
  };
  const app = express();
  app.use("/", createCertificatePublicRouter(deps));
  return { app, recorder };
}

test("buildVerifyPageHtml states who was awarded what, by whom and when", () => {
  const html = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: null,
    imageUrl: IMAGE_URL
  });

  assert.ok(html.includes("Adaeze Okonkwo"));
  assert.ok(html.includes("SheTrades Nigeria"));
  assert.ok(html.includes("ITC SheTrades"));
  assert.ok(html.includes("18 August 2026"));
  assert.ok(html.includes(IMAGE_URL));
  // Opened by strangers on unknown devices: nothing may be fetched or executed.
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("http://"));
  assert.doesNotMatch(html, /src="https:[/][/](?!verify[.]example)/);
});

test("buildVerifyPageHtml says plainly when a certificate is revoked", () => {
  const revoked = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: new Date("2026-09-01T00:00:00Z"),
    imageUrl: IMAGE_URL
  });

  assert.match(revoked, /revoke/i);
  assert.match(revoked, /no longer valid/i);
});

test("buildVerifyPageHtml does not cry revoked over a valid certificate", () => {
  const valid = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: null,
    imageUrl: IMAGE_URL
  });

  assert.doesNotMatch(valid, /revoke/i);
  assert.doesNotMatch(valid, /no longer valid/i);
});

test("buildVerifyPageHtml escapes learner-supplied and admin-supplied text", () => {
  const html = buildVerifyPageHtml({
    // Reaches this page from a WhatsApp display name.
    learnerName: '<script>alert(1)</script>',
    // Reaches this page from an admin-editable config document.
    programmeName: 'SheTrades" onload="alert(2)',
    issuerName: "Fisher & Sons",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: null,
    imageUrl: IMAGE_URL
  });

  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes('onload="alert(2)'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Fisher &amp; Sons"));
});

test("buildVerifyPageHtml emits nothing that looks like a phone number", () => {
  const html = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: null,
    imageUrl: IMAGE_URL
  });

  assert.doesNotMatch(html, SEVEN_DIGIT_RUN);
  assert.doesNotMatch(html, INTERNATIONAL_PREFIX);
  // Literals the builder is never given. If a future refactor widens the input
  // to "the whole certificate row" or "the whole user", these start appearing
  // before anyone notices the signature grew.
  assert.ok(!html.includes("+2348012345678"));
  assert.ok(!html.includes("08012345678"));
  assert.ok(!html.includes("Lagos"));
});

test("an unknown id 404s identically on both routes", async () => {
  const { app } = buildTestApp();

  const png = await request(app).get("/c/nosuchcertificate.png");
  const page = await request(app).get("/c/nosuchcertificate");

  assert.equal(png.status, 404);
  assert.equal(page.status, 404);
  // Byte-identical: any difference at all turns these URLs into an oracle for
  // "does this certificate id exist".
  assert.equal(png.text, page.text);
  assert.equal(png.headers["content-type"], page.headers["content-type"]);
  assert.equal(png.headers["cache-control"], page.headers["cache-control"]);
});

test("a withheld certificate is indistinguishable from an unknown id", async () => {
  const { app: known } = buildTestApp();
  const unknownBody = (await request(known).get("/c/nosuchcertificate")).text;

  // No published template: the certificate exists, but we will not show it.
  const { app: noTemplate } = buildTestApp({ getTemplate: () => null });
  const withheldPage = await request(noTemplate).get(`/c/${PUBLIC_ID}`);
  const withheldPng = await request(noTemplate).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(withheldPage.status, 404);
  assert.equal(withheldPng.status, 404);
  assert.equal(withheldPage.text, unknownBody);
  assert.equal(withheldPng.text, unknownBody);
});

test("the .png route is not swallowed by the bare verification route", async () => {
  const { app, recorder } = buildTestApp();

  const response = await request(app).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.equal(response.headers["cache-control"], "public, max-age=86400");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(response.body, PNG_BYTES);
  assert.equal(recorder.renders, 1);
  // The suffix belongs to the ROUTE, not to the id. If the bare route matched
  // first this would be "<id>.png" and the lookup would miss.
  assert.deepEqual(recorder.lookups, [PUBLIC_ID]);
});

test("the bare route serves the verification page", async () => {
  const { app, recorder } = buildTestApp();

  const response = await request(app).get(`/c/${PUBLIC_ID}`);

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"] ?? "", /text[/]html/);
  assert.ok(response.text.includes("Adaeze Okonkwo"));
  assert.ok(response.text.includes(IMAGE_URL));
  assert.equal(recorder.renders, 0);
  assert.deepEqual(recorder.lookups, [PUBLIC_ID]);
});

test("an unconfigured base URL is a clean 500, not an unhandled rejection", async () => {
  const { app } = buildTestApp({ baseUrl: () => "" });

  const png = await request(app).get(`/c/${PUBLIC_ID}.png`);
  const page = await request(app).get(`/c/${PUBLIC_ID}`);

  assert.equal(png.status, 500);
  assert.equal(page.status, 500);
});

test("both public routes are mounted on the app", async () => {
  // No certificate template is published in a bare test process, so both
  // routes take the withheld branch -- which is exactly the 404 an unknown id
  // gets, and needs no database to reach.
  const app = createApp();

  await request(app).get("/c/nosuchcertificate.png").expect(404);
  await request(app).get("/c/nosuchcertificate").expect(404);
});
