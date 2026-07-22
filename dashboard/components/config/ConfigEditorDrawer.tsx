"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Button, ConstraintMeter, Input, SideDrawer, Textarea, RichTextEditor } from "../ui";
import { ContentFormWalkthrough } from "../content/ContentFormWalkthrough";
import {
  WHATSAPP_LIMITS,
  waLen,
  composeLessonBody,
  composeQuizQuestion,
  type WhatsAppLang
} from "../../lib/whatsapp-constraints";

/**
 * Per-language editing buffer for a learner-facing string (title / quiz
 * question / quiz option). Backward compatible with legacy bare strings: a
 * plain string is read as English, and we only serialize the object form once a
 * Pidgin/Igbo variant exists (English-only stays a bare string, like `languages`).
 */
type LangObj = { en: string; pcm: string; ig: string };
type LocalizedValue = string | { en: string; pcm?: string; ig?: string };

const emptyLangObj = (): LangObj => ({ en: "", pcm: "", ig: "" });

const fromLocalized = (value: LocalizedValue | undefined | null): LangObj => {
  if (value == null) return emptyLangObj();
  if (typeof value === "string") return { en: value, pcm: "", ig: "" };
  return { en: value.en || "", pcm: value.pcm || "", ig: value.ig || "" };
};

/**
 * Shape of a lesson/content JSON payload as parsed from the editor's raw text.
 * Deliberately permissive - the values come from admin-authored JSON - but typed
 * enough to drop the `any` the parse routine used to lean on.
 */
type ParsedQuizItem = {
  question?: LocalizedValue;
  options?: LocalizedValue[];
  answerIndex?: number;
  kind?: string;
  helpOptionIndex?: number;
};

type ParsedConfigPayload = {
  title?: LocalizedValue;
  module?: string;
  languages?: { en?: string; pcm?: string; ig?: string };
  audioUrls?: { en?: string; pcm?: string; ig?: string };
  quiz?: ParsedQuizItem[];
  en?: string;
  pcm?: string;
  ig?: string;
  [key: string]: unknown;
};

const toLocalized = (obj: LangObj): LocalizedValue => {
  const hasTranslation = obj.pcm.trim().length > 0 || obj.ig.trim().length > 0;
  if (!hasTranslation) return obj.en;
  return {
    en: obj.en,
    ...(obj.pcm.trim() ? { pcm: obj.pcm } : {}),
    ...(obj.ig.trim() ? { ig: obj.ig } : {})
  };
};

/** Resolve a LangObj for a language with English fallback (mirrors backend pickLocalized). */
const pickLang = (obj: LangObj, lang: WhatsAppLang): string => obj[lang] || obj.en || "";

type WorkflowFeedback = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type DrawerTemplate = {
  id: string;
  label: string;
};

export type ConfigEditorDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  namespaceLabel: string;
  title: string;
  description: string;
  keyLabel: string;
  keyValue: string;
  keyPlaceholder: string;
  onKeyChange: (value: string) => void;
  keyField?: ReactNode;
  titleLabel?: string;
  titleValue?: string;
  titlePlaceholder?: string;
  onTitleChange?: (value: string) => void;
  payloadLabel: string;
  payloadValue: string;
  payloadPlaceholder: string;
  payloadHint?: string;
  onPayloadChange: (value: string) => void;
  keyReadOnly?: boolean;
  feedback?: WorkflowFeedback | null;
  templates?: Array<DrawerTemplate>;
  onTemplateSelect?: (templateId: string) => void;
  saving: boolean;
  primaryActionLabel: string;
  primaryActionDisabled?: boolean;
  onPrimaryAction: () => void;
  secondaryActions?: ReactNode;
  onClose: () => void;
  // Custom non-technical extensions
  namespace?: string;
  existingModules?: string[];
};

