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
 * every issued row alongside its version so a reissue can reproduce the
 * original artwork even after the template has been redesigned.
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
    templateVersion: input.templateVersion
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
 * Writes the certificate, then sends it. Never throws: the caller is a bot
 * turn, and a learner who has just finished the programme must not see a
 * crash. A failed send comes back as `sent: false` with the reason in the log.
 */
export async function issueCertificate(input: {
  userId: string;
  learnerPhone: string;
  plan: IssuePlan;
  baseUrl: string;
  caption: string;
}): Promise<{ publicId: string; sent: boolean }> {
  const { userId, plan } = input;

  // PERSIST BEFORE SENDING, deliberately. If the send fails the certificate
  // still exists, and both the "My Certificate" menu entry and the admin
  // Resend action recover it. Sending first would mean a network blip between
  // the send and the write erases something a learner spent weeks earning,
  // with nothing left to recover it from.
  const row = await prisma.certificate.upsert({
    where: { userId },
    create: {
      publicId: plan.publicId,
      userId,
      learnerName: plan.learnerName,
      programmeName: plan.programmeName,
      modulesCompleted: plan.modulesCompleted,
      totalModules: plan.totalModules,
      templateKey: plan.templateKey,
      templateVersion: plan.templateVersion
    },
    // Empty ON PURPOSE. An already-issued certificate is never silently
    // replaced — its name, counts and template version are the historical
    // record — and this is what makes concurrent module_completed events
    // idempotent instead of racing to overwrite each other.
    update: {},
    select: { publicId: true }
  });

  // From the RETURNED row, never from the plan. On a concurrent second call
  // the upsert resolves to the EXISTING row, and plan.publicId is a freshly
  // minted id that was never written — a link built from it would point at a
  // verification page that does not exist.
  const publicId = row.publicId;

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
    // because the row above is already safe: this is a send failure, and the
    // admin Resend action recovers it once the config is fixed.
    reason = error instanceof Error ? error.message : String(error);
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

  return { publicId, sent };
}
