import { getConfigPlatformService } from "../config-platform/service.js";
import { getDraft, setStatus, type DraftStatus } from "./draft-store.js";
import type { DraftPayload } from "./extract.js";

type LangVariants = { en?: string; pcm?: string; ig?: string };
type LocalizedValue = string | LangVariants;

/** Set one language variant, preserving the others and upgrading a bare string. */
function setLangKey(value: LocalizedValue | undefined, lang: "pcm" | "ig", translated: string): LangVariants {
  const base: LangVariants = typeof value === "string" ? { en: value } : { ...(value ?? {}) };
  return { ...base, [lang]: translated };
}

/**
 * Merge a translation draft into a live content payload, changing ONLY the
 * target language. Pure — clones the input, never mutates it.
 *
 * answerIndex is never touched. A question whose option set is not FULLY
 * translated (any null) keeps all its options English, because a partial set
 * would misalign the answer. The question text may still translate.
 */
export function mergeTranslationIntoPayload(
  live: any,
  language: "pcm" | "ig",
  draft: DraftPayload
): any {
  const merged = structuredClone(live);

  if (typeof draft.title === "string" && draft.title.length > 0) {
    merged.title = setLangKey(merged.title, language, draft.title);
  }
  if (typeof draft.body === "string" && draft.body.length > 0) {
    merged.languages = { ...(merged.languages ?? {}), [language]: draft.body };
  }

  const draftQuiz = Array.isArray(draft.quiz) ? draft.quiz : [];
  const liveQuiz = Array.isArray(merged.quiz) ? merged.quiz : [];
  liveQuiz.forEach((q: any, qi: number) => {
    const dq = draftQuiz[qi];
    if (!dq) return;
    if (typeof dq.question === "string" && dq.question.length > 0) {
      q.question = setLangKey(q.question, language, dq.question);
    }
    const draftOptions = Array.isArray(dq.options) ? dq.options : [];
    const liveOptions = Array.isArray(q.options) ? q.options : [];
    const fullyTranslated =
      draftOptions.length === liveOptions.length &&
      draftOptions.every((o: unknown) => typeof o === "string" && o.length > 0);
    if (fullyTranslated) {
      q.options = liveOptions.map((o: LocalizedValue, oi: number) =>
        setLangKey(o, language, draftOptions[oi] as string)
      );
    }
    // else: options untouched — stay English so answerIndex remains valid.
  });

  return merged;
}

type Actor = { id: string; role: "admin" | "editor" | "viewer" };

export type PromoteDependencies = {
  service?: ReturnType<typeof getConfigPlatformService>;
  getDraftFn?: typeof getDraft;
  setStatusFn?: typeof setStatus;
};

/**
 * Promote an APPROVED translation draft into live content for one language.
 *
 * Refuses if the draft is not approved, or if the content document already has
 * a pending draft (an unrelated unfinished edit) — publishing is atomic over
 * the whole payload, so promoting on top of a pending draft would either
 * clobber it or ship it. The `expectedDraftVersionId` on publish is the atomic
 * backstop: if anything raced us between updateDraft and publish, publish fails
 * rather than shipping the wrong payload.
 */
export async function promoteDraft(
  actor: Actor,
  contentDocumentId: string,
  language: "pcm" | "ig",
  deps: PromoteDependencies = {}
): Promise<void> {
  const service = deps.service ?? getConfigPlatformService();
  const getDraftFn = deps.getDraftFn ?? getDraft;
  const setStatusFn = deps.setStatusFn ?? setStatus;

  const draft = await getDraftFn(contentDocumentId, language);
  if (!draft) throw new Error("Translation draft not found.");
  if (draft.status !== "approved") {
    throw new Error(`Only an approved draft can be promoted (this one is ${draft.status}).`);
  }

  const doc = await service.getDocumentByNamespaceKey("content", draft.contentKey);
  if (doc.draft) {
    throw new Error(
      "This lesson has unpublished changes; publish or discard them before promoting a translation."
    );
  }
  if (!doc.published) throw new Error("This lesson has no published version to translate.");

  const merged = mergeTranslationIntoPayload(doc.published.payload, language, draft.payload as DraftPayload);

  const updated = await service.updateDraft(actor, doc.document.id, {
    payload: merged,
    changeSummary: `Promote ${language} translation`
  });
  await service.publishDocument(actor, doc.document.id, {
    expectedDraftVersionId: updated.draft.id,
    publishNote: `Promote ${language} translation`
  });

  await setStatusFn(contentDocumentId, language, "promoted" as DraftStatus);
}
