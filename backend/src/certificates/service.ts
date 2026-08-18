import type { Prisma } from "@prisma/client";
import { prisma } from "../admin/prisma.js";
import { whatsappLength } from "../whatsapp/constraints.js";
import { sendWhatsAppOutreach } from "../whatsapp/sender.js";
import type { CertificateTemplatePayload } from "./contracts.js";
import { generatePublicId, isEligible, sanitiseLearnerName, type Completion } from "./core.js";

/**
 * Issuing a completion certificate: decide one is due, FREEZE what it will
 * say, write it down, then send it.
 *
 * The decision half (buildIssuePlan, certificateUrls) is pure and unit-tested
 * without a database; only issueCertificate touches Postgres and WhatsApp.
 * That split exists because the expensive mistakes here — certifying an
 * ineligible learner, shipping placeholder artwork, pointing a learner at a
 * verification page that does not resolve — are all decisions, not I/O.
 */

/**
 * The config document key that carries the certificate template. Recorded on
 * every issued row alongside its version as an audit trail of WHICH document
 * and revision produced this certificate. What actually reproduces the artwork
 * is templateSnapshot, below -- the key and version are not enough, because the
 * document behind them is mutable.
 */
export const CERTIFICATE_TEMPLATE_KEY = "certificate.template";

export type IssuePlan = {
  publicId: string;
  learnerName: string;
  programmeName: string;
  modulesCompleted: number;
  totalModules: number;
  templateKey: string;
  templateVersion: number;
  /**
   * The whole template payload, frozen. Carried on the plan and written to the
   * row so the rendered artwork stops depending on the live config document:
   * republishing a redesign would otherwise change the background, the logos,
   * the layout and the fonts of every certificate already in a learner's hands.
   */
  templateSnapshot: CertificateTemplatePayload;
};

/**
 * Everything the certificate will say, resolved once at the moment it is
 * earned. Nothing here is looked up again later: the template can be
 * republished and the curriculum can grow, and neither may retroactively
 * change what an already-issued certificate claims.
 *
 * Returns null — rather than throwing — for every "no certificate today"
 * outcome, because the caller is a module-completion event that fires for
 * every learner on every module. Not being finished yet is the normal case,
 * not an error.
 */
export function buildIssuePlan(input: {
  template: CertificateTemplatePayload;
  templateVersion: number;
  learnerName: string;
  completion: Completion;
}): IssuePlan | null {
  if (!isEligible(input.completion)) return null;

  // The gate that stops placeholder artwork reaching a learner. render.ts
  // deliberately does NOT check this flag, so that an admin can preview an
  // unpublished draft; that makes enforcing it here mandatory rather than
  // belt-and-braces. Removing this line ships whatever is currently seeded.
  if (!input.template.enabled) return null;

  const name = sanitiseLearnerName(input.learnerName);
  if (!name.ok) {
    // Logged, not silent: this is the one null branch that is not a normal
    // day. A learner who finished the programme and cannot be certified
    // because of their stored name needs a human to notice.
    console.warn(
      JSON.stringify({ event: "certificate.plan.rejected", reason: `name_${name.reason}` })
    );
    return null;
  }

  return {
    publicId: generatePublicId(),
    learnerName: name.value,
    programmeName: input.template.programmeName,
    modulesCompleted: input.completion.completedModules,
    totalModules: input.completion.totalModules,
    templateKey: CERTIFICATE_TEMPLATE_KEY,
    templateVersion: input.templateVersion,
    // The published payload verbatim -- not a subset, and not re-derived later.
    // Re-validated on the way back OUT (routes-public.ts parses it before
    // rendering), because between here and there it is a JSON column and its
    // shape is not something TypeScript can vouch for.
    templateSnapshot: input.template
  };
}

/**
 * The public verification page and the PNG that backs it. One function so the
 * two can never drift: the QR printed on the artwork encodes `verify`, and the
 * link handed to Meta is `image`.
 *
 * Throws on an empty base rather than emitting "/c/<id>.png". A relative link
 * is not a link Meta can fetch, and the failure it produces names the URL, not
 * the unset config that caused it — so the certificate silently never arrives
 * and the log says nothing useful three weeks later. Failing here names the
 * actual fault at the moment it happens. issueCertificate calls this AFTER the
 * row is written, so a misconfigured base costs a send, never a certificate.
 */
export function certificateUrls(baseUrl: string, publicId: string): { verify: string; image: string } {
  // Base URLs come from env vars and admin config, where a trailing slash is a
  // coin flip; "//c/<id>" would 404 rather than fail loudly.
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (base.length === 0) {
    throw new Error(
      "certificate base URL is not configured: a relative certificate link cannot be fetched by WhatsApp"
    );
  }
  const verify = `${base}/c/${publicId}`;
  return { verify, image: `${verify}.png` };
}

