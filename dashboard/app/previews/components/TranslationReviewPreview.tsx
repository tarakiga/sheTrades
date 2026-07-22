"use client";

import { useMemo, useState } from "react";
import { Card } from "../../../components/ui";
import {
  TranslationDraftReviewPanel,
  TranslationDraftTable,
  TranslationRunPanel,
  draftKey,
  type TranslationDraftPayload,
  type TranslationDraftRow,
  type TranslationFeedback,
  type TranslationLanguage,
  type TranslationLessonRef,
  type TranslationRunReport
} from "../../../components/integration/translation/TranslationReviewWorkspace";

/**
 * Fixture lessons for the run panel's checklist. Mirrors the shape the real
 * GET /api/admin/translation endpoint returns for `lessons`.
 */
const FIXTURE_LESSONS: TranslationLessonRef[] = [
  { id: "lesson-1", key: "content.lesson.onboarding_intro", title: "Welcome To SheTrades" },
  { id: "lesson-2", key: "content.lesson.m2_l6_whatsapp_shop", title: "My WhatsApp Business Shop" },
  { id: "lesson-3", key: "content.lesson.m3_l2_pricing", title: "Pricing Your Products" }
];

/**
 * Fixture drafts. lesson-2's Igbo draft deliberately has:
 *  - a title over the 24-char list-row limit (red)
 *  - one quiz option over the 20-char button limit (red) - the core failure
 *    mode machine translation routinely produces
 *  - one failed option (null) that needs manual entry
 * lesson-1's Pidgin draft is already approved, to exercise the Promote gate.
 * lesson-3's Pidgin draft is a fresh machine_draft, to exercise the Save gate.
 */
function buildFixtureDrafts(): TranslationDraftRow[] {
  return [
    {
      contentDocumentId: "lesson-2",
      contentKey: "content.lesson.m2_l6_whatsapp_shop",
      targetLanguage: "ig",
      payload: {
        title: "Ụlọ Ahịa WhatsApp Business Gị Nke Ọhụrụ", // deliberately over 24 chars
        body:
          "Iji WhatsApp nkịtị na-eme ahịa bụ ka ị na-ebu ngwongwo ụzọ n'obere akpa aka. WhatsApp Business bụ ngwa efu dị iche emere maka ndị na-azụ ahịa.",
        quiz: [
          {
            question: "Kedu ngwaike WhatsApp Business na-egosi ngwaahịa gị?",
            options: ["Catalog", null, "Profaịlụ foto naanị"]
          },
          {
            question: "Ị mepụtara mgbe niile azụmahịa gị taa?",
            options: ["Ee, edoziela sistemụ", "Achọrọ m enyemaka ịkwaga ihe", "Ọ bụghị ugbu a"]
          }
        ]
      },
      runSummary: { translated: 5, failed: 1, overBudget: 1 },
      status: "in_review",
      assignee: "Chiamaka N.",
      sourceHash: "fixture-hash-2",
      // The English changed after this was translated - promotion will refuse.
      stale: true,
      updatedAt: "2026-07-20T09:15:00.000Z",
      promotedAt: null
    },
    {
      contentDocumentId: "lesson-1",
      contentKey: "content.lesson.onboarding_intro",
      targetLanguage: "pcm",
      payload: {
        title: "Welcome To SheTrades",
        body: "Dis app go help you learn how to sell better for WhatsApp and grow your business small small.",
        quiz: [
          {
            question: "Wetin dis lesson dey teach you?",
            options: ["How to sell", "How to cook", "How to travel"]
          }
        ]
      },
      runSummary: { translated: 4, failed: 0, overBudget: 0 },
      status: "approved",
      assignee: "Chiamaka N.",
      sourceHash: "fixture-hash-1",
      updatedAt: "2026-07-19T14:02:00.000Z",
      promotedAt: null
    },
    {
      contentDocumentId: "lesson-3",
      contentKey: "content.lesson.m3_l2_pricing",
      targetLanguage: "pcm",
      payload: {
        title: "How To Price Your Product",
        body: "Make you no price your product too low or too high. Check wetin e cost you first before you price am.",
        quiz: [
          {
            question: "Wetin you suppose check before you price your product?",
            options: ["Cost price", "Weather", "Traffic"]
          }
        ]
      },
      runSummary: { translated: 4, failed: 0, overBudget: 0 },
      status: "machine_draft",
      assignee: null,
      sourceHash: "fixture-hash-3",
      updatedAt: "2026-07-22T08:00:00.000Z",
      promotedAt: null
    }
  ];
}

/**
 * Interactive, network-free harness for the translation review workspace.
 * Reuses the real presentational pieces (TranslationRunPanel,
 * TranslationDraftTable, TranslationDraftReviewPanel) exported by
 * TranslationReviewWorkspace.tsx, wired to local state that simulates what
 * the real API calls would do - same pattern as TranslationSettingsPreview's
 * DefaultHarness, which simulates POST .../test instead of calling it.
 */
