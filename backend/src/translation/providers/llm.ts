import type {
  TranslationConnectionResult,
  TranslationIntegrationPayload,
  TranslationLanguage,
  TranslationOutcome,
  TranslationProvider,
  TranslationProviderKey,
  TranslationUnit
} from "./contracts.js";

type Dependencies = { fetchImpl?: typeof fetch };
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function languageName(l: TranslationLanguage): string {
  return l === "pcm" ? "Nigerian Pidgin (as spoken by traders, natural and warm — not textbook)" : "Igbo";
}

/** The instruction that makes output usable: target, register, length, context. */
function buildPrompt(unit: TranslationUnit): string {
  const lines = [
    `Translate the following English text into ${languageName(unit.targetLanguage)}.`,
    `This is for a WhatsApp learning bot teaching Nigerian women traders about business.`,
    unit.context ? `Context: ${unit.context}.` : "",
    unit.maxLength
      ? `The translation MUST be ${unit.maxLength} characters or fewer — it is shown on a small screen element. Prefer a shorter natural phrasing over a literal one.`
      : "",
    `Reply with ONLY the translation. No quotes, no explanation, no preamble.`,
    ``,
    `English: ${unit.text}`
  ];
  return lines.filter(Boolean).join("\n");
}

/** Strip common LLM wrappers: surrounding quotes, "Here is the translation:" etc. */
function cleanOutput(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^(here (is|'s) the translation[:\s]*)/i, "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

async function callGemini(
  prompt: string,
  config: TranslationIntegrationPayload,
  fetchImpl: typeof fetch
): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  const model = config.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.gemini.apiKey)}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!response.ok) return { ok: false, status: response.status, message: `HTTP ${response.status}` };
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { ok: true, text };
}

async function callAnthropic(
  _prompt: string,
  _config: TranslationIntegrationPayload,
  _fetchImpl: typeof fetch
): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  // NOT IMPLEMENTED BY DESIGN. The operator uses Gemini; an untested Anthropic
  // integration for a key nobody has is wasted work. To implement: load the
  // claude-api skill for the current model id and Messages API shape, then call
  // it with model = _config.anthropic.model, a single user message = _prompt,
  // and return the first text block. Same return shape as callGemini above.
  throw new Error("callAnthropic not implemented — load the claude-api skill to add it.");
}

export function createLlmAdapter(
  key: Extract<TranslationProviderKey, "gemini" | "anthropic">,
  dependencies: Dependencies = {}
): TranslationProvider {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const call = key === "gemini" ? callGemini : callAnthropic;
  const apiKeyOf = (c: TranslationIntegrationPayload) =>
    key === "gemini" ? c.gemini.apiKey : c.anthropic.apiKey;

  return {
    key,
    supports: ["pcm", "ig"],
    requestsPerUnit: 1,

    async verifyCredentials(config): Promise<TranslationConnectionResult> {
      const started = Date.now();
      if (!apiKeyOf(config)) return { status: "failed", message: `Add a ${key} API key before testing.` };
      try {
        const r = await call(buildPrompt({ id: "t", text: "water", targetLanguage: "ig" }), config, fetchImpl);
        const latencyMs = Date.now() - started;
        if (!r.ok) return { status: "failed", message: `${key} rejected the request (${r.message}).` };
        if (!cleanOutput(r.text)) return { status: "degraded", latencyMs, message: `${key} responded but returned no text.` };
        return { status: "healthy", latencyMs, message: `${key} reachable; can produce Pidgin and Igbo.` };
      } catch (error) {
        return { status: "failed", message: error instanceof Error ? error.message : String(error) };
      }
    },

    async translate(units, config): Promise<TranslationOutcome[]> {
      const out: TranslationOutcome[] = [];
      for (const unit of units) {
        try {
          const r = await call(buildPrompt(unit), config, fetchImpl);
          if (!r.ok) {
            out.push({ id: unit.id, status: "failed", reason: r.message, retryable: RETRYABLE.has(r.status) });
            continue;
          }
          const text = cleanOutput(r.text);
          if (!text) {
            out.push({ id: unit.id, status: "failed", reason: "Empty model response.", retryable: false });
            continue;
          }
          out.push({
            id: unit.id,
            status: "translated",
            text,
            overBudget: unit.maxLength !== undefined && text.length > unit.maxLength
          });
        } catch (error) {
          out.push({ id: unit.id, status: "failed", reason: error instanceof Error ? error.message : String(error), retryable: true });
        }
      }
      return out;
    }
  };
}