/**
 * Meta caps an image caption at 1024 UTF-16 code units and REJECTS the entire
 * send when it is exceeded — the certificate does not arrive at all.
 *
 * Deliberately a local constant and NOT a key in WHATSAPP_LIMITS: that object
 * is mirrored by hand in dashboard/lib/whatsapp-constraints.ts, so a key added
 * on one side only is a desync waiting to happen. Nothing outside this module
 * sends an image caption.
 */
const CAPTION_MAX = 1024;

const CAPTION_SEPARATOR = "\n\n";

/**
 * Fits the caption to Meta's cap by clipping the COPY, never the URL.
 *
 * The two halves are not equally important. The copy is a nicety; the verify
 * URL is what makes the credential checkable from the chat itself. Clipping
 * from the end — the obvious implementation — eats the URL first and leaves a
 * link that still LOOKS real and quietly 404s. That is worse than losing
 * words: a learner who taps a dead verification link concludes the
 * certificate she spent weeks earning is fake.
 *
 * When the URL alone will not fit, the copy is dropped entirely rather than
 * the link mangled. Such a send may still be rejected by Meta — which is loud,
 * logged and fixable. A dead link is none of those.
 */
export function buildCertificateCaption(copy: string, verifyUrl: string): string {
  const budget = CAPTION_MAX - whatsappLength(verifyUrl) - CAPTION_SEPARATOR.length;
  const trimmed = copy.trim();
  if (trimmed.length === 0 || budget <= 0) return verifyUrl;
  return `${clipCodeUnits(trimmed, budget)}${CAPTION_SEPARATOR}${verifyUrl}`;
}

/**
 * Slices to a UTF-16 code-unit budget — Meta's own counting unit, which is why
 * whatsappLength is plain `.length` and an emoji costs 2 — without splitting a
 * surrogate pair. Half a pair left at the cut renders as a replacement glyph
 * on the learner's screen.
 */
function clipCodeUnits(value: string, budget: number): string {
  if (value.length <= budget) return value;
  const cut = value.slice(0, budget);
  const last = cut.charCodeAt(cut.length - 1);
  const endsOnHalfPair = last >= 0xd800 && last <= 0xdbff;
  return endsOnHalfPair ? cut.slice(0, -1) : cut;
}


/**
 * The result of trying to issue a certificate.
 *
 * Discriminated rather than a bare `{ publicId, sent }` because the two
 * failures are not the same failure. A certificate that exists but did not
 * SEND is recoverable — the "My Certificate" menu entry and the admin Resend
 * action both find it. A certificate that was never WRITTEN has no publicId,
 * and reporting one anyway would hand the caller a menu entry pointing at a
 * 404: a lie shaped exactly like success, which is worse than the failure it
 * hides.
 */
export type IssueOutcome =
  | { status: "issued"; publicId: string; sent: boolean }
  | { status: "failed"; reason: string };

/**
 * The database half of issuance, behind an interface so the outcome contract —
 * including the concurrent-race branch, which is the part most likely to be
 * wrong — can be exercised without a Postgres connection. Named ...ForTests at
 * the call site following the payouts-worker precedent.
 */
export type CertificateStore = {
  upsert(input: { userId: string; plan: IssuePlan }): Promise<{ publicId: string }>;
  findByUserId(userId: string): Promise<{ publicId: string } | null>;
};

const prismaCertificateStore: CertificateStore = {
  upsert: ({ userId, plan }) =>
    prisma.certificate.upsert({
      where: { userId },
      create: {
        publicId: plan.publicId,
        userId,
        learnerName: plan.learnerName,
        programmeName: plan.programmeName,
        modulesCompleted: plan.modulesCompleted,
        totalModules: plan.totalModules,
        templateKey: plan.templateKey,
        templateVersion: plan.templateVersion,
        // Cast because Prisma's Json input type is a structural
        // InputJsonValue, and a nominal zod-inferred object type does not
        // satisfy it without one. The value is a plain JSON-safe object --
        // strings, numbers, booleans and arrays only, per the schema in
        // contracts.ts.
        templateSnapshot: plan.templateSnapshot as unknown as Prisma.InputJsonValue
      },
      // Empty ON PURPOSE. An already-issued certificate is never silently
      // replaced: its name, counts, template version and frozen template are
      // the historical record of what a learner earned, not a cache to be
      // refreshed.
      update: {},
      select: { publicId: true }
    }),
  findByUserId: (userId) =>
    prisma.certificate.findUnique({ where: { userId }, select: { publicId: true } })
};

