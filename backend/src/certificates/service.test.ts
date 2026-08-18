import test from "node:test";
import assert from "node:assert/strict";
import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";
import {
  buildCertificateCaption,
  buildIssuePlan,
  certificateUrls,
  issueCertificate,
  type CertificateStore
} from "./service.js";
import { setRuntimeIntegrationConfigForTests } from "../config-platform/runtime-config.js";

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

const VERIFY = "https://api.shetrades.test/c/abc";

test("a caption that already fits is left exactly as the admin wrote it", () => {
  assert.equal(buildCertificateCaption("Congratulations!", VERIFY), `Congratulations!\n\n${VERIFY}`);
});

test("an over-long caption is clipped to fit and the verify URL still ends it INTACT", () => {
  const caption = buildCertificateCaption("A".repeat(2000), VERIFY);
  // Meta rejects the whole send over 1024 UTF-16 units, so the cap is a hard
  // requirement: over it, no certificate arrives at all.
  assert.ok(caption.length <= 1024, `caption was ${caption.length} units`);
  // The half that must survive. Clipping from the END - the obvious
  // implementation - would eat the URL first and leave a link that still looks
  // real and quietly 404s, which reads to the learner as a fake certificate.
  assert.ok(caption.endsWith(`\n\n${VERIFY}`));
  // Not the URL alone either: the copy is clipped, not discarded.
  assert.ok(caption.startsWith("AAAA"));
});

test("an unfittable URL drops the copy rather than mangling the link", () => {
  const huge = `https://api.shetrades.test/c/${"z".repeat(1200)}`;
  // The resulting send may still be rejected by Meta. That is loud, logged and
  // fixable; a truncated verification URL is none of those.
  assert.equal(buildCertificateCaption("Congratulations!", huge), huge);
});

test("clipping does not leave half a surrogate pair at the cut", () => {
  // Sliced by code units, an astral character straddling the budget would
  // leave a lone half that renders as a replacement glyph on the learner's
  // screen. Budget is engineered so the cut lands mid-pair.
  const rocket = String.fromCodePoint(0x1f680); // 2 UTF-16 units
  const budget = 1024 - VERIFY.length - 2;
  const copy = "A".repeat(budget - 1) + rocket + "B".repeat(50);
  const caption = buildCertificateCaption(copy, VERIFY);
  const body = caption.slice(0, caption.length - VERIFY.length - 2);
  assert.equal(body.length, budget - 1);
  assert.ok(body.endsWith("A"));
});

// ---- issueCertificate outcomes (no database: the store is injected) ----

const ISSUE_INPUT = {
  userId: "user-1",
  learnerPhone: "+234800",
  baseUrl: "https://api.shetrades.test",
  caption: "Congratulations!"
};

function freshPlan() {
  const p = plan();
  assert.ok(p);
  return p;
}

function storeStub(over: Partial<CertificateStore> = {}): CertificateStore {
  return {
    upsert: async () => ({ publicId: "persisted-id" }),
    findByUserId: async () => null,
    ...over
  };
}

/** Shaped like Prisma's known-request error. The handler keys on the CODE, so
 * this asserts that contract rather than the class identity — which is exactly
 * the thing that goes silently false across a second copy of @prisma/client. */
function uniqueViolation(): Error {
  return Object.assign(new Error("Unique constraint failed on the fields: (userId)"), {
    code: "P2002"
  });
}

/** With no WhatsApp config published, sendWhatsAppOutreach fails immediately
 * and without a fetch — which is what these tests want when the send is not
 * the thing under test. */
function noWhatsApp() {
  setRuntimeIntegrationConfigForTests("integration.whatsapp.primary", null);
}

test("a persistence failure yields status failed and NO publicId", async () => {
  noWhatsApp();
  const outcome = await issueCertificate({
    ...ISSUE_INPUT,
    plan: freshPlan(),
    storeForTests: storeStub({
      upsert: async () => {
        throw new Error("the database is on fire");
      }
    })
  });
  assert.equal(outcome.status, "failed");
  // The whole point of the discriminated outcome: reporting a publicId here
  // would give the caller a "My Certificate" entry pointing at a 404.
  assert.ok(!("publicId" in outcome));
  assert.match((outcome as { reason: string }).reason, /on fire/);
});

test("issueCertificate does not throw when persistence throws", async () => {
  noWhatsApp();
  // A bot turn has nowhere to put an exception. at-least-once webhook delivery
  // makes this an ordinary Tuesday, not an exotic failure.
  await assert.doesNotReject(() =>
    issueCertificate({
      ...ISSUE_INPUT,
      plan: freshPlan(),
      storeForTests: storeStub({
        upsert: async () => {
          throw uniqueViolation();
        }
      })
    })
  );
});

