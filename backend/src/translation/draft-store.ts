import { prisma } from "../admin/prisma.js";

export type DraftStatus = "machine_draft" | "in_review" | "approved" | "promoted";

const ORDER: DraftStatus[] = ["machine_draft", "in_review", "approved", "promoted"];

/** Forward-only: a status may advance exactly one stage, never skip or reverse. */
export function canTransition(from: DraftStatus, to: DraftStatus): boolean {
  return ORDER.indexOf(to) === ORDER.indexOf(from) + 1;
}

/** A machine run may overwrite a draft only while it is still untouched. */
export function canOverwrite(status: DraftStatus): boolean {
  return status === "machine_draft";
}

export type UpsertInput = {
  contentDocumentId: string;
  contentKey: string;
  targetLanguage: string;
  payload: unknown;
  runSummary: unknown;
  sourceHash: string;
};

export type UpsertResult = { skipped: boolean; reason?: string };

/**
 * Write a fresh machine translation into the draft store. If a draft already
 * exists and a human has started reviewing it (status past machine_draft), the
 * new run is SKIPPED — reviewed work is never clobbered by a re-run.
 */
export async function upsertMachineDraft(input: UpsertInput): Promise<UpsertResult> {
  const existing = await prisma.translationDraft.findUnique({
    where: {
      contentDocumentId_targetLanguage: {
        contentDocumentId: input.contentDocumentId,
        targetLanguage: input.targetLanguage
      }
    },
    select: { status: true }
  });

  if (existing && !canOverwrite(existing.status as DraftStatus)) {
    return { skipped: true, reason: `Draft is ${existing.status}; not overwriting reviewed work.` };
  }

  await prisma.translationDraft.upsert({
    where: {
      contentDocumentId_targetLanguage: {
        contentDocumentId: input.contentDocumentId,
        targetLanguage: input.targetLanguage
      }
    },
    create: {
      contentDocumentId: input.contentDocumentId,
      contentKey: input.contentKey,
      targetLanguage: input.targetLanguage,
      payload: input.payload as never,
      runSummary: input.runSummary as never,
      sourceHash: input.sourceHash,
      status: "machine_draft"
    },
    update: {
      contentKey: input.contentKey,
      payload: input.payload as never,
      runSummary: input.runSummary as never,
      sourceHash: input.sourceHash,
      status: "machine_draft"
    }
  });

  return { skipped: false };
}

export type DraftRow = {
  contentDocumentId: string;
  contentKey: string;
  targetLanguage: string;
  payload: unknown;
  runSummary: unknown;
  status: DraftStatus;
  assignee: string | null;
  sourceHash: string;
  updatedAt: string;
  promotedAt: string | null;
};

function toRow(r: {
  contentDocumentId: string;
  contentKey: string;
  targetLanguage: string;
  payload: unknown;
  runSummary: unknown;
  status: string;
  assignee: string | null;
  sourceHash: string;
  updatedAt: Date;
  promotedAt: Date | null;
}): DraftRow {
  return {
    contentDocumentId: r.contentDocumentId,
    contentKey: r.contentKey,
    targetLanguage: r.targetLanguage,
    payload: r.payload,
    runSummary: r.runSummary,
    status: r.status as DraftStatus,
    assignee: r.assignee ?? null,
    sourceHash: r.sourceHash,
    updatedAt: r.updatedAt.toISOString(),
    promotedAt: r.promotedAt ? r.promotedAt.toISOString() : null
  };
}

export async function getDraft(contentDocumentId: string, targetLanguage: string): Promise<DraftRow | null> {
  const r = await prisma.translationDraft.findUnique({
    where: { contentDocumentId_targetLanguage: { contentDocumentId, targetLanguage } }
  });
  return r ? toRow(r) : null;
}

/** All drafts, newest activity first — backs the review list. */
export async function listDrafts(): Promise<DraftRow[]> {
  const rows = await prisma.translationDraft.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(toRow);
}

/**
 * Save a reviewer's edits. Moves a machine_draft into in_review; leaves a draft
 * that is already in_review as-is. Does not touch approved/promoted rows.
 */
export async function saveReviewerEdits(
  contentDocumentId: string,
  targetLanguage: string,
  payload: unknown,
  assignee?: string
): Promise<DraftRow> {
  const current = await getDraft(contentDocumentId, targetLanguage);
  if (!current) throw new Error("Draft not found.");
  if (current.status === "approved" || current.status === "promoted") {
    throw new Error(`Cannot edit a ${current.status} draft.`);
  }
  const nextStatus: DraftStatus = current.status === "machine_draft" ? "in_review" : current.status;
  const r = await prisma.translationDraft.update({
    where: { contentDocumentId_targetLanguage: { contentDocumentId, targetLanguage } },
    data: {
      payload: payload as never,
      status: nextStatus,
      ...(assignee !== undefined ? { assignee } : {})
    }
  });
  return toRow(r);
}

/** Advance the review status by exactly one legal stage. */
export async function setStatus(
  contentDocumentId: string,
  targetLanguage: string,
  to: DraftStatus
): Promise<DraftRow> {
  const current = await getDraft(contentDocumentId, targetLanguage);
  if (!current) throw new Error("Draft not found.");
  if (!canTransition(current.status, to)) {
    throw new Error(`Illegal transition ${current.status} -> ${to}.`);
  }
  const r = await prisma.translationDraft.update({
    where: { contentDocumentId_targetLanguage: { contentDocumentId, targetLanguage } },
    data: {
      status: to,
      ...(to === "promoted" ? { promotedAt: new Date() } : {})
    }
  });
  return toRow(r);
}