/**
 * P2002 is Prisma's unique-constraint violation, matched on the CODE and never
 * on the message text — which is version-dependent and carries the constraint
 * name inline.
 *
 * A structural check rather than an `instanceof PrismaClientKnownRequestError`
 * on purpose: this app drives Prisma through a driver adapter, and an
 * `instanceof` resolved against a second copy of @prisma/client answers false
 * SILENTLY — turning a handled race straight back into the unhandled throw this
 * function exists to prevent. The `code` field is the stable half of the
 * contract; the class identity is not.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type PersistResult = { ok: true; publicId: string } | { ok: false; reason: string };

/**
 * Writes the certificate, resolving the concurrent case rather than throwing.
 *
 * Two guarantees, worth separating because the second does not follow from the
 * first. The UNIQUE CONSTRAINT on userId guarantees at most one certificate per
 * learner, full stop. It does NOT guarantee no error: Prisma's upsert is not
 * always compiled to a native INSERT ... ON CONFLICT, and when it falls back to
 * find-then-create, two simultaneous callers can both miss and both insert, so
 * the loser gets a P2002. `module_completed` arrives from an at-least-once
 * webhook, which makes simultaneous callers ordinary rather than exotic.
 *
 * The upsert PLUS this handler is what makes that race resolve cleanly. A P2002
 * on userId means the row this call wanted now exists, so re-reading it and
 * carrying on IS the idempotent outcome, not a consolation prize.
 */
async function persistCertificate(
  store: CertificateStore,
  userId: string,
  plan: IssuePlan
): Promise<PersistResult> {
  try {
    const row = await store.upsert({ userId, plan });
    return { ok: true, publicId: row.publicId };
  } catch (error) {
    if (!isUniqueViolation(error)) return { ok: false, reason: errorMessage(error) };

    let existing: { publicId: string } | null;
    try {
      existing = await store.findByUserId(userId);
    } catch (refetchError) {
      return {
        ok: false,
        reason: `unique-violation recovery could not re-read the row: ${errorMessage(refetchError)}`
      };
    }
    if (existing) return { ok: true, publicId: existing.publicId };

    // A P2002 with no row for this user means the collision was on the OTHER
    // unique column, publicId. At 32 base32 characters that is not something
    // that happens; if it ever does, a retry mints a fresh id. Reported as a
    // failure rather than fabricating an id for a row that was never written.
    return {
      ok: false,
      reason: "certificate upsert hit a unique violation but no certificate exists for this user"
    };
  }
}

type IssueInput = {
  userId: string;
  learnerPhone: string;
  plan: IssuePlan;
  baseUrl: string;
  caption: string;
  storeForTests?: CertificateStore | undefined;
};

/**
 * Writes the certificate, then sends it.
 *
 * NEVER THROWS. The caller is a bot turn: a learner who has just finished the
 * programme cannot be handed an exception, and there is no layer above this one
 * that could turn it into anything she should read. Every outcome — including a
 * database that is down — comes back as an IssueOutcome.
 */
export async function issueCertificate(input: IssueInput): Promise<IssueOutcome> {
  try {
    return await issueCertificateInner(input);
  } catch (error) {
    // Backstop. Every KNOWN failure is already converted to an outcome below,
    // so reaching here is a bug rather than a bad day — hence its own event, so
    // it stays visible instead of blending into ordinary send failures. It
    // exists so the promise above survives a future edit that introduces a
    // throwing path.
    const reason = errorMessage(error);
    console.error(
      JSON.stringify({ event: "certificate.issue.crashed", userId: input.userId, reason })
    );
    return { status: "failed", reason };
  }
}

async function issueCertificateInner(input: IssueInput): Promise<IssueOutcome> {
  const { userId, plan } = input;
  const store = input.storeForTests ?? prismaCertificateStore;

  // PERSIST BEFORE SENDING, deliberately. If the send fails the certificate
  // still exists, and both the "My Certificate" menu entry and the admin Resend
  // action recover it. Sending first would mean a network blip between the send
  // and the write erases something a learner spent weeks earning, with nothing
  // left to recover it from.
  const persisted = await persistCertificate(store, userId, plan);
  if (!persisted.ok) {
    console.warn(
      JSON.stringify({ event: "certificate.issue.failed", userId, reason: persisted.reason })
    );
    // Deliberately carries NO publicId — see IssueOutcome.
    return { status: "failed", reason: persisted.reason };
  }

  // From the PERSISTED row, never from the plan. On a concurrent second call
  // the row that exists is the first call's, and plan.publicId is a freshly
  // minted id that was never written — a link built from it would point at a
  // verification page that does not exist.
  const publicId = persisted.publicId;

  let sent = false;
  let reason: string | undefined;
  try {
    const urls = certificateUrls(input.baseUrl, publicId);
    const result = await sendWhatsAppOutreach(input.learnerPhone, {
      kind: "image",
      link: urls.image,
      // The verify URL rides in the caption so the credential is checkable
      // from the chat itself, not only by scanning the QR off the image.
      caption: buildCertificateCaption(input.caption, urls.verify)
    });
    sent = result.status === "sent";
    if (result.status === "failed") reason = result.reason;
  } catch (error) {
    // Reached when the base URL is unconfigured. Caught rather than thrown on
    // because the row is already safe: this is a send failure, and the admin
    // Resend action recovers it once the config is fixed.
    reason = errorMessage(error);
  }

  console.log(
    JSON.stringify({
      event: "certificate.issued",
      userId,
      publicId,
      sent,
      ...(reason ? { reason } : {})
    })
  );

  return { status: "issued", publicId, sent };
}