function TranslationReviewHarness() {
  const [drafts, setDrafts] = useState<TranslationDraftRow[]>(() => buildFixtureDrafts());
  const [selectedKey, setSelectedKey] = useState<string | null>(draftKey(buildFixtureDrafts()[0]!));

  const [runLanguage, setRunLanguage] = useState<TranslationLanguage>("ig");
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runReport, setRunReport] = useState<TranslationRunReport | null>(null);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [feedback, setFeedback] = useState<TranslationFeedback | null>(null);

  const selectedDraft = useMemo(
    () => drafts.find((row) => draftKey(row) === selectedKey) ?? null,
    [drafts, selectedKey]
  );
  const selectedLessonTitle = useMemo(() => {
    if (!selectedDraft) return "";
    return (
      FIXTURE_LESSONS.find((lesson) => lesson.id === selectedDraft.contentDocumentId)?.title ??
      selectedDraft.contentKey
    );
  }, [selectedDraft]);

  function toggleLesson(id: string) {
    setSelectedLessonIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]
    );
  }

  function selectDraft(key: string) {
    setSelectedKey(key);
    setFeedback(null);
  }

  function simulateRun(documentIds: string[] | "all") {
    setRunning(true);
    window.setTimeout(() => {
      const attempted = documentIds === "all" ? FIXTURE_LESSONS.length : documentIds.length;
      setRunReport({
        language: runLanguage,
        attempted,
        translatedLessons: attempted,
        skipped: [],
        stoppedForQuota: false
      });
      setRunning(false);
    }, 400);
  }

  function updateDraft(next: TranslationDraftRow) {
    setDrafts((current) => current.map((row) => (draftKey(row) === draftKey(next) ? next : row)));
  }

  function handleSave(payload: TranslationDraftPayload) {
    if (!selectedDraft) return;
    setSaving(true);
    setFeedback(null);
    window.setTimeout(() => {
      const nextStatus = selectedDraft.status === "machine_draft" ? "in_review" : selectedDraft.status;
      updateDraft({ ...selectedDraft, payload, status: nextStatus, updatedAt: new Date().toISOString() });
      setFeedback({ tone: "success", text: "Draft saved and moved to In Review." });
      setSaving(false);
    }, 300);
  }

  function handleApprove() {
    if (!selectedDraft) return;
    setApproving(true);
    setFeedback(null);
    window.setTimeout(() => {
      if (selectedDraft.status !== "in_review") {
        setFeedback({
          tone: "danger",
          text: `Illegal transition ${selectedDraft.status} -> approved.`
        });
        setApproving(false);
        return;
      }
      updateDraft({ ...selectedDraft, status: "approved" });
      setFeedback({ tone: "success", text: "Draft approved." });
      setApproving(false);
    }, 300);
  }

  function handlePromote() {
    if (!selectedDraft) return;
    setPromoting(true);
    setFeedback(null);
    window.setTimeout(() => {
      if (selectedDraft.status !== "approved") {
        setFeedback({
          tone: "danger",
          text: `Only an approved draft can be promoted (this one is ${selectedDraft.status}).`
        });
        setPromoting(false);
        return;
      }
      updateDraft({ ...selectedDraft, status: "promoted", promotedAt: new Date().toISOString() });
      setFeedback({ tone: "success", text: "Translation promoted into live content." });
      setPromoting(false);
    }, 300);
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-6)" }}>
      <TranslationRunPanel
        lessons={FIXTURE_LESSONS}
        selectedLessonIds={selectedLessonIds}
        onToggleLesson={toggleLesson}
        language={runLanguage}
        onLanguageChange={(language) => {
          setRunLanguage(language);
          setRunReport(null);
        }}
        onRunSelected={() => simulateRun(selectedLessonIds)}
        onRunAll={() => simulateRun("all")}
        running={running}
        report={runReport}
        runError=""
      />

      <TranslationDraftTable
        drafts={drafts}
        lessons={FIXTURE_LESSONS}
        selectedKey={selectedKey}
        onSelectDraft={selectDraft}
      />

      {selectedDraft ? (
        <TranslationDraftReviewPanel
          draft={selectedDraft}
          source={{
            title: "My WhatsApp Business Shop",
            body: "Using standard WhatsApp to run a busy shop is like carrying a full market load in a small handbag. WhatsApp Business is a separate, free app built for traders.",
            quiz: [
              {
                question: "Which WhatsApp Business feature shows an organised menu of products with prices?",
                options: ["The Catalog tool", "The Status bar", "Broadcast groups"]
              }
            ]
          }}
          lessonTitle={selectedLessonTitle}
          onSave={handleSave}
          onApprove={handleApprove}
          onPromote={handlePromote}
          saving={saving}
          approving={approving}
          promoting={promoting}
          feedback={feedback}
        />
      ) : null}
    </div>
  );
}

export function TranslationReviewPreview() {
  return (
    <div className="preview-card-content">
      <Card
        title="Translation Review Workspace (fixture data)"
        description="No network calls - local state simulates run / save / approve / promote. The Igbo draft for the WhatsApp Shop lesson starts selected: its title is over the 24-char list-row limit, one quiz option is over the 20-char button limit, and one option failed translation (shown blank, needing manual entry)."
      >
        <TranslationReviewHarness />
      </Card>
    </div>
  );
}
