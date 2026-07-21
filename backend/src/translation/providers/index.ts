import { igboApiAdapter } from "./igbo-api.js";
import { createLlmAdapter } from "./llm.js";
import type {
  TranslationConnectionResult,
  TranslationIntegrationPayload,
  TranslationLanguage,
  TranslationProvider,
  TranslationProviderKey
} from "./contracts.js";

const geminiAdapter = createLlmAdapter("gemini");
const anthropicAdapter = createLlmAdapter("anthropic");

export function selectTranslationAdapter(key: TranslationProviderKey): TranslationProvider {
  switch (key) {
    case "igbo_api":
      return igboApiAdapter;
    case "gemini":
      return geminiAdapter;
    case "anthropic":
      return anthropicAdapter;
  }
}

/** The provider configured for a given target language. */
export function adapterForLanguage(
  config: TranslationIntegrationPayload,
  language: TranslationLanguage
): TranslationProvider {
  return selectTranslationAdapter(config.providerByLanguage[language]);
}

/**
 * Test Connection: verify every DISTINCT provider referenced by the config, so
 * an admin learns up front that (say) their Gemini key works but their Igbo
 * key is rejected — rather than discovering it mid-run. Returns the worst
 * status seen, with a per-provider breakdown in the message.
 */
export async function verifyTranslationConfig(
  config: TranslationIntegrationPayload
): Promise<TranslationConnectionResult> {
  const keys = Array.from(new Set(Object.values(config.providerByLanguage)));
  const results = await Promise.all(
    keys.map(async (k) => ({ k, r: await selectTranslationAdapter(k).verifyCredentials(config) }))
  );
  const failed = results.filter((x) => x.r.status === "failed");
  const degraded = results.filter((x) => x.r.status === "degraded");
  const summary = results.map((x) => `${x.k}: ${x.r.status}`).join(", ");
  if (failed.length > 0) {
    return { status: "failed", message: `One or more providers failed — ${summary}. ${failed[0]!.r.message}` };
  }
  if (degraded.length > 0) {
    return { status: "degraded", latencyMs: 0, message: `Reachable with warnings — ${summary}.` };
  }
  return { status: "healthy", latencyMs: 0, message: `All configured providers reachable — ${summary}.` };
}
