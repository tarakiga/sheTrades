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

const BODY_FIELD = {
  id: "body",
  variable: "bodyText",
  text: "In recognition of your successful completion of the **SheTrades Digital Learning Programme**.",
  x: 0.5,
  y: 0.62,
  maxWidth: 0.6,
  align: "center",
  font: "Poppins",
  size: 0.022,
  weight: 400,
  color: "#333333"
};

test("a bodyText field parses and carries sensible wrapping defaults", () => {
  const parsed = certificateTemplatePayloadSchema.parse({ ...VALID, fields: [BODY_FIELD] });
  const field = parsed.fields[0];
  assert.equal(field?.variable, "bodyText");
  assert.ok(field && "lineHeight" in field && field.lineHeight === 1.4);
  assert.ok(field && "maxLines" in field && field.maxLines === 4);
});

test("a bodyText field with nothing to say is rejected at publish", () => {
  // An empty paragraph is a blank gap under the learner's name. Fail the
  // publish, not the render -- the same rule a logo without an assetKey gets.
  const bad = { ...VALID, fields: [{ ...BODY_FIELD, text: "   " }] };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("a line cap of zero is rejected", () => {
  const bad = { ...VALID, fields: [{ ...BODY_FIELD, maxLines: 0 }] };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("a line height below single spacing is rejected", () => {
  // Under 1.0 the lines overlap each other. There is no design that wants it,
  // and the result is unreadable rather than merely tight.
  const bad = { ...VALID, fields: [{ ...BODY_FIELD, lineHeight: 0.5 }] };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("an issuedDate field takes a format and defaults to iso", () => {
  const base = { ...VALID.fields[0], id: "date", variable: "issuedDate" };
  const parsed = certificateTemplatePayloadSchema.parse({ ...VALID, fields: [base] });
  const field = parsed.fields[0];
  assert.ok(field && "format" in field && field.format === "iso");

  const ordinal = certificateTemplatePayloadSchema.parse({
    ...VALID,
    fields: [{ ...base, format: "long-ordinal" }]
  });
  const ordinalField = ordinal.fields[0];
  assert.ok(ordinalField && "format" in ordinalField && ordinalField.format === "long-ordinal");
});

test("an unknown date format is rejected", () => {
  const bad = { ...VALID, fields: [{ ...VALID.fields[0], id: "date", variable: "issuedDate", format: "dd/mm/yy" }] };
  assert.throws(() => certificateTemplatePayloadSchema.parse(bad));
});

test("a single-line field cannot smuggle in wrapping or format keys", () => {
  // The branches are separate so that config which looks like it does
  // something and does not can never be published. maxLines on a learner name
  // is meaningless; it must not survive the parse looking meaningful.
  const parsed = certificateTemplatePayloadSchema.parse({
    ...VALID,
    fields: [{ ...VALID.fields[0], maxLines: 3, lineHeight: 2, format: "long-ordinal", text: "hello" }]
  });
  const field = parsed.fields[0];
  assert.ok(field);
  assert.equal("maxLines" in field, false);
  assert.equal("lineHeight" in field, false);
  assert.equal("format" in field, false);
  assert.equal("text" in field, false);
});