test("a P2002 race resolves to the EXISTING certificate, not a failure", async () => {
  // The losing side of two concurrent module_completed deliveries. The row it
  // wanted now exists, so re-reading it and carrying on IS the idempotent
  // outcome. The upsert alone does not make this safe: Prisma does not always
  // compile it to a native INSERT ... ON CONFLICT.
  const calls: string[] = [];
  const outcome = await issueCertificate({
    ...ISSUE_INPUT,
    plan: freshPlan(),
    storeForTests: {
      upsert: async () => {
        calls.push("upsert");
        throw uniqueViolation();
      },
      findByUserId: async (userId) => {
        calls.push(`findByUserId:${userId}`);
        return { publicId: "the-winners-id" };
      }
    }
  });
  assert.deepEqual(calls, ["upsert", "findByUserId:user-1"]);
  assert.equal(outcome.status, "issued");
  assert.equal((outcome as { publicId: string }).publicId, "the-winners-id");
});

test("a P2002 with no recoverable row fails rather than inventing an id", async () => {
  noWhatsApp();
  // The collision was on publicId, not userId. Nothing was written for this
  // learner, so there is no id to report.
  const outcome = await issueCertificate({
    ...ISSUE_INPUT,
    plan: freshPlan(),
    storeForTests: storeStub({
      upsert: async () => {
        throw uniqueViolation();
      },
      findByUserId: async () => null
    })
  });
  assert.equal(outcome.status, "failed");
  assert.ok(!("publicId" in outcome));
});

test("a failed re-read after P2002 fails, and says which half broke", async () => {
  noWhatsApp();
  const outcome = await issueCertificate({
    ...ISSUE_INPUT,
    plan: freshPlan(),
    storeForTests: storeStub({
      upsert: async () => {
        throw uniqueViolation();
      },
      findByUserId: async () => {
        throw new Error("connection reset");
      }
    })
  });
  assert.equal(outcome.status, "failed");
  assert.match((outcome as { reason: string }).reason, /recovery could not re-read/);
});

test("an error other than P2002 is NOT treated as a resolved race", async () => {
  noWhatsApp();
  let refetched = false;
  const outcome = await issueCertificate({
    ...ISSUE_INPUT,
    plan: freshPlan(),
    storeForTests: {
      upsert: async () => {
        throw Object.assign(new Error("value too long"), { code: "P2000" });
      },
      findByUserId: async () => {
        refetched = true;
        return { publicId: "must-not-be-used" };
      }
    }
  });
  // Recovering from an unrelated error by re-reading would return whatever row
  // happened to exist and call it this issuance.
  assert.equal(refetched, false);
  assert.equal(outcome.status, "failed");
});

test("a send failure still reports the certificate as issued", async () => {
  noWhatsApp();
  // The row exists; only delivery failed. Reporting this as "failed" would hide
  // a certificate the learner has genuinely earned and the admin can resend.
  const outcome = await issueCertificate({
    ...ISSUE_INPUT,
    plan: freshPlan(),
    storeForTests: storeStub()
  });
  assert.deepEqual(outcome, { status: "issued", publicId: "persisted-id", sent: false });
});

test("an unconfigured base URL costs the send, never the certificate", async () => {
  noWhatsApp();
  const outcome = await issueCertificate({
    ...ISSUE_INPUT,
    baseUrl: "",
    plan: freshPlan(),
    storeForTests: storeStub()
  });
  assert.deepEqual(outcome, { status: "issued", publicId: "persisted-id", sent: false });
});

test("the sent image links the PERSISTED public id, never the plan's", async () => {
  setRuntimeIntegrationConfigForTests("integration.whatsapp.primary", {
    accessToken: "tok",
    phoneNumberId: "pn1",
    apiVersion: "v23.0"
  });
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(init.body as string);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.9" }] }), { status: 200 });
  }) as typeof fetch;

  const p = freshPlan();
  const outcome = await issueCertificate({
    ...ISSUE_INPUT,
    plan: p,
    storeForTests: storeStub({ upsert: async () => ({ publicId: "the-winners-id" }) })
  });

  assert.deepEqual(outcome, { status: "issued", publicId: "the-winners-id", sent: true });
  const sentBody = JSON.parse(bodies[0]!);
  assert.equal(sentBody.type, "image");
  assert.equal(sentBody.image.link, "https://api.shetrades.test/c/the-winners-id.png");
  assert.ok(sentBody.image.caption.endsWith("https://api.shetrades.test/c/the-winners-id"));
  // The freshly minted id was never written; a link built from it would point
  // at a verification page that does not exist.
  assert.ok(!sentBody.image.link.includes(p.publicId));
  noWhatsApp();
});
