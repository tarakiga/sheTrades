import { z } from "zod";

/**
 * Translation provider configuration.
 *
 * Deliberately provider-agnostic, because no single provider covers what this
 * programme needs:
 *
 *  - **Nigerian Pidgin (pcm) has no translation API at all.** Google added it
 *    to consumer Translate but never to Cloud Translation, so Pidgin can only
 *    be produced by an LLM that is prompted for it.
 *  - **Igbo API** (Nkọwa okwu) translates eng↔ibo, one string per request, with
 *    a daily request cap. It has no Pidgin support.
 *  - An **LLM** can do both, and — critically — can be told the 20-character
 *    WhatsApp button budget that quiz options must fit. A translation API
 *    cannot be given that constraint at all.
 *
 * So the adapter is the unit of substitution, and a deployment can use a
 * different provider per target language.
 */
export const TRANSLATION_LANGUAGES = ["pcm", "ig"] as const;
export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number];

export const translationProviderKeySchema = z.enum(["igbo_api", "gemini", "anthropic"]);
export type TranslationProviderKey = z.infer<typeof translationProviderKeySchema>;

export const translationIntegrationPayloadSchema = z.object({
  title: z.string().min(1),
  enabled: z.boolean().default(true),

  /**
   * Which provider handles each target language. Per-language rather than a
   * single global choice because the Igbo API cannot produce Pidgin, so a
   * one-provider setting would force a worse Igbo result or no Pidgin at all.
   */
  providerByLanguage: z.object({
    pcm: translationProviderKeySchema.default("gemini"),
    ig: translationProviderKeySchema.default("gemini")
  }),

  igboApi: z
    .object({
      apiKey: z.string().trim().default(""),
      baseUrl: z.string().trim().url().default("https://igboapi.com"),
      /**
       * Requests permitted per day. Nkọwa okwu document 2,500; some keys report
       * lower. Configurable so the runner paces itself against the real cap
       * rather than an assumed one, and stops cleanly instead of collecting
       * a wall of 429s.
       */
      dailyRequestLimit: z.coerce.number().int().min(1).max(100_000).default(2500)
    })
    .default({ apiKey: "", baseUrl: "https://igboapi.com", dailyRequestLimit: 2500 }),

  gemini: z
    .object({
      apiKey: z.string().trim().default(""),
      model: z.string().trim().min(1).default("gemini-2.5-flash")
    })
    .default({ apiKey: "", model: "gemini-2.5-flash" }),

  anthropic: z
    .object({
      apiKey: z.string().trim().default(""),
      model: z.string().trim().min(1).default("claude-sonnet-5")
    })
    .default({ apiKey: "", model: "claude-sonnet-5" }),

  notes: z.string().max(1000).optional().default("")
});

export type TranslationIntegrationPayload = z.infer<typeof translationIntegrationPayloadSchema>;

export type TranslationConnectionResult =
  | { status: "healthy"; latencyMs: number; message: string }
  | { status: "degraded"; latencyMs: number; message: string }
  | { status: "failed"; message: string };

/**
 * One string to translate.
 *
 * `maxLength` carries the WhatsApp budget for this specific string — 20 for a
 * quiz option button, 1024 for an interactive body. Providers that can honour
 * a length constraint (LLMs) are given it; those that cannot (translation APIs)
 * ignore it, and the caller validates the result instead. Either way the
 * budget travels with the string rather than being re-derived downstream.
 */
export type TranslationUnit = {
  id: string;
  text: string;
  targetLanguage: TranslationLanguage;
  maxLength?: number;
  /** Free-text hint, e.g. "quiz answer button" — improves LLM output markedly. */
  context?: string;
};

export type TranslationOutcome =
  | { id: string; status: "translated"; text: string; overBudget: boolean }
  | { id: string; status: "failed"; reason: string; retryable: boolean };

export interface TranslationProvider {
  readonly key: TranslationProviderKey;
  /** Languages this provider can actually produce. */
  readonly supports: ReadonlyArray<TranslationLanguage>;
  /** Requests consumed per unit — 1 for single-string APIs, fewer if batched. */
  readonly requestsPerUnit: number;
  verifyCredentials(config: TranslationIntegrationPayload): Promise<TranslationConnectionResult>;
  translate(
    units: TranslationUnit[],
    config: TranslationIntegrationPayload
  ): Promise<TranslationOutcome[]>;
}

/** Providers that can produce a given language, for validation and UI hints. */
export function providersSupporting(
  language: TranslationLanguage
): ReadonlyArray<TranslationProviderKey> {
  // The Igbo API is eng<->ibo only. Selecting it for Pidgin is a
  // misconfiguration that would silently produce nothing, so it is rejected
  // rather than allowed to fail at run time.
  return language === "ig" ? ["igbo_api", "gemini", "anthropic"] : ["gemini", "anthropic"];
}
