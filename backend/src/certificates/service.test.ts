import test from "node:test";
import assert from "node:assert/strict";
import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";
import { buildIssuePlan, certificateUrls } from "./service.js";

// Parsed (not hand-written) so the fixture carries the schema's defaults and
// cannot drift into a shape the real runtime would never produce.
const TEMPLATE: CertificateTemplatePayload = certificateTemplatePayloadSchema.parse({
  kind: "certificate_template",
  enabled: true,
  programmeName: "SheTrades Digital Skills Programme",
  issuerName: "TechHer",
  assetKey: "cert-bg",
  canvas: { width: 2000, height: 1414 },
  fields: [
    {
      id: "learner-name",
      variable: "learnerName",
      x: 0.5,
      y: 0.52,
      font: "Playfair Display",
      size: 0.06,
      color: "#1a1a1a"
    }
  ]
});

const PUBLIC_ID = /^[a-z2-7]{32}$/;

function plan(overrides: Partial<Parameters<typeof buildIssuePlan>[0]> = {}) {
  return buildIssuePlan({
    template: TEMPLATE,
    templateVersion: 7,
    learnerName: "Chiamaka Obi",
    completion: { completedModules: 5, totalModules: 5 },
    ...overrides
  });
}

test("buildIssuePlan freezes what the certificate will say and mints a public id", () => {
  const result = plan();
  assert.ok(result);
  // Every one of these is a SNAPSHOT. The template can be republished and the
  // curriculum can grow; what this learner earned must not change afterwards.
  assert.equal(result.learnerName, "Chiamaka Obi");
  assert.equal(result.programmeName, "SheTrades Digital Skills Programme");
  assert.equal(result.modulesCompleted, 5);
  assert.equal(result.totalModules, 5);
  assert.equal(result.templateKey, "certificate.template");
  assert.equal(result.templateVersion, 7);
  assert.match(result.publicId, PUBLIC_ID);
});

test("buildIssuePlan mints a fresh public id per call", () => {
  // Reusing an id would let one learner's verification page resolve to
  // another's certificate.
  assert.notEqual(plan()!.publicId, plan()!.publicId);
});

test("an ineligible learner yields no plan", () => {
  assert.equal(plan({ completion: { completedModules: 4, totalModules: 5 } }), null);
});

test("a disabled template yields no plan", () => {
  // The gate that stops placeholder artwork reaching a learner. The RENDERER
  // deliberately ignores `enabled` so admins can preview an unpublished draft,
  // which is exactly why the issuing path has to enforce it.
  const disabled = { ...TEMPLATE, enabled: false };
  assert.equal(plan({ template: disabled }), null);
});

test("an empty curriculum yields no plan", () => {
  // Before any lessons are published both counts are zero. A naive
  // completed >= total would certify anyone who ever said hello.
  assert.equal(plan({ completion: { completedModules: 0, totalModules: 0 } }), null);
});

test("a name that cannot be printed safely yields no plan", () => {
  // Bidi overrides and control characters are a spoofing vector on a publicly
  // verifiable credential, and an over-long name would be shrunk into
  // illegibility. Refusing to freeze it is better than printing it.
  assert.equal(plan({ learnerName: "   " }), null);
  assert.equal(plan({ learnerName: "A".repeat(200) }), null);
});

test("buildIssuePlan normalises the name it freezes", () => {
  // Escape sequence, never a literal invisible character: core.ts keeps this
  // rule so the source stays legible in any editor or diff.
  const result = plan({ learnerName: "  Chiamaka   Obi\u200B " });
  assert.equal(result?.learnerName, "Chiamaka Obi");
});

test("certificateUrls pairs the verification page with its image", () => {
  const urls = certificateUrls("https://api.shetrades.test", "abc");
  assert.deepEqual(urls, {
    verify: "https://api.shetrades.test/c/abc",
    image: "https://api.shetrades.test/c/abc.png"
  });
});

test("certificateUrls tolerates a trailing slash on the base", () => {
  // Base URLs arrive from env vars and admin config, where a trailing slash is
  // a coin flip. "//c/abc" would 404 rather than fail loudly.
  const urls = certificateUrls("https://api.shetrades.test/", "abc");
  assert.equal(urls.verify, "https://api.shetrades.test/c/abc");
  assert.equal(urls.image, "https://api.shetrades.test/c/abc.png");
});

test("certificateUrls REFUSES an empty base rather than emitting a relative link", () => {
  // Decision: throw. An empty base yields "/c/abc.png", which Meta cannot
  // fetch — the image send fails with a message about the URL, not about the
  // unset config that caused it, and the certificate silently never arrives.
  // Throwing names the actual fault at the moment it happens. issueCertificate
  // catches it AFTER persisting, so a misconfigured base costs a send, never
  // the certificate itself.
  assert.throws(() => certificateUrls("", "abc"), /base URL/i);
  assert.throws(() => certificateUrls("   ", "abc"), /base URL/i);
  // "/" collapses to empty once the trailing slash is trimmed — same relative
  // link, same failure, so it must take the same path.
  assert.throws(() => certificateUrls("/", "abc"), /base URL/i);
});
