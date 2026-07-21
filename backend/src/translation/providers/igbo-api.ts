import type {
  TranslationConnectionResult,
  TranslationIntegrationPayload,
  TranslationOutcome,
  TranslationProvider,
  TranslationUnit
} from "./contracts.js";

/**
 * Nkọwa okwu Igbo API adapter.
 *
 * Endpoint (verified against their published reference):
 *   POST {baseUrl}/api/v2/translate
 *   headers: X-API-Key
 *   body:    { text, sourceLanguageCode, destinationLanguageCode }
 *   reply:   { translation }
 *
 * Two properties shape everything here:
 *
 * 1. **No batching.** One string per request, so `requestsPerUnit` is 1 and a
 *    full 602-string pass costs 602 requests against the daily cap.
 * 2. **English↔Igbo only.** It cannot produce Pidgin, which is why the config
 *    selects a provider per language rather than one globally.
 */

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

type Dependencies = { fetchImpl?: typeof fetch };

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/v2/translate`;
}

export function createIgboApiAdapter(dependencies: Dependencies = {}): TranslationProvider {
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  return {
    key: "igbo_api",
    supports: ["ig"],
    requestsPerUnit: 1,

    async verifyCredentials(
      config: TranslationIntegrationPayload
    ): Promise<TranslationConnectionResult> {
      const startedAt = Date.now();
      if (!config.igboApi.apiKey) {
        return { status: "failed", message: "Add an Igbo API key before testing." };
      }
      try {
        // A real translation of one short word is the only honest check: the
        // API has no dedicated health route, and a key can be present but
        // rejected or out of quota.
        const response = await fetchImpl(endpoint(config.igboApi.baseUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-API-Key": config.igboApi.apiKey
          },
          body: JSON.stringify({
            text: "water",
            sourceLanguageCode: "eng",
            destinationLanguageCode: "ibo"
          })
        });
        const latencyMs = Date.now() - startedAt;

        if (response.status === 429) {
          return {
            status: "degraded",
            latencyMs,
            message:
              "Key is valid but the daily request limit is currently exhausted. Translation will resume when it resets."
          };
        }
        if (!response.ok) {
          return {
            status: "failed",
            message: `Igbo API rejected the request (HTTP ${response.status}). Check the API key.`
          };
        }

        const body = (await response.json()) as { translation?: unknown };
        if (typeof body?.translation !== "string" || !body.translation.trim()) {
          return {
            status: "degraded",
            latencyMs,
            message: "Igbo API responded but returned no translation."
          };
        }
        return {
          status: "healthy",
          latencyMs,
          message: `Igbo API reachable. Translates English to Igbo, one string per request.`
        };
      } catch (error) {
        return {
          status: "failed",
          message: error instanceof Error ? error.message : String(error)
        };
      }
    },

    async translate(
      units: TranslationUnit[],
      config: TranslationIntegrationPayload
    ): Promise<TranslationOutcome[]> {
      const results: TranslationOutcome[] = [];

      // Sequential, not parallel: the cap is on requests per day and the
      // upstream is a small non-profit service. Hammering it concurrently
      // risks 429s that consume quota without producing translations.
      for (const unit of units) {
        if (unit.targetLanguage !== "ig") {
          results.push({
            id: unit.id,
            status: "failed",
            reason: "Igbo API cannot produce Nigerian Pidgin — use an LLM provider for pcm.",
            retryable: false
          });
          continue;
        }

        try {
          const response = await fetchImpl(endpoint(config.igboApi.baseUrl), {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-API-Key": config.igboApi.apiKey
            },
            body: JSON.stringify({
              text: unit.text,
              sourceLanguageCode: "eng",
              destinationLanguageCode: "ibo"
            })
          });

          if (!response.ok) {
            results.push({
              id: unit.id,
              status: "failed",
              reason: `HTTP ${response.status}`,
              retryable: RETRYABLE_STATUSES.has(response.status)
            });
            continue;
          }

          const body = (await response.json()) as { translation?: unknown };
          const text = typeof body?.translation === "string" ? body.translation.trim() : "";
          if (!text) {
            results.push({
              id: unit.id,
              status: "failed",
              reason: "Empty translation returned.",
              retryable: false
            });
            continue;
          }

          results.push({
            id: unit.id,
            status: "translated",
            text,
            // The API has no notion of a length budget, so the caller has to
            // know the result may not fit its WhatsApp constraint. Flagged
            // rather than truncated: cutting an Igbo string mid-word to reach
            // 20 characters produces nonsense a reviewer must rewrite anyway.
            overBudget: unit.maxLength !== undefined && text.length > unit.maxLength
          });
        } catch (error) {
          results.push({
            id: unit.id,
            status: "failed",
            reason: error instanceof Error ? error.message : String(error),
            retryable: true
          });
        }
      }

      return results;
    }
  };
}

export const igboApiAdapter = createIgboApiAdapter();
