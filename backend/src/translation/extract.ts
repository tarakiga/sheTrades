import { createHash } from "node:crypto";
import { WHATSAPP_LIMITS } from "../whatsapp/constraints.js";
import type { TranslationLanguage, TranslationOutcome, TranslationUnit } from "./providers/contracts.js";
import { pickLocalized, type LocalizedValue } from "../config-platform/runtime-config.js";

/** The English source strings that define a lesson's meaning, for hashing. */
function englishStrings(lesson: any): string[] {
  const out: string[] = [];
  out.push(pickLocalized(lesson?.title as LocalizedValue, "en"));
  out.push(String(lesson?.languages?.en ?? ""));
  for (const q of (Array.isArray(lesson?.quiz) ? lesson.quiz : [])) {
    out.push(pickLocalized(q?.question as LocalizedValue, "en"));
    for (const o of (Array.isArray(q?.options) ? q.options : [])) {
      out.push(pickLocalized(o as LocalizedValue, "en"));
    }
  }
  return out;
}

/** Stable content hash of the English source. Detects post-translation drift. */
export function hashSource(lesson: any): string {
  return createHash("sha256").update(englishStrings(lesson).join(" ")).digest("hex");
}

/**
 * Turn a lesson into translation units. Ids encode POSITION (`q0.opt2`) so the
 * result can be reassembled by id — never by the order a provider returns.
 * Each unit carries the WhatsApp budget for its own string.
 */
export function extractUnits(lesson: any, target: TranslationLanguage): TranslationUnit[] {
  const units: TranslationUnit[] = [];
  const en = (v: unknown) => pickLocalized(v as LocalizedValue, "en");

  const title = en(lesson?.title);
  if (title) {
    units.push({ id: "title", text: title, targetLanguage: target, maxLength: WHATSAPP_LIMITS.listRowTitle, context: "lesson title shown as a WhatsApp list row" });
  }
  const body = String(lesson?.languages?.en ?? "");
  if (body) {
    units.push({ id: "body", text: body, targetLanguage: target, maxLength: WHATSAPP_LIMITS.interactiveBody, context: "lesson body shown in a WhatsApp interactive message" });
  }
  (Array.isArray(lesson?.quiz) ? lesson.quiz : []).forEach((q: any, qi: number) => {
    const question = en(q?.question);
    if (question) {
      units.push({ id: `q${qi}.question`, text: question, targetLanguage: target, maxLength: WHATSAPP_LIMITS.interactiveBody, context: "quiz question" });
    }
    (Array.isArray(q?.options) ? q.options : []).forEach((o: any, oi: number) => {
      const opt = en(o);
      units.push({ id: `q${qi}.opt${oi}`, text: opt, targetLanguage: target, maxLength: WHATSAPP_LIMITS.buttonTitle, context: "quiz answer button — must be extremely short" });
    });
  });
  return units;
}

export type DraftPayload = {
  title?: string;
  body?: string;
  quiz: Array<{ question?: string; options: Array<string | null> }>;
};

/**
 * Reassemble outcomes into a draft payload BY ID. A failed option is stored as
 * null, which the promotion step reads as "leave this question's options
 * English" — a partial option set would misalign answerIndex.
 */
export function assembleDraftPayload(lesson: any, outcomes: TranslationOutcome[]): DraftPayload {
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  const textOf = (id: string): string | null => {
    const o = byId.get(id);
    return o && o.status === "translated" ? o.text : null;
  };

  const draft: DraftPayload = { quiz: [] };
  const title = textOf("title");
  if (title !== null) draft.title = title;
  const body = textOf("body");
  if (body !== null) draft.body = body;

  (Array.isArray(lesson?.quiz) ? lesson.quiz : []).forEach((q: any, qi: number) => {
    const question = textOf(`q${qi}.question`);
    const options = (Array.isArray(q?.options) ? q.options : []).map(
      (_o: unknown, oi: number) => textOf(`q${qi}.opt${oi}`)
    );
    draft.quiz.push({ ...(question !== null ? { question } : {}), options });
  });
  return draft;
}

/**
 * The lesson's ENGLISH strings, in the same `DraftPayload` shape as a
 * translation. The review UI shows this beside each editable field so a
 * reviewer can translate in place — the draft payload itself carries only the
 * translated strings, so a field that failed translation would otherwise be a
 * blank with nothing to translate FROM, forcing the reviewer to hunt down the
 * lesson. Every field is populated (English is always present), so the UI can
 * also flag any field whose source exists but whose translation is empty.
 */
export function englishDraftFromLesson(lesson: any): DraftPayload {
  const en = (v: unknown) => pickLocalized(v as LocalizedValue, "en");
  const draft: DraftPayload = { quiz: [] };
  const title = en(lesson?.title);
  if (title) draft.title = title;
  const body = String(lesson?.languages?.en ?? "");
  if (body) draft.body = body;
  (Array.isArray(lesson?.quiz) ? lesson.quiz : []).forEach((q: any) => {
    const question = en(q?.question);
    const options = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => en(o));
    draft.quiz.push({ ...(question ? { question } : {}), options });
  });
  return draft;
}
