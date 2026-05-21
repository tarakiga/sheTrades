"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Input, SideDrawer, Textarea, RichTextEditor } from "../ui";

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

  // Curriculum states
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonModule, setLessonModule] = useState("");
  const [customModuleNumber, setCustomModuleNumber] = useState("");
  const [customModuleTitle, setCustomModuleTitle] = useState("");
  const [showCustomModuleInput, setShowCustomModuleInput] = useState(false);
  const [languages, setLanguages] = useState({ en: "", pcm: "", ig: "" });
  const [audioUrls, setAudioUrls] = useState({ en: "", pcm: "", ig: "" });
  const [quiz, setQuiz] = useState<
    Array<{ question: string; options: string[]; answerIndex: number }>
  >([]);

  // Generic translation state
  const [translationCopy, setTranslationCopy] = useState({ en: "", pcm: "", ig: "" });
  const [extraPayloadFields, setExtraPayloadFields] = useState<Record<string, any>>({});

  // Expanded quiz question index
  const [expandedQuizIndex, setExpandedQuizIndex] = useState<number | null>(0);

  // Textarea references for emoji inserter
  const enTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pcmTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const igTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const transEnRef = useRef<HTMLTextAreaElement | null>(null);
  const transPcmRef = useRef<HTMLTextAreaElement | null>(null);
  const transIgRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync tracking to prevent infinite state updates
  const [localSerialized, setLocalSerialized] = useState("");

  // Default emoji list for quick bar
  const emojis = ["📝", "💰", "📈", "📱", "🤝", "🎉", "💡", "❓", "✨", "⭐", "👉", "✅"];

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
        } catch (e) {
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
    let parsed: any = null;
    try {
      if (value) {
        parsed = JSON.parse(value);
      }
    } catch (e) {
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
      setLessonTitle(parsed?.title || "");
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
      setQuiz(
        Array.isArray(parsed?.quiz)
          ? parsed.quiz.map((q: any) => ({
              question: q.question || "",
              options: Array.isArray(q.options) ? [...q.options] : ["", ""],
              answerIndex: typeof q.answerIndex === "number" ? q.answerIndex : 0
            }))
          : []
      );
    } else {
      setTranslationCopy({
        en: parsed?.en || parsed?.languages?.en || (typeof value === "string" ? value : ""),
        pcm: parsed?.pcm || parsed?.languages?.pcm || "",
        ig: parsed?.ig || parsed?.languages?.ig || ""
      });
      const extras: Record<string, any> = {};
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
  const syncPayload = (..._args: any[]) => {};

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
          title: lessonTitle,
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
            question: q.question,
            options: q.options.filter((o) => o.trim().length > 0),
            answerIndex: q.answerIndex
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
    } catch (e) {
      // Catch silently
    }
  }, [
    open,
    isLesson,
    lessonTitle,
    lessonModule,
    languages,
    audioUrls,
    quiz,
    translationCopy,
    extraPayloadFields,
    payloadValue,
    localSerialized
  ]);

  // Cursor-aware emoji insertion logic
  const insertEmoji = (
    emoji: string,
    lang: "en" | "pcm" | "ig",
    ref: React.RefObject<HTMLTextAreaElement | null>,
    isLessonMode: boolean
  ) => {
    const textarea = ref.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const updatedValue = before + emoji + after;

    if (isLessonMode) {
      setLanguages((prev) => {
        const next = { ...prev, [lang]: updatedValue };
        syncPayload(
          isLesson,
          lessonTitle,
          lessonModule,
          next,
          audioUrls,
          quiz,
          translationCopy,
          extraPayloadFields
        );
        return next;
      });
    } else {
      setTranslationCopy((prev) => {
        const next = { ...prev, [lang]: updatedValue };
        syncPayload(
          isLesson,
          lessonTitle,
          lessonModule,
          languages,
          audioUrls,
          quiz,
          next,
          extraPayloadFields
        );
        return next;
      });
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 50);
  };

  // Quiz Builder utilities
  const handleAddQuestion = () => {
    const next = [...quiz, { question: "", options: ["", "", ""], answerIndex: 0 }];
    setQuiz(next);
    setExpandedQuizIndex(next.length - 1);
    syncPayload(
      isLesson,
      lessonTitle,
      lessonModule,
      languages,
      audioUrls,
      next,
      translationCopy,
      extraPayloadFields
    );
  };

  const handleRemoveQuestion = (index: number) => {
    const next = quiz.filter((_, i) => i !== index);
    setQuiz(next);
    setExpandedQuizIndex(next.length > 0 ? 0 : null);
    syncPayload(
      isLesson,
      lessonTitle,
      lessonModule,
      languages,
      audioUrls,
      next,
      translationCopy,
      extraPayloadFields
    );
  };

  const handleQuestionChange = (index: number, field: string, val: any) => {
    const next = quiz.map((q, i) => {
      if (i === index) {
        return { ...q, [field]: val };
      }
      return q;
    });
    setQuiz(next);
    syncPayload(
      isLesson,
      lessonTitle,
      lessonModule,
      languages,
      audioUrls,
      next,
      translationCopy,
      extraPayloadFields
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
        return isKeyValid && lessonTitle.trim().length > 0 && lessonModule.trim().length > 0;
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
            q.question.trim().length > 0 &&
            q.options.filter((o) => o.trim().length > 0).length >= 2
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
        lessonTitle.trim().length > 0 &&
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
      if (!lessonTitle.trim()) return "Please enter a lesson title on Step 1.";
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
              <span className="config-drawer__validation-hint" style={{ fontSize: "11px", color: "#ef4444", marginRight: "var(--space-2)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
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
        </div>

        {/* 1. Mode Selector Toggle */}
        {namespace === "content" ? (
          <div className="wizard-mode-toggle">
            <button
              type="button"
              className={`wizard-mode-toggle__btn ${
                editorModeState === "wizard" ? "wizard-mode-toggle__btn--active" : ""
              }`}
              onClick={() => setEditorModeState("wizard")}
            >
              🪄 Visual Wizard
            </button>
            <button
              type="button"
              className={`wizard-mode-toggle__btn ${
                editorModeState === "json" ? "wizard-mode-toggle__btn--active" : ""
              }`}
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
                                    lessonTitle,
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
                                  syncPayload(isLesson, lessonTitle, combined, languages, audioUrls, quiz, translationCopy, extraPayloadFields);
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
                                  syncPayload(isLesson, lessonTitle, combined, languages, audioUrls, quiz, translationCopy, extraPayloadFields);
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
                        label="Lesson Title"
                        value={lessonTitle}
                        placeholder="e.g., Pricing Basics"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-1password-ignore="true"
                        data-bitwarden-no-filtering="true"
                        data-keepassignore="true"
                        onChange={(e) => {
                          setLessonTitle(e.target.value);
                          if (onTitleChange) onTitleChange(e.target.value);
                          syncPayload(
                            isLesson,
                            e.target.value,
                            lessonModule,
                            languages,
                            audioUrls,
                            quiz,
                            translationCopy,
                            extraPayloadFields
                          );
                        }}
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
                                  lessonTitle,
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
                                  lessonTitle,
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
                                  lessonTitle,
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

                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-3)" }}>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setActiveTabLanguage("en")}
                        >
                          🇬🇧 English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setActiveTabLanguage("pcm")}
                        >
                          🇳🇬 Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setActiveTabLanguage("ig")}
                        >
                          🇳🇬 Igbo
                        </button>
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
                                lessonTitle,
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
                                lessonTitle,
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
                                lessonTitle,
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
                          backgroundColor: "#fffbeb",
                          borderLeft: "4px solid #f59e0b",
                          padding: "var(--space-3)",
                          marginBottom: "var(--space-4)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "13px",
                          color: "#92400e"
                        }}
                      >
                        <strong>⚠️ WhatsApp Limitations:</strong> You can provide a maximum of <strong>3 options</strong> per question. Each option text must be <strong>20 characters or less</strong>.
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
                                    {qIdx + 1}. {qItem.question || "New Empty Question"}
                                  </span>
                                  <div className="quiz-question-card__actions">
                                    <Badge variant={isExpanded ? "info" : "neutral"}>
                                      {qItem.options.filter((o) => o.trim()).length} options
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
                                      label="Question Text"
                                      value={qItem.question}
                                      placeholder="e.g. What is the key to bookkeeping?"
                                      onChange={(e) =>
                                        handleQuestionChange(qIdx, "question", e.target.value)
                                      }
                                    />

                                    {/* Option rows with correct indicators */}
                                    <div style={{ display: "grid", gap: "var(--space-3)" }}>
                                      <label
                                        className="ui-input__label"
                                        style={{ fontSize: "var(--font-size-xs)" }}
                                      >
                                        Multiple Choice Choices & Correct Answer Selection
                                      </label>
                                      {qItem.options.map((opt, optIdx) => (
                                        <div key={optIdx} className="quiz-option-row">
                                          {/* Checkbox badge helper */}
                                          <button
                                            type="button"
                                            className={`quiz-correct-indicator ${
                                              qItem.answerIndex === optIdx
                                                ? "quiz-correct-indicator--active"
                                                : ""
                                            }`}
                                            onClick={() =>
                                              handleQuestionChange(qIdx, "answerIndex", optIdx)
                                            }
                                            title="Mark as correct answer"
                                          >
                                            ✓
                                          </button>
                                          <div style={{ flex: 1 }}>
                                            <Input
                                              id={`opt-${qIdx}-${optIdx}`}
                                              label={`Choice ${optIdx + 1}`}
                                              value={opt}
                                              placeholder={`e.g. Choice value ${optIdx + 1}`}
                                              onChange={(e) => {
                                                const nextOpts = qItem.options.map((o, oI) =>
                                                  oI === optIdx ? e.target.value : o
                                                );
                                                handleQuestionChange(qIdx, "options", nextOpts);
                                              }}
                                            />
                                          </div>
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
                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-4)" }}>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setPreviewLanguage("en")}
                        >
                          🇬🇧 Preview English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setPreviewLanguage("pcm")}
                        >
                          🇳🇬 Preview Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
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
                            {(lessonTitle || languages[previewLanguage]) && (
                              <div className="whatsapp-bubble">
                                <strong>📚 {lessonModule || "Module 1"}</strong>
                                <br />
                                <u>{lessonTitle || "Lesson Title"}</u>
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
                              // Only show this question if previous questions were answered correctly
                              const previousCorrect =
                                qIndex === 0 || simulatorSelectedAnswer[qIndex - 1] === quiz[qIndex - 1]?.answerIndex;
                              
                              if (!previousCorrect) return null;

                              const selectedOpt = simulatorSelectedAnswer[qIndex];
                              const hasSelected = typeof selectedOpt === "number";

                              return (
                                <div key={qIndex} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: qIndex > 0 ? "16px" : "0" }}>
                                  {qIndex > 0 && (
                                    <div
                                      className="whatsapp-bubble"
                                      style={{
                                        alignSelf: "flex-end",
                                        background: "#d9fdd3",
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
                                    {q.question}
                                    <span className="whatsapp-bubble__meta">18:16</span>
                                  </div>

                                  {/* Quick Reply interactive template buttons container */}
                                  <div className="whatsapp-bubble__buttons" style={{ maxWidth: "90%" }}>
                                    {q.options
                                      .filter((o) => o.trim())
                                      .map((opt, optIndex) => (
                                        <button
                                          key={optIndex}
                                          type="button"
                                          className={`whatsapp-bubble__btn ${
                                            hasSelected && selectedOpt === optIndex
                                              ? selectedOpt === q.answerIndex
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
                                          {opt}
                                        </button>
                                      ))}
                                  </div>

                                  {/* Simulator replies based on action */}
                                  {hasSelected && (
                                    <>
                                      <div
                                        className="whatsapp-bubble"
                                        style={{
                                          alignSelf: "flex-end",
                                          background: "#d9fdd3", /* WhatsApp outbound bubble color */
                                          borderTopLeftRadius: "8px",
                                          borderTopRightRadius: "0"
                                        }}
                                      >
                                        {q.options[selectedOpt]}
                                        <span className="whatsapp-bubble__meta">18:16 ✓✓</span>
                                      </div>

                                      <div className="whatsapp-bubble" style={{ alignSelf: "flex-start" }}>
                                        {selectedOpt === q.answerIndex ? (
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
                              Message {lessonTitle ? `"${lessonTitle}"` : ""}...
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

                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-3)" }}>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setActiveTabLanguage("en")}
                        >
                          🇬🇧 English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setActiveTabLanguage("pcm")}
                        >
                          🇳🇬 Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            activeTabLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
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
                                lessonTitle,
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
                                lessonTitle,
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
                                lessonTitle,
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
                      <div className="wizard-mode-toggle" style={{ marginBottom: "var(--space-4)" }}>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "en" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setPreviewLanguage("en")}
                        >
                          🇬🇧 Preview English
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "pcm" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
                          onClick={() => setPreviewLanguage("pcm")}
                        >
                          🇳🇬 Preview Pidgin
                        </button>
                        <button
                          type="button"
                          className={`wizard-mode-toggle__btn ${
                            previewLanguage === "ig" ? "wizard-mode-toggle__btn--active" : ""
                          }`}
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