export function ConfigEditorDrawer({
  open,
  mode,
  namespaceLabel,
  title,
  description,
  keyLabel,
  keyValue,
  keyPlaceholder,
  onKeyChange,
  keyField,
  titleLabel,
  titleValue = "",
  titlePlaceholder = "",
  onTitleChange,
  payloadLabel,
  payloadValue,
  payloadPlaceholder,
  payloadHint,
  onPayloadChange,
  keyReadOnly = false,
  feedback,
  templates = [],
  onTemplateSelect,
  saving,
  primaryActionLabel,
  primaryActionDisabled = false,
  onPrimaryAction,
  secondaryActions,
  onClose,
  namespace,
  existingModules = []
}: ConfigEditorDrawerProps) {
  // Mode selection: "wizard" for non-tech friendly, "json" for power users
  const [editorModeState, setEditorModeState] = useState<"wizard" | "json">("json");
  const lastOpenRef = useRef(false);
  const [activeStep, setActiveStep] = useState(1);
  const [isLesson, setIsLesson] = useState(false);
  const [previewLanguage, setPreviewLanguage] = useState<"en" | "pcm" | "ig">("en");
  const [activeTabLanguage, setActiveTabLanguage] = useState<"en" | "pcm" | "ig">("en");
  const [showAudioAccordion, setShowAudioAccordion] = useState(false);
  const [simulatorSelectedAnswer, setSimulatorSelectedAnswer] = useState<Record<number, number>>({});

  // Curriculum states. `titleI18n` and each quiz question/option are now
  // language-aware (LangObj); the WhatsApp answer index stays shared.
  const [titleI18n, setTitleI18n] = useState<LangObj>(emptyLangObj());
  const [lessonModule, setLessonModule] = useState("");
  const [customModuleNumber, setCustomModuleNumber] = useState("");
  const [customModuleTitle, setCustomModuleTitle] = useState("");
  const [showCustomModuleInput, setShowCustomModuleInput] = useState(false);
  const [languages, setLanguages] = useState({ en: "", pcm: "", ig: "" });
  const [audioUrls, setAudioUrls] = useState({ en: "", pcm: "", ig: "" });
  const [quiz, setQuiz] = useState<
    Array<{
      question: LangObj;
      options: LangObj[];
      answerIndex: number;
      // "scored" = a knowledge check with one right answer. "reflection" = a
      // check-in that accepts every answer and always advances; an optional
      // help option flags the learner for follow-up.
      kind: "scored" | "reflection";
      helpOptionIndex: number | null;
    }>
  >([]);

  // Generic translation state
  const [translationCopy, setTranslationCopy] = useState({ en: "", pcm: "", ig: "" });
  const [extraPayloadFields, setExtraPayloadFields] = useState<Record<string, unknown>>({});

  // Expanded quiz question index
  const [expandedQuizIndex, setExpandedQuizIndex] = useState<number | null>(0);

  // Sync tracking to prevent infinite state updates
  const [localSerialized, setLocalSerialized] = useState("");

  // Parse payload JSON on mount or open
  useEffect(() => {
    if (open && !lastOpenRef.current) {
      setActiveStep(1);
      setSimulatorSelectedAnswer({});
      if (namespace === "content") {
        setEditorModeState("wizard");
      } else {
        setEditorModeState("json");
      }
      parseAndSetPayload(payloadValue);
    }
    lastOpenRef.current = open;
  }, [open]);

  // Sync if payloadValue is changed externally (e.g. templates applied)
  useEffect(() => {
    if (open && payloadValue !== localSerialized) {
      parseAndSetPayload(payloadValue);
    }
  }, [payloadValue]);

  // Update isLesson state when keyValue changes, without wiping state or resetting step
  useEffect(() => {
    if (!open) return;
    const segments = keyValue.split(".");
    const isLessonKey = segments[0] === "content" && segments[1] === "lesson";
    if (isLessonKey !== isLesson) {
      const parsePayloadIsLesson = (val: string) => {
        try {
          const parsed = JSON.parse(val);
          return Boolean(
            parsed &&
              typeof parsed === "object" &&
              ("languages" in parsed || "quiz" in parsed || "module" in parsed)
          );
        } catch {
          return false;
        }
      };

      const hasDefinedNonLessonCategory = segments[1] && segments[1] !== "lesson";
      const shouldSetFalse = hasDefinedNonLessonCategory || (!segments[1] && !parsePayloadIsLesson(payloadValue));

      if (isLessonKey || shouldSetFalse) {
        setIsLesson(isLessonKey);
        const maxSteps = isLessonKey ? 4 : 3;
        setActiveStep((prev) => Math.min(prev, maxSteps));
        parseAndSetPayload(payloadValue);
      }
    }
  }, [keyValue, open, isLesson, payloadValue]);

  const parseAndSetPayload = (value: string) => {
    let detectedIsLesson = false;
    let parsed: ParsedConfigPayload | null = null;
    try {
      if (value) {
        parsed = JSON.parse(value) as ParsedConfigPayload;
      }
    } catch {
      // Ignore parsing error
    }

    const segments = keyValue.split(".");
    const isLessonKey = segments[0] === "content" && segments[1] === "lesson";
    const hasDefinedNonLessonCategory = segments[1] && segments[1] !== "lesson";

    if (!hasDefinedNonLessonCategory) {
      if (
        isLessonKey ||
        (parsed &&
          typeof parsed === "object" &&
          ("languages" in parsed || "quiz" in parsed || "module" in parsed))
      ) {
        detectedIsLesson = true;
      }
    }

    setIsLesson(detectedIsLesson);
    setLocalSerialized(value);

    if (detectedIsLesson) {
      setTitleI18n(fromLocalized(parsed?.title));
      setLessonModule(parsed?.module || "");
      setShowCustomModuleInput(false);
      setCustomModuleNumber("");
      setCustomModuleTitle("");
      setLanguages({
        en: parsed?.languages?.en || parsed?.en || "",
        pcm: parsed?.languages?.pcm || parsed?.pcm || "",
        ig: parsed?.languages?.ig || parsed?.ig || ""
      });
      setAudioUrls({
        en: parsed?.audioUrls?.en || "",
        pcm: parsed?.audioUrls?.pcm || "",
        ig: parsed?.audioUrls?.ig || ""
      });
      const rawQuiz: ParsedQuizItem[] = Array.isArray(parsed?.quiz) ? (parsed?.quiz ?? []) : [];
      setQuiz(
        rawQuiz.map((q) => ({
          question: fromLocalized(q?.question),
          options:
            Array.isArray(q?.options) && q.options.length > 0
              ? q.options.map(fromLocalized)
              : [emptyLangObj(), emptyLangObj()],
          answerIndex: typeof q?.answerIndex === "number" ? q.answerIndex : 0,
          // Absent `kind` in stored JSON means "scored" (backend contract).
          kind: q?.kind === "reflection" ? "reflection" : "scored",
          helpOptionIndex:
            typeof q?.helpOptionIndex === "number" ? q.helpOptionIndex : null
        }))
      );
    } else {
      setTranslationCopy({
        en: parsed?.en || parsed?.languages?.en || (typeof value === "string" ? value : ""),
        pcm: parsed?.pcm || parsed?.languages?.pcm || "",
        ig: parsed?.ig || parsed?.languages?.ig || ""
      });
      const extras: Record<string, unknown> = {};
      if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach((k) => {
          if (
            k !== "en" &&
            k !== "pcm" &&
            k !== "ig" &&
            k !== "languages" &&
            k !== "audioUrls" &&
            k !== "quiz" &&
            k !== "title" &&
            k !== "module"
          ) {
            extras[k] = parsed[k];
          }
        });
      }
      setExtraPayloadFields(extras);
    }
  };

  // syncPayload is now a no-op to allow unified, safe, after-render updates in useEffect
  const syncPayload = (..._args: unknown[]) => {};

  // Synchronize state changes back to parent payload
  useEffect(() => {
    if (!open) return;

    // If the parent payloadValue is different from our localSerialized,
    // it means a parent-initiated change (like applying a template or loading)
    // is in progress. We should NOT sync our local state back to the parent yet,
    // because our local state is still stale and waiting for parseAndSetPayload to run.
    if (payloadValue !== localSerialized) {
      return;
    }

    try {
      let str = "";
      if (isLesson) {
        const payload = {
          title: toLocalized(titleI18n),
          module: lessonModule,
          languages: {
            en: languages.en,
            ...(languages.pcm ? { pcm: languages.pcm } : {}),
            ...(languages.ig ? { ig: languages.ig } : {})
          },
          audioUrls: {
            ...(audioUrls.en ? { en: audioUrls.en } : {}),
            ...(audioUrls.pcm ? { pcm: audioUrls.pcm } : {}),
            ...(audioUrls.ig ? { ig: audioUrls.ig } : {})
          },
          quiz: quiz.map((q) => ({
            question: toLocalized(q.question),
            // Keep options whose English (base) text is non-empty; carry each
            // option's translations with it.
            options: q.options.filter((o) => o.en.trim().length > 0).map(toLocalized),
            answerIndex: q.answerIndex,
            // Only emit the reflection keys when they mean something, so a
            // scored question serializes byte-identically to before this
            // feature existed - opening a lesson must not create a spurious
            // version-history diff.
            ...(q.kind === "reflection" ? { kind: "reflection" } : {}),
            ...(q.kind === "reflection" && q.helpOptionIndex !== null
              ? { helpOptionIndex: q.helpOptionIndex }
              : {})
          }))
        };
        str = JSON.stringify(payload, null, 2);
      } else {
        const payload = {
          en: translationCopy.en,
          ...(translationCopy.pcm ? { pcm: translationCopy.pcm } : {}),
          ...(translationCopy.ig ? { ig: translationCopy.ig } : {}),
          ...extraPayloadFields
        };
        str = JSON.stringify(payload, null, 2);
      }

      if (str !== payloadValue && str !== localSerialized) {
        setLocalSerialized(str);
        onPayloadChange(str);
      }
    } catch {
      // Catch silently
    }
  }, [
    open,
    isLesson,
    titleI18n,
    lessonModule,
    languages,
    audioUrls,
    quiz,
    translationCopy,
    extraPayloadFields,
    payloadValue,
    localSerialized
  ]);

  // Quiz Builder utilities (state changes flow back to the payload via the
  // serialize effect, so these no longer call the no-op syncPayload).
  const handleAddQuestion = () => {
    const next = [
      ...quiz,
      {
        question: emptyLangObj(),
        options: [emptyLangObj(), emptyLangObj(), emptyLangObj()],
        answerIndex: 0,
        kind: "scored" as const,
        helpOptionIndex: null
      }
    ];
    setQuiz(next);
    setExpandedQuizIndex(next.length - 1);
  };

  const handleRemoveQuestion = (index: number) => {
    const next = quiz.filter((_, i) => i !== index);
    setQuiz(next);
    setExpandedQuizIndex(next.length > 0 ? 0 : null);
  };

  // Set the active-language text of a question.
  const setQuizQuestionText = (index: number, lang: WhatsAppLang, val: string) => {
    setQuiz((prev) =>
      prev.map((q, i) => (i === index ? { ...q, question: { ...q.question, [lang]: val } } : q))
    );
  };

  // Set the active-language text of a single option.
  const setQuizOptionText = (index: number, optIdx: number, lang: WhatsAppLang, val: string) => {
    setQuiz((prev) =>
      prev.map((q, i) =>
        i === index
          ? { ...q, options: q.options.map((o, oi) => (oi === optIdx ? { ...o, [lang]: val } : o)) }
          : q
      )
    );
  };

  // Mark the correct answer (shared across languages - position is stable).
  const setQuizAnswerIndex = (index: number, optIdx: number) => {
    setQuiz((prev) => prev.map((q, i) => (i === index ? { ...q, answerIndex: optIdx } : q)));
  };

  // Switch a question between a scored knowledge check and a reflection
  // check-in. Going back to "scored" clears the help option, which is
  // meaningless there and must not leak into the serialized payload.
  const setQuizKind = (index: number, kind: "scored" | "reflection") => {
    setQuiz((prev) =>
      prev.map((q, i) =>
        i === index
          ? { ...q, kind, helpOptionIndex: kind === "scored" ? null : q.helpOptionIndex }
          : q
      )
    );
  };

  // Toggle which option means "I need help" on a reflection question.
  // Clicking the already-selected option clears it (help is optional).
  const setQuizHelpOptionIndex = (index: number, optIdx: number) => {
    setQuiz((prev) =>
      prev.map((q, i) =>
        i === index ? { ...q, helpOptionIndex: q.helpOptionIndex === optIdx ? null : optIdx } : q
      )
    );
  };

  // Helper to format text with WhatsApp markdown style
  const formatWhatsAppText = (text: string) => {
    if (!text) return "";
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/\*(.*?)\*/g, "<strong>$1</strong>");
    html = html.replace(/_(.*?)_/g, "<em>$1</em>");
    html = html.replace(/~(.*?)~/g, "<del>$1</del>");
    html = html.replace(/\n/g, "<br />");
    return html;
  };

  const currentSteps = isLesson
    ? [
        { id: 1, label: "Info" },
        { id: 2, label: "Content" },
        { id: 3, label: "Quiz" },
        { id: 4, label: "Preview" }
      ]
    : [
        { id: 1, label: "Info" },
        { id: 2, label: "Content" },
        { id: 3, label: "Preview" }
      ];

  useEffect(() => {
    if (activeStep > currentSteps.length) {
      setActiveStep(currentSteps.length);
    }
  }, [isLesson, activeStep, currentSteps.length]);

  // Active validation checks to enable Next step and Submit
  const isStepValid = () => {
    if (activeStep === 1) {
      const isKeyValid =
        mode === "create"
          ? keyValue.trim().length > 0 &&
            !keyValue.endsWith(".") &&
            !keyValue.includes("..")
          : true;
      if (isLesson) {
        return isKeyValid && titleI18n.en.trim().length > 0 && lessonModule.trim().length > 0;
      } else {
        return isKeyValid;
      }
    }
    if (activeStep === 2) {
      if (isLesson) {
        return languages.en.trim().length > 0;
      } else {
        return translationCopy.en.trim().length > 0;
      }
    }
    if (activeStep === 3) {
      if (isLesson) {
        return quiz.every(
          (q) =>
            q.question.en.trim().length > 0 &&
            q.options.filter((o) => o.en.trim().length > 0).length >= 2
        );
      }
      return true;
    }
    return true;
  };

  const isAllDataValid = () => {
    const isKeyValid =
      mode === "create"
        ? keyValue.trim().length > 0 &&
          !keyValue.endsWith(".") &&
          !keyValue.includes("..")
        : true;
    if (!isKeyValid) return false;

    if (isLesson) {
      return (
        titleI18n.en.trim().length > 0 &&
        lessonModule.trim().length > 0 &&
        languages.en.trim().length > 0
      );
    } else {
      return translationCopy.en.trim().length > 0;
    }
  };

  const getValidationHint = () => {
    if (mode === "create") {
      const segments = keyValue.split(".");
      const hasCategory = segments[1] && segments[1].trim().length > 0;
      if (!hasCategory) return "Choose a category on Step 1 to continue.";
      const hasSlug = segments[2] && segments[2].trim().length > 0;
      if (!hasSlug) return "Enter a name slug on Step 1 to continue.";
      if (!/^[a-z0-9_.-]+$/.test(segments[2] || "")) return "Name slug must be lowercase, alphanumeric/dashes.";
    }

    if (isLesson) {
      if (!lessonModule.trim()) return "Please select or add a module on Step 1.";
      if (!titleI18n.en.trim()) return "Please enter a lesson title on Step 1.";
      if (!languages.en.trim()) return "Please fill in the English lesson body on Step 2.";
    } else {
      if (!translationCopy.en.trim()) return "Please fill in the English text copy on Step 2.";
    }

    return null;
  };

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      description={description}
      footerActions={
        <div className="config-drawer__footer">
          <div className="config-drawer__footer-group config-drawer__footer-group--utility">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {secondaryActions}
          </div>
          <div className="config-drawer__footer-group config-drawer__footer-group--primary" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            {editorModeState === "wizard" && namespace === "content" && getValidationHint() && (
              <span className="config-drawer__validation-hint" style={{ fontSize: "11px", color: "var(--color-danger)", marginRight: "var(--space-2)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span>⚠️</span> <span>{getValidationHint()}</span>
              </span>
            )}
            {editorModeState === "wizard" && namespace === "content" ? (
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {activeStep > 1 && (
                  <Button variant="secondary" onClick={() => setActiveStep((prev) => prev - 1)}>
                    ← Back
                  </Button>
                )}
                {activeStep < currentSteps.length && (
                  <Button
                    variant="secondary"
                    disabled={!isStepValid()}
                    onClick={() => setActiveStep((prev) => prev + 1)}
                  >
                    Next Step →
                  </Button>
                )}
                <Button
                  disabled={primaryActionDisabled || !isAllDataValid()}
                  loading={saving}
                  onClick={onPrimaryAction}
                >
                  {primaryActionLabel}
                </Button>
              </div>
            ) : (
              /* If JSON mode, or not in "content" namespace, show the normal save button directly */
              <Button disabled={primaryActionDisabled} loading={saving} onClick={onPrimaryAction}>
                {primaryActionLabel}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="settings-editor-drawer">
        <div className="settings-editor-drawer__meta">
          <Badge variant="info">{namespaceLabel}</Badge>
          <Badge variant="neutral">{mode === "create" ? "New Item" : "Editing Draft"}</Badge>
          {namespace === "content" ? (
            <span className="settings-editor-drawer__tour">
              <ContentFormWalkthrough />
            </span>
          ) : null}
        </div>

        {/* 1. Mode Selector Toggle */}
        {namespace === "content" ? (
          <div className="wizard-mode-toggle" role="group" aria-label="Editor mode">
            <button
              type="button"
              className={`wizard-mode-toggle__btn ${
                editorModeState === "wizard" ? "wizard-mode-toggle__btn--active" : ""
              }`}
              aria-pressed={editorModeState === "wizard"}
              onClick={() => setEditorModeState("wizard")}
            >
              🪄 Visual Wizard
            </button>
            <button
              type="button"
              className={`wizard-mode-toggle__btn ${
                editorModeState === "json" ? "wizard-mode-toggle__btn--active" : ""
              }`}
              aria-pressed={editorModeState === "json"}
              onClick={() => setEditorModeState("json")}
            >
              💻 Raw JSON Editor
            </button>
          </div>
        ) : null}

        {/* 2. Visual Content Step Wizard */}
        {editorModeState === "wizard" && namespace === "content" ? (
          <div className="wizard-container">
            {isLesson ? (
              <>
                {/* Visual Step Tracker */}
                <div className="wizard-progress">
                  <div className="wizard-progress__track">
                    <div
                      className="wizard-progress__bar"
                      style={{ width: `${((activeStep - 1) / (currentSteps.length - 1)) * 100}%` }}
                    />
                  </div>
                  <div className="wizard-progress__steps">
                    {currentSteps.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`wizard-progress__step ${
                          activeStep === s.id
                            ? "wizard-progress__step--active"
                            : activeStep > s.id
                            ? "wizard-progress__step--completed"
                            : ""
                        }`}
                        onClick={() => {
                          // Allow jumping back to completed or valid steps
                          if (s.id < activeStep || isStepValid()) {
                            setActiveStep(s.id);
                          }
                        }}
                      >
                        <span className="wizard-progress__step-circle">
                          {activeStep > s.id ? "✓" : s.id}
                        </span>
                        <span className="wizard-progress__step-label">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* STEP 1: MODULE & METADATA */}
                {activeStep === 1 && (
                  <div className="wizard-panel">
                    <div className="wizard-panel__section">
                      <h4 className="wizard-panel__section-title">
                        📚 Categorization & System Name
                      </h4>
                      {/* Name Builder provided by page */}
                      {keyField ?? (
                        <div className="preview-row">
                          <Badge variant="neutral">Key Name: {keyValue}</Badge>
                        </div>
                      )}
                    </div>

                    <div className="wizard-panel__section">
                      <h4 className="wizard-panel__section-title">📝 Module Details</h4>

                      {/* Dynamic Module Dropdown */}
                      <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
                        <label
                          htmlFor="module-select"
                          className="ui-input__label"
                          style={{ marginBottom: "var(--space-2)", display: "block" }}
                        >
                          Select Module Name
                        </label>
                        {!showCustomModuleInput ? (
                          <div style={{ display: "flex", gap: "var(--space-2)" }}>
                            <select
                              id="module-select"
                              className="ui-input__field"
                              style={{ width: "100%", height: "40px", padding: "0 12px" }}
                              value={lessonModule}
                              onChange={(e) => {
                                if (e.target.value === "ADD_NEW") {
                                  setShowCustomModuleInput(true);
                                } else {
                                  setLessonModule(e.target.value);
                                  syncPayload(
                                    isLesson,
                                    titleI18n,
                                    e.target.value,
                                    languages,
                                    audioUrls,
                                    quiz,
                                    translationCopy,
                                    extraPayloadFields
                                  );
                                }
                              }}
                            >
                              <option value="">-- Choose Module --</option>
                              {existingModules.map((modName) => (
                                <option key={modName} value={modName}>
                                  {modName}
                                </option>
                              ))}
                              <option
                                value="ADD_NEW"
                                style={{ fontWeight: "bold", color: "var(--color-brand-600)" }}
                              >
                                ➕ [+ Add New Module...]
                              </option>
                            </select>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                            <div style={{ width: "120px", flexShrink: 0 }}>
                              <Input
                                id="custom-module-number"
                                label="Module No."
                                type="number"
                                value={customModuleNumber}
                                placeholder="e.g. 3"
                                onChange={(e) => {
                                  const newNumber = e.target.value;
                                  setCustomModuleNumber(newNumber);
                                  const combined = newNumber || customModuleTitle ? `Module ${newNumber}: ${customModuleTitle}` : "";
                                  setLessonModule(combined);
                                  syncPayload(isLesson, titleI18n, combined, languages, audioUrls, quiz, translationCopy, extraPayloadFields);
                                }}
                              />
                            </div>
                            <div style={{ flexGrow: 1 }}>
                              <Input
                                id="custom-module-title"
                                label="Module Title"
                                value={customModuleTitle}
                                placeholder="e.g. Business Expansion"
                                autoComplete="off"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-1password-ignore="true"
                                data-bitwarden-no-filtering="true"
                                data-keepassignore="true"
                                onChange={(e) => {
                                  const newTitle = e.target.value;
                                  setCustomModuleTitle(newTitle);
                                  const combined = customModuleNumber || newTitle ? `Module ${customModuleNumber}: ${newTitle}` : "";
                                  setLessonModule(combined);
                                  syncPayload(isLesson, titleI18n, combined, languages, audioUrls, quiz, translationCopy, extraPayloadFields);
                                }}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              style={{ marginTop: "24px", height: "40px", flexShrink: 0 }}
                              onClick={() => {
                                setShowCustomModuleInput(false);
                                setCustomModuleNumber("");
                                setCustomModuleTitle("");
                                setLessonModule("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>

                      <Input
                        id="lesson-title"
                        label="Lesson Title (English)"
                        value={titleI18n.en}
                        placeholder="e.g., Pricing Basics"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-1password-ignore="true"
                        data-bitwarden-no-filtering="true"
                        data-keepassignore="true"
                        onChange={(e) => {
                          setTitleI18n((prev) => ({ ...prev, en: e.target.value }));
                          if (onTitleChange) onTitleChange(e.target.value);
                        }}
                      />
                      <ConstraintMeter
                        label="Title length"
                        used={waLen(titleI18n.en)}
                        limit={WHATSAPP_LIMITS.listRowDescription}
                        overflow="truncate"
                        hint="Shown in the lesson menu; also counts toward the 1024-char lesson message."
                      />

                      {/* Expandable Accordion for Voiceover Audios */}
                      <div className="audio-accordion">
                        <button
                          type="button"
                          className="audio-accordion__header"
                          onClick={() => setShowAudioAccordion(!showAudioAccordion)}
                        >
                          🔊 Voiceover Audio Links (Optional)
                          <span>{showAudioAccordion ? "▲" : "▼"}</span>
                        </button>
                        {showAudioAccordion && (
                          <div className="audio-accordion__content">
                            <Input
                              id="audio-en"
                              label="English Audio URL"
                              value={audioUrls.en}
                              placeholder="https://..."
                              onChange={(e) => {
                                const next = { ...audioUrls, en: e.target.value };
                                setAudioUrls(next);
                                syncPayload(
                                  isLesson,
                                  titleI18n,
                                  lessonModule,
                                  languages,
                                  next,
                                  quiz,
                                  translationCopy,
                                  extraPayloadFields
                                );
                              }}
                            />
                            <Input
                              id="audio-pcm"
                              label="Pidgin Audio URL"
                              value={audioUrls.pcm}
                              placeholder="https://..."
                              onChange={(e) => {
                                const next = { ...audioUrls, pcm: e.target.value };
                                setAudioUrls(next);
                                syncPayload(
                                  isLesson,
                                  titleI18n,
                                  lessonModule,
                                  languages,
                                  next,
                                  quiz,
                                  translationCopy,
                                  extraPayloadFields
                                );
                              }}
                            />
                            <Input
                              id="audio-ig"
                              label="Igbo Audio URL"
                              value={audioUrls.ig}
                              placeholder="https://..."
                              onChange={(e) => {
                                const next = { ...audioUrls, ig: e.target.value };
                                setAudioUrls(next);
                                syncPayload(
                                  isLesson,
                                  titleI18n,
                                  lessonModule,
                                  languages,
                                  next,
                                  quiz,
                                  translationCopy,
                                  extraPayloadFields
                                );
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: RICH TEXT TRANSLATIONS */}
                {activeStep === 2 && (
                  <div className="wizard-panel">
                    <div className="wizard-panel__section">
                      <h4 className="wizard-panel__section-title">🌐 Localized Lesson Texts</h4>

                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-3)" }} role="group" aria-label="Lesson content language">
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={activeTabLanguage === "en"}
                          onClick={() => setActiveTabLanguage("en")}
                        >
                          🇬🇧 English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={activeTabLanguage === "pcm"}
                          onClick={() => setActiveTabLanguage("pcm")}
                        >
                          🇳🇬 Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={activeTabLanguage === "ig"}
                          onClick={() => setActiveTabLanguage("ig")}
                        >
                          🇳🇬 Igbo
                        </button>
                      </div>

                      {/* Per-language lesson title - the English tab mirrors the
                          Step 1 title (same state); Pidgin/Igbo hold translations. */}
                      <div style={{ marginBottom: "var(--space-3)" }}>
                        <Input
                          id={`title-lang-${activeTabLanguage}`}
                          label={`Lesson Title (${
                            activeTabLanguage === "en" ? "English" : activeTabLanguage === "pcm" ? "Pidgin" : "Igbo"
                          })`}
                          value={titleI18n[activeTabLanguage]}
                          placeholder={
                            activeTabLanguage === "en" ? "e.g., Pricing Basics" : "Translate the lesson title…"
                          }
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          onChange={(e) => {
                            const v = e.target.value;
                            setTitleI18n((prev) => ({ ...prev, [activeTabLanguage]: v }));
                            if (activeTabLanguage === "en" && onTitleChange) onTitleChange(v);
                          }}
                        />
                        <ConstraintMeter
                          label="Title length"
                          used={waLen(titleI18n[activeTabLanguage])}
                          limit={WHATSAPP_LIMITS.listRowDescription}
                          overflow="truncate"
                        />
                      </div>

                      <div className="emoji-textarea-wrapper">
                        {activeTabLanguage === "en" && (
                          <RichTextEditor
                            id="body-en"
                            label="English Content Body"
                            value={languages.en}
                            placeholder="Write your English lesson content here..."
                            onChange={(val) => {
                              const next = { ...languages, en: val };
                              setLanguages(next);
                              syncPayload(
                                isLesson,
                                titleI18n,
                                lessonModule,
                                next,
                                audioUrls,
                                quiz,
                                translationCopy,
                                extraPayloadFields
                              );
                            }}
                          />
                        )}
                        {activeTabLanguage === "pcm" && (
                          <RichTextEditor
                            id="body-pcm"
                            label="Pidgin Content Body"
                            value={languages.pcm}
                            placeholder="Write your Pidgin lesson content here..."
                            onChange={(val) => {
                              const next = { ...languages, pcm: val };
                              setLanguages(next);
                              syncPayload(
                                isLesson,
                                titleI18n,
                                lessonModule,
                                next,
                                audioUrls,
                                quiz,
                                translationCopy,
                                extraPayloadFields
                              );
                            }}
                          />
                        )}
                        {activeTabLanguage === "ig" && (
                          <RichTextEditor
                            id="body-ig"
                            label="Igbo Content Body"
                            value={languages.ig}
                            placeholder="Write your Igbo lesson content here..."
                            onChange={(val) => {
                              const next = { ...languages, ig: val };
                              setLanguages(next);
                              syncPayload(
                                isLesson,
                                titleI18n,
                                lessonModule,
                                next,
                                audioUrls,
                                quiz,
                                translationCopy,
                                extraPayloadFields
                              );
                            }}
                          />
                        )}
                      </div>

                      {/* Composed body meter - the WHOLE delivered lesson message
                          (📖 prefix + title + body + quiz instruction) vs 1024. */}
                      {(() => {
                        const composed = composeLessonBody(
                          titleI18n[activeTabLanguage],
                          languages[activeTabLanguage],
                          activeTabLanguage
                        );
                        return (
                          <ConstraintMeter
                            label="Full lesson message"
                            used={composed.total}
                            limit={composed.limit}
                            systemChars={composed.systemChars}
                            overflow="reject"
                          />
                        );
                      })()}


                      {/* WhatsApp Formatting Guide */}
                      <div
                        style={{
                          marginTop: "var(--space-2)",
                          fontSize: "11px",
                          color: "var(--color-neutral-500)",
                          display: "flex",
                          gap: "var(--space-4)"
                        }}
                      >
                        <span>
                          <strong>*bold*</strong> &rarr; <b>bold</b>
                        </span>
                        <span>
                          <strong>_italics_</strong> &rarr; <i>italics</i>
                        </span>
                        <span>
                          <strong>~strike~</strong> &rarr; <del>strike</del>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: INTERACTIVE QUIZ BUILDER */}
                {activeStep === 3 && (
                  <div className="wizard-panel">
                    <div className="wizard-panel__section">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "var(--space-3)"
                        }}
                      >
                        <h4 className="wizard-panel__section-title" style={{ margin: 0 }}>
                          🎯 Interactive Multichoice Quiz
                        </h4>
                        <Button variant="secondary" size="sm" onClick={handleAddQuestion}>
                          ➕ Add Question
                        </Button>
                      </div>

                      <div
                        style={{
                          backgroundColor: "var(--color-warning-50)",
                          borderLeft: "4px solid var(--color-warning-500)",
                          padding: "var(--space-3)",
                          marginBottom: "var(--space-4)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "13px",
                          color: "var(--color-warning-700)"
                        }}
                      >
                        <strong>⚠️ WhatsApp Limitations:</strong> You can provide a maximum of <strong>3 options</strong> per question. Each option text must be <strong>20 characters or less</strong>.
                      </div>

                      {/* Language tab - the quiz is translated per language; the
                          correct-answer position is shared across all languages. */}
                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-4)" }} role="group" aria-label="Quiz language">
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${activeTabLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""}`}
                          aria-pressed={activeTabLanguage === "en"}
                          onClick={() => setActiveTabLanguage("en")}
                        >
                          🇬🇧 English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${activeTabLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""}`}
                          aria-pressed={activeTabLanguage === "pcm"}
                          onClick={() => setActiveTabLanguage("pcm")}
                        >
                          🇳🇬 Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${activeTabLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""}`}
                          aria-pressed={activeTabLanguage === "ig"}
                          onClick={() => setActiveTabLanguage("ig")}
                        >
                          🇳🇬 Igbo
                        </button>
                      </div>

                      {quiz.length === 0 ? (
                        <div
                          style={{
                            padding: "var(--space-8)",
                            textAlign: "center",
                            background: "var(--color-neutral-50)",
                            border: "2px dashed var(--color-neutral-300)",
                            borderRadius: "var(--radius-md)"
                          }}
                        >
                          <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-neutral-700)" }}>
                            There are no quiz questions added to this lesson yet.
                          </p>
                          <Button variant="secondary" size="sm" onClick={handleAddQuestion}>
                            ➕ Start Building Quiz
                          </Button>
                        </div>
                      ) : (
                        <div className="quiz-questions-list">
                          {quiz.map((qItem, qIdx) => {
                            const isExpanded = expandedQuizIndex === qIdx;
                            return (
                              <div
                                key={qIdx}
                                className={`quiz-question-card ${
                                  isExpanded ? "quiz-question-card--active" : ""
                                }`}
                              >
                                <div
                                  className="quiz-question-card__header"
                                  onClick={() => setExpandedQuizIndex(isExpanded ? null : qIdx)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setExpandedQuizIndex(isExpanded ? null : qIdx);
                                    }
                                  }}
                                >
                                  <span className="quiz-question-card__title">
                                    {qIdx + 1}. {pickLang(qItem.question, activeTabLanguage) || "New Empty Question"}
                                  </span>
                                  <div className="quiz-question-card__actions">
                                    <Badge variant={isExpanded ? "info" : "neutral"}>
                                      {qItem.options.filter((o) => o.en.trim()).length} options
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveQuestion(qIdx);
                                      }}
                                      style={{ color: "var(--color-danger)" }}
                                    >
                                      🗑️ Delete
                                    </Button>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="quiz-question-card__body">
                                    <Input
                                      id={`q-text-${qIdx}`}
                                      label={`Question Text (${
                                        activeTabLanguage === "en" ? "English" : activeTabLanguage === "pcm" ? "Pidgin" : "Igbo"
                                      })`}
                                      value={qItem.question[activeTabLanguage]}
                                      placeholder="e.g. What is the key to bookkeeping?"
                                      onChange={(e) =>
                                        setQuizQuestionText(qIdx, activeTabLanguage, e.target.value)
                                      }
                                    />
                                    {(() => {
                                      const composed = composeQuizQuestion(
                                        qItem.question[activeTabLanguage],
                                        qItem.options.map((o) => o[activeTabLanguage]),
                                        activeTabLanguage
                                      );
                                      return (
                                        <ConstraintMeter
                                          label="Full quiz message"
                                          used={composed.total}
                                          limit={composed.limit}
                                          systemChars={composed.systemChars}
                                          overflow="reject"
                                        />
                                      );
                                    })()}

                                    {/* Question type: a scored knowledge check vs a
                                        reflection check-in that accepts any answer. */}
                                    <div style={{ display: "grid", gap: "var(--space-2)" }}>
                                      <label
                                        className="ui-input__label"
                                        style={{ fontSize: "var(--font-size-xs)" }}
                                      >
                                        Question Type
                                      </label>
                                      <div
                                        role="group"
                                        aria-label="Question type"
                                        style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}
                                      >
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={qItem.kind === "scored" ? "primary" : "secondary"}
                                          aria-pressed={qItem.kind === "scored"}
                                          onClick={() => setQuizKind(qIdx, "scored")}
                                        >
                                          ✅ Knowledge question
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={qItem.kind === "reflection" ? "primary" : "secondary"}
                                          aria-pressed={qItem.kind === "reflection"}
                                          onClick={() => setQuizKind(qIdx, "reflection")}
                                        >
                                          💬 Check-in (no right answer)
                                        </Button>
                                      </div>
                                      <p
                                        style={{
                                          margin: 0,
                                          padding: "var(--space-3)",
                                          background: "var(--color-neutral-50)",
                                          border: "1px solid var(--color-neutral-200)",
                                          borderRadius: "var(--radius-md)",
                                          fontSize: "var(--font-size-xs)",
                                          color: "var(--color-neutral-700)",
                                          lineHeight: 1.5
                                        }}
                                      >
                                        {qItem.kind === "reflection" ? (
                                          <>
                                            <strong>Check-in:</strong> every answer is accepted and the
                                            learner always moves on - nothing is ever marked wrong. Use this
                                            for “did you do it?” questions. Optionally mark one option as a{" "}
                                            <strong>help request</strong> so anyone choosing it is flagged
                                            for follow-up.
                                          </>
                                        ) : (
                                          <>
                                            <strong>Knowledge question:</strong> the learner must pick the
                                            one correct answer to continue. Any other answer is marked wrong
                                            and they are asked to try again.
                                          </>
                                        )}
                                      </p>
                                    </div>

                                    {/* Option rows. Scored questions get the correct-answer
                                        picker; reflection questions get the help picker
                                        instead (there is no correct answer to mark). */}
                                    <div style={{ display: "grid", gap: "var(--space-3)" }}>
                                      <label
                                        className="ui-input__label"
                                        style={{ fontSize: "var(--font-size-xs)" }}
                                      >
                                        {qItem.kind === "reflection"
                                          ? "Answer Choices & Help Request Option"
                                          : "Multiple Choice Choices & Correct Answer Selection"}
                                      </label>
                                      {qItem.options.map((opt, optIdx) => (
                                        <div
                                          key={optIdx}
                                          style={{ display: "grid", gap: "var(--space-2)" }}
                                        >
                                          <div className="quiz-option-row">
                                            {/* Correct-answer marker - scored questions only. */}
                                            {qItem.kind === "scored" && (
                                              <button
                                                type="button"
                                                className={`quiz-correct-indicator ${
                                                  qItem.answerIndex === optIdx
                                                    ? "quiz-correct-indicator--active"
                                                    : ""
                                                }`}
                                                aria-pressed={qItem.answerIndex === optIdx}
                                                aria-label={`Mark choice ${optIdx + 1} as the correct answer`}
                                                onClick={() => setQuizAnswerIndex(qIdx, optIdx)}
                                                title="Mark as correct answer"
                                              >
                                                ✓
                                              </button>
                                            )}
                                            <div style={{ flex: 1 }}>
                                              <Input
                                                id={`opt-${qIdx}-${optIdx}`}
                                                label={`Choice ${optIdx + 1}${
                                                  qItem.kind === "scored" && qItem.answerIndex === optIdx
                                                    ? " · correct"
                                                    : ""
                                                }${
                                                  qItem.kind === "reflection" &&
                                                  qItem.helpOptionIndex === optIdx
                                                    ? " · help request"
                                                    : ""
                                                }`}
                                                value={opt[activeTabLanguage]}
                                                placeholder={`e.g. Choice value ${optIdx + 1}`}
                                                onChange={(e) =>
                                                  setQuizOptionText(qIdx, optIdx, activeTabLanguage, e.target.value)
                                                }
                                              />
                                              <ConstraintMeter
                                                used={waLen(opt[activeTabLanguage])}
                                                limit={WHATSAPP_LIMITS.buttonTitle}
                                                overflow="truncate"
                                              />
                                            </div>
                                          </div>
                                          {/* Help-request marker - reflection questions only.
                                              Sits on its own line so it never competes with the
                                              option input for width on narrow viewports. */}
                                          {qItem.kind === "reflection" && (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant={
                                                qItem.helpOptionIndex === optIdx ? "primary" : "secondary"
                                              }
                                              aria-pressed={qItem.helpOptionIndex === optIdx}
                                              onClick={() => setQuizHelpOptionIndex(qIdx, optIdx)}
                                              style={{ justifySelf: "start" }}
                                            >
                                              {qItem.helpOptionIndex === optIdx
                                                ? "Help request ✓"
                                                : "Mark as help request"}
                                            </Button>
                                          )}
                                        </div>
                                      ))}
                                    </div>

                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 4: INTERACTIVE WHATSAPP SMARTPHONE SIMULATOR */}
                {activeStep === 4 && (
                  <div className="wizard-panel">
                    <div className="wizard-panel__section">
                      <h4 className="wizard-panel__section-title">
                        📱 Real WhatsApp Chat Preview Simulation
                      </h4>

                      {/* Language Selection Tab inside simulator */}
                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-4)" }} role="group" aria-label="Preview language">
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={previewLanguage === "en"}
                          onClick={() => setPreviewLanguage("en")}
                        >
                          🇬🇧 Preview English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={previewLanguage === "pcm"}
                          onClick={() => setPreviewLanguage("pcm")}
                        >
                          🇳🇬 Preview Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={previewLanguage === "ig"}
                          onClick={() => setPreviewLanguage("ig")}
                        >
                          🇳🇬 Preview Igbo
                        </button>
                      </div>

                      {/* Visual Phone mock */}
                      <div className="phone-mock">
                        <div className="phone-mock__screen">
                          <header className="phone-mock__header">
                            <span className="phone-mock__avatar">👩‍💼</span>
                            <div className="phone-mock__profile">
                              <h5 className="phone-mock__name">SheTrades Progress Engine</h5>
                              <span className="phone-mock__status">
                                <span className="phone-mock__status-dot" /> Online
                              </span>
                            </div>
                          </header>

                          <div className="phone-mock__chat-body">
                            <span className="phone-mock__date-badge">Today</span>

                            {/* Lesson text bubble */}
                            {(pickLang(titleI18n, previewLanguage) || languages[previewLanguage]) && (
                              <div className="whatsapp-bubble">
                                <strong>📚 {lessonModule || "Module 1"}</strong>
                                <br />
                                <u>{pickLang(titleI18n, previewLanguage) || "Lesson Title"}</u>
                                <br />
                                <br />
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: formatWhatsAppText(
                                      languages[previewLanguage] || "(No body text added yet)"
                                    )
                                  }}
                                />
                                {audioUrls[previewLanguage] && (
                                  <div className="whatsapp-bubble__audio" style={{ marginTop: "8px" }}>
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                                    </svg>
                                    🔊 Localized Audio Voiceover attached
                                  </div>
                                )}
                                <span className="whatsapp-bubble__meta">18:15</span>
                              </div>
                            )}

                            {/* Quiz Questions bubbles */}
                            {quiz.map((q, qIndex) => {
                              // Only show this question once the previous one has been
                              // cleared. A scored question needs the correct answer; a
                              // reflection check-in advances on ANY answer.
                              const prev = quiz[qIndex - 1];
                              const prevAnswer = simulatorSelectedAnswer[qIndex - 1];
                              const previousCorrect =
                                qIndex === 0 ||
                                (prev?.kind === "reflection"
                                  ? typeof prevAnswer === "number"
                                  : prevAnswer === prev?.answerIndex);

                              if (!previousCorrect) return null;

                              const isReflection = q.kind === "reflection";
                              const selectedOpt = simulatorSelectedAnswer[qIndex];
                              const hasSelected = typeof selectedOpt === "number";

                              return (
                                <div key={qIndex} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: qIndex > 0 ? "16px" : "0" }}>
                                  {qIndex > 0 && (
                                    <div
                                      className="whatsapp-bubble"
                                      style={{
                                        alignSelf: "flex-end",
                                        background: "var(--color-whatsapp-bubble)",
                                        borderTopLeftRadius: "8px",
                                        borderTopRightRadius: "0"
                                      }}
                                    >
                                      NEXT
                                      <span className="whatsapp-bubble__meta">18:16 ✓✓</span>
                                    </div>
                                  )}
                                  
                                  <div className="whatsapp-bubble" style={{ alignSelf: "flex-start" }}>
                                    <strong>❓ Quiz Challenge ({qIndex + 1}/{quiz.length})</strong>
                                    <br />
                                    {pickLang(q.question, previewLanguage)}
                                    <span className="whatsapp-bubble__meta">18:16</span>
                                  </div>

                                  {/* Quick Reply interactive template buttons container.
                                      Keep the original option index so the correct-answer
                                      highlight stays aligned with answerIndex. */}
                                  <div className="whatsapp-bubble__buttons" style={{ maxWidth: "90%" }}>
                                    {q.options.map((o, optIndex) => {
                                      if (!o.en.trim()) return null;
                                      return (
                                        <button
                                          key={optIndex}
                                          type="button"
                                          className={`whatsapp-bubble__btn ${
                                            hasSelected && selectedOpt === optIndex
                                              ? isReflection || selectedOpt === q.answerIndex
                                                ? "whatsapp-bubble__btn--correct"
                                                : "whatsapp-bubble__btn--incorrect"
                                              : ""
                                          }`}
                                          onClick={() => {
                                            setSimulatorSelectedAnswer((prev) => ({
                                              ...prev,
                                              [qIndex]: optIndex
                                            }));
                                          }}
                                        >
                                          {pickLang(o, previewLanguage)}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Simulator replies based on action */}
                                  {hasSelected && (
                                    <>
                                      <div
                                        className="whatsapp-bubble"
                                        style={{
                                          alignSelf: "flex-end",
                                          background: "var(--color-whatsapp-bubble)", /* WhatsApp outbound bubble color */
                                          borderTopLeftRadius: "8px",
                                          borderTopRightRadius: "0"
                                        }}
                                      >
                                        {pickLang(q.options[selectedOpt]!, previewLanguage)}
                                        <span className="whatsapp-bubble__meta">18:16 ✓✓</span>
                                      </div>

                                      <div className="whatsapp-bubble" style={{ alignSelf: "flex-start" }}>
                                        {isReflection ? (
                                          <span>
                                            {selectedOpt === q.helpOptionIndex ? (
                                              <>
                                                🤝 <b>Thanks for telling us.</b> Someone will reach out to
                                                help you.{" "}
                                              </>
                                            ) : (
                                              <>
                                                ✅ <b>Thanks for sharing.</b>{" "}
                                              </>
                                            )}
                                            {qIndex < quiz.length - 1
                                              ? "Reply NEXT to go to the next question."
                                              : "You have completed this lesson."}
                                          </span>
                                        ) : selectedOpt === q.answerIndex ? (
                                          <span>
                                            🎉 <b>Correct!</b>{" "}
                                            {qIndex < quiz.length - 1 ? "Reply NEXT to go to the next question." : "Excellent job. You have completed this lesson."}
                                          </span>
                                        ) : (
                                          <span>
                                            ❌ <b>Try again!</b> That is incorrect. Let's try again!
                                          </span>
                                        )}
                                        <span className="whatsapp-bubble__meta">18:16</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <div className="phone-mock__input-area">
                            <div className="phone-mock__input-box">
                              Message {titleI18n.en ? `"${titleI18n.en}"` : ""}...
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Visual Step Tracker for Simple Translations */}
                <div className="wizard-progress">
                  <div className="wizard-progress__track">
                    <div
                      className="wizard-progress__bar"
                      style={{ width: `${((activeStep - 1) / (currentSteps.length - 1)) * 100}%` }}
                    />
                  </div>
                  <div className="wizard-progress__steps">
                    {currentSteps.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`wizard-progress__step ${
                          activeStep === s.id
                            ? "wizard-progress__step--active"
                            : activeStep > s.id
                            ? "wizard-progress__step--completed"
                            : ""
                        }`}
                        onClick={() => {
                          if (s.id < activeStep || isStepValid()) {
                            setActiveStep(s.id);
                          }
                        }}
                      >
                        <span className="wizard-progress__step-circle">
                          {activeStep > s.id ? "✓" : s.id}
                        </span>
                        <span className="wizard-progress__step-label">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* STEP 1: INFO & CATEGORIZATION */}
                {activeStep === 1 && (
                  <div className="wizard-panel">
                    <div className="wizard-panel__section">
                      <h4 className="wizard-panel__section-title">
                        📚 Categorization & System Name
                      </h4>
                      {keyField ?? (
                        <div className="preview-row">
                          <Badge variant="neutral">Key Name: {keyValue}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 2: TRANSLATION COPIES */}
                {activeStep === 2 && (
                  <div className="wizard-panel">
                    <div className="wizard-panel__section">
                      <h4 className="wizard-panel__section-title">🌐 Translation Copies</h4>

                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-3)" }} role="group" aria-label="Translation copy language">
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={activeTabLanguage === "en"}
                          onClick={() => setActiveTabLanguage("en")}
                        >
                          🇬🇧 English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={activeTabLanguage === "pcm"}
                          onClick={() => setActiveTabLanguage("pcm")}
                        >
                          🇳🇬 Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={activeTabLanguage === "ig"}
                          onClick={() => setActiveTabLanguage("ig")}
                        >
                          🇳🇬 Igbo
                        </button>
                      </div>

                      <div className="emoji-textarea-wrapper">
                        {activeTabLanguage === "en" && (
                          <RichTextEditor
                            id="trans-en"
                            label="English Copy Text"
                            value={translationCopy.en}
                            placeholder="Write English text here..."
                            onChange={(val) => {
                              const next = { ...translationCopy, en: val };
                              setTranslationCopy(next);
                              syncPayload(
                                isLesson,
                                titleI18n,
                                lessonModule,
                                languages,
                                audioUrls,
                                quiz,
                                next,
                                extraPayloadFields
                              );
                            }}
                          />
                        )}
                        {activeTabLanguage === "pcm" && (
                          <RichTextEditor
                            id="trans-pcm"
                            label="Nigerian Pidgin Copy Text"
                            value={translationCopy.pcm}
                            placeholder="Write Pidgin text here..."
                            onChange={(val) => {
                              const next = { ...translationCopy, pcm: val };
                              setTranslationCopy(next);
                              syncPayload(
                                isLesson,
                                titleI18n,
                                lessonModule,
                                languages,
                                audioUrls,
                                quiz,
                                next,
                                extraPayloadFields
                              );
                            }}
                          />
                        )}
                        {activeTabLanguage === "ig" && (
                          <RichTextEditor
                            id="trans-ig"
                            label="Igbo Copy Text"
                            value={translationCopy.ig}
                            placeholder="Write Igbo text here..."
                            onChange={(val) => {
                              const next = { ...translationCopy, ig: val };
                              setTranslationCopy(next);
                              syncPayload(
                                isLesson,
                                titleI18n,
                                lessonModule,
                                languages,
                                audioUrls,
                                quiz,
                                next,
                                extraPayloadFields
                              );
                            }}
                          />
                        )}
                      </div>

                      {/* WhatsApp Formatting Guide */}
                      <div
                        style={{
                          marginTop: "var(--space-2)",
                          fontSize: "11px",
                          color: "var(--color-neutral-500)",
                          display: "flex",
                          gap: "var(--space-4)"
                        }}
                      >
                        <span>
                          <strong>*bold*</strong> &rarr; <b>bold</b>
                        </span>
                        <span>
                          <strong>_italics_</strong> &rarr; <i>italics</i>
                        </span>
                        <span>
                          <strong>~strike~</strong> &rarr; <del>strike</del>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: PREVIEW SIMULATOR */}
                {activeStep === 3 && (
                  <div className="wizard-panel">
                    <div className="wizard-panel__section">
                      <h4 className="wizard-panel__section-title">
                        📱 Real WhatsApp Message Simulator
                      </h4>

                      {/* Language Selection Tab inside simulator */}
                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-4)" }} role="group" aria-label="Preview language">
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={previewLanguage === "en"}
                          onClick={() => setPreviewLanguage("en")}
                        >
                          🇬🇧 Preview English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={previewLanguage === "pcm"}
                          onClick={() => setPreviewLanguage("pcm")}
                        >
                          🇳🇬 Preview Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          aria-pressed={previewLanguage === "ig"}
                          onClick={() => setPreviewLanguage("ig")}
                        >
                          🇳🇬 Preview Igbo
                        </button>
                      </div>

                      {/* Visual Phone mock */}
                      <div className="phone-mock">
                        <div className="phone-mock__screen">
                          <header className="phone-mock__header">
                            <span className="phone-mock__avatar">👩‍💼</span>
                            <div className="phone-mock__profile">
                              <h5 className="phone-mock__name">SheTrades Progress Engine</h5>
                              <span className="phone-mock__status">
                                <span className="phone-mock__status-dot" /> Online
                              </span>
                            </div>
                          </header>

                          <div className="phone-mock__chat-body">
                            <span className="phone-mock__date-badge">Today</span>

                            <div className="whatsapp-bubble">
                              <span
                                dangerouslySetInnerHTML={{
                                  __html: formatWhatsAppText(
                                    translationCopy[previewLanguage] || "(No translation copy added yet)"
                                  )
                                }}
                              />
                              <span className="whatsapp-bubble__meta">18:15</span>
                            </div>
                          </div>

                          <div className="phone-mock__input-area">
                            <div className="phone-mock__input-box">
                              Message...
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}

        {/* 4. Backward-Compatible Raw JSON Block */}
        {editorModeState === "json" || namespace !== "content" ? (
          <>
            {keyField ?? (
              <Input
                id="config-editor-key"
                label={keyLabel}
                value={keyValue}
                readOnly={keyReadOnly}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-1password-ignore="true"
                data-bitwarden-no-filtering="true"
                data-keepassignore="true"
                onChange={(event) => onKeyChange(event.target.value)}
                placeholder={keyPlaceholder}
              />
            )}
            {titleLabel && onTitleChange ? (
              <Input
                id="config-editor-title"
                label={titleLabel}
                value={titleValue}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-1password-ignore="true"
                data-bitwarden-no-filtering="true"
                data-keepassignore="true"
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder={titlePlaceholder}
              />
            ) : null}
            <Textarea
              id="config-editor-payload"
              label={payloadLabel}
              value={payloadValue}
              onChange={(event) => onPayloadChange(event.target.value)}
              placeholder={payloadPlaceholder}
              rows={14}
              spellCheck={false}
              {...(payloadHint ? { hint: payloadHint } : {})}
            />
            {templates.length && onTemplateSelect ? (
              <div className="settings-editor-drawer__templates">
                <p className="settings-editor-drawer__templates-label">Quick starters</p>
                <div className="preview-row">
                  {templates.map((template) => (
                    <Button
                      key={template.id}
                      variant="secondary"
                      size="sm"
                      onClick={() => onTemplateSelect(template.id)}
                    >
                      {template.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {feedback ? (
          <div className="preview-row">
            <Badge variant={feedback.tone}>{feedback.text}</Badge>
          </div>
        ) : null}
      </div>
    </SideDrawer>
  );
}
