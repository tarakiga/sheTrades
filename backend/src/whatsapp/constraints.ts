/**
 * WhatsApp Cloud API message constraints — the single source of truth for the
 * backend. `sender.ts` clips to these, `handler.ts` matches against them, and
 * the dashboard mirrors them in `dashboard/lib/whatsapp-constraints.ts` (kept in
 * sync by hand — there is no shared package across the app/backend boundary).
 *
 * All limits are counted in UTF-16 code units, which is what WhatsApp itself
 * counts (an emoji is 2). JavaScript's `String.length` is already UTF-16 code
 * units, so `whatsappLength` is just `.length` — do NOT swap it for a
 * code-point count (`[...s].length`), which would under-count emoji.
 */
export const WHATSAPP_LIMITS = {
  /** Interactive message body (buttons or list). Over this, WhatsApp REJECTS with #131009. */
  interactiveBody: 1024,
  /** Plain (non-interactive) text message body. */
  plainText: 4096,
  /** Reply-button title. Over this, the title is silently TRUNCATED on send. */
  buttonTitle: 20,
  /** Interactive list row title. Truncated on send if over. */
  listRowTitle: 24,
  /** Interactive list row description. Rejected/truncated if over. */
  listRowDescription: 72,
  /** Max reply buttons per interactive message. */
  maxButtons: 3,
  /** Max rows in an interactive list. */
  maxListRows: 10
} as const;

export type WhatsAppLimitKey = keyof typeof WHATSAPP_LIMITS;

/** UTF-16 code-unit length — WhatsApp's counting unit (emoji count as 2). */
export function whatsappLength(value: string): number {
  return (value ?? "").length;
}
