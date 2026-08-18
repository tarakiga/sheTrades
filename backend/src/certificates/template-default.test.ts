import test from "node:test";
import assert from "node:assert/strict";
import { certificateTemplatePayloadSchema } from "./contracts.js";
import { DEFAULT_CERTIFICATE_TEMPLATE } from "./template-default.js";

test("the delivered template validates against the contract", () => {
  // It is parsed at module load, so this mostly guards against someone
  // loosening the schema and not noticing the template drifted with it.
  assert.doesNotThrow(() => certificateTemplatePayloadSchema.parse(DEFAULT_CERTIFICATE_TEMPLATE));
});

test("it ships disabled", () => {
  // The one flag between a half-checked template and a real credential.
  assert.equal(DEFAULT_CERTIFICATE_TEMPLATE.enabled, false);
});

test("every coordinate is normalised, so it renders the same at any resolution", () => {
  for (const field of DEFAULT_CERTIFICATE_TEMPLATE.fields) {
    assert.ok(field.x >= 0 && field.x <= 1, `${field.id} x out of range`);
    assert.ok(field.y >= 0 && field.y <= 1, `${field.id} y out of range`);
  }
});

test("every logo names an asset, and the QR does not need one", () => {
  const logos = DEFAULT_CERTIFICATE_TEMPLATE.fields.filter((f) => f.variable === "logo");
  assert.equal(logos.length, 4, "three partner marks plus the issuing rosette");
  for (const logo of logos) {
    assert.ok("assetKey" in logo && logo.assetKey, `${logo.id} has no assetKey`);
  }
  const qr = DEFAULT_CERTIFICATE_TEMPLATE.fields.find((f) => f.variable === "qrCode");
  assert.ok(qr, "a shared image with no caption is unverifiable without this");
});

test("the citation names the programme in bold", () => {
  const body = DEFAULT_CERTIFICATE_TEMPLATE.fields.find((f) => f.variable === "bodyText");
  assert.ok(body && "text" in body);
  assert.match(body.text, /\*\*SheTrades Digital Learning Programme\*\*/);
});

test("the date uses the long ordinal form the artwork shows", () => {
  const date = DEFAULT_CERTIFICATE_TEMPLATE.fields.find((f) => f.variable === "issuedDate");
  assert.ok(date && "format" in date);
  assert.equal(date.format, "long-ordinal");
});
