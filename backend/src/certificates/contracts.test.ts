import test from "node:test";
import assert from "node:assert/strict";
import { certificateTemplatePayloadSchema } from "./contracts.js";

const VALID = {
  kind: "certificate_template",
  enabled: false,
  programmeName: "SheTrades Digital Skills Programme",
  issuerName: "TechHer",
  assetKey: "cert-bg-placeholder",
  canvas: { width: 2000, height: 1414 },
  fields: [
    {
      id: "learner-name",
      variable: "learnerName",
      x: 0.5,
      y: 0.52,
      maxWidth: 0.7,
      align: "center",
      font: "Playfair Display",
      size: 0.06,
      weight: 600,
      color: "#1a1a1a",
      autoShrink: true
    }
  ]
};

test("a well-formed template parses", () => {
  const parsed = certificateTemplatePayloadSchema.parse(VALID);
  assert.equal(parsed.fields[0]?.variable, "learnerName");
});

test("coordinates outside 0..1 are rejected", () => {
  // Pixel coordinates render correctly on the authoring canvas and wrongly at
  // print resolution. Catch them at the publish boundary, not in the image.
  const bad = { ...VALID, fields: [{ ...VALID.fields[0], x: 400 }] };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("an unknown variable is rejected", () => {
  const bad = { ...VALID, fields: [{ ...VALID.fields[0], variable: "learnerEmail" }] };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("a logo field must name the asset it renders", () => {
  const bad = {
    ...VALID,
    fields: [{ id: "logo-1", variable: "logo", x: 0.1, y: 0.1, width: 0.2 }]
  };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("a logo field with an assetKey parses", () => {
  const good = {
    ...VALID,
    fields: [
      { id: "logo-1", variable: "logo", assetKey: "logo-techher", x: 0.1, y: 0.1, width: 0.2 }
    ]
  };
  const parsed = certificateTemplatePayloadSchema.parse(good);
  assert.equal(parsed.fields[0]?.variable, "logo");
});

test("a qrCode field needs no assetKey", () => {
  // The QR is generated from the verify URL, not uploaded.
  const good = {
    ...VALID,
    fields: [{ id: "qr", variable: "qrCode", x: 0.86, y: 0.8, width: 0.08 }]
  };
  const parsed = certificateTemplatePayloadSchema.parse(good);
  assert.equal(parsed.fields[0]?.variable, "qrCode");
});

test("a template with no fields is rejected", () => {
  assert.throws(() => certificateTemplatePayloadSchema.parse({ ...VALID, fields: [] }));
});
