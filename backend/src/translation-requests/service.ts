import { prisma } from "../admin/prisma.js";
import type {
  CompleteTranslationRequestInput,
  CreateTranslationRequestInput,
  TranslationIntegrationState,
  TranslationRequestRecord
} from "./contracts.js";

type RequestActor = {
  id: string;
  role: "admin" | "editor" | "viewer";
};

type RequestContent = {
  documentId: string;
  key: string;
  title: string;
  sourceLanguage: string;
};

/** Row shape as stored by Prisma (dates as Date, optionals as null). */
type TranslationRequestRow = {
  id: string;
  contentDocumentId: string;
  contentKey: string;
  contentTitle: string;
  sourceLanguage: string;
  method: string;
  targetLanguage: string;
  priority: string;
  note: string;
  status: string;
  integrationState: string | null;
  integrationJobId: string | null;
  completionNote: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  reviewDraftVersionId: string | null;
  requestedBy: string;
  requestedAt: Date;
};

/**
 * Map a DB row back to the API record contract. Nullable columns become
 * `undefined` (omitted) so the response matches translationRequestRecordSchema,
 * which uses `.optional()` rather than nullable.
 */
function toRecord(row: TranslationRequestRow): TranslationRequestRecord {
  return {
    id: row.id,
    contentDocumentId: row.contentDocumentId,
    contentKey: row.contentKey,
    contentTitle: row.contentTitle,
    sourceLanguage: row.sourceLanguage,
    method: row.method as TranslationRequestRecord["method"],
    targetLanguage: row.targetLanguage,
    priority: row.priority,
    note: row.note ?? "",
    status: row.status as TranslationRequestRecord["status"],
    ...(row.integrationState
      ? { integrationState: row.integrationState as TranslationIntegrationState }
      : {}),
    ...(row.integrationJobId ? { integrationJobId: row.integrationJobId } : {}),
    ...(row.completionNote !== null ? { completionNote: row.completionNote } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
    ...(row.completedBy ? { completedBy: row.completedBy } : {}),
    ...(row.reviewDraftVersionId ? { reviewDraftVersionId: row.reviewDraftVersionId } : {}),
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt.toISOString()
  };
}

/**
 * GAP-D1: translation requests are persisted in Postgres. They previously lived
 * in an in-memory Map, so the whole /content translation queue was wiped every
 * time the Cloud Run instance scaled to zero, and two replicas never saw the
 * same queue.
 */
export class TranslationRequestService {
  async listRequests(): Promise<TranslationRequestRecord[]> {
    const rows = await prisma.translationRequest.findMany({
      orderBy: { requestedAt: "desc" }
    });
    return rows.map((row) => toRecord(row as TranslationRequestRow));
  }

  async createRequest(
    actor: RequestActor,
    input: CreateTranslationRequestInput,
    content: RequestContent
  ): Promise<TranslationRequestRecord> {
    const integrationState: TranslationIntegrationState | undefined =
      input.method === "integration_job" ? "queued" : undefined;

    const row = await prisma.translationRequest.create({
      data: {
        contentDocumentId: content.documentId,
        contentKey: content.key,
        contentTitle: content.title,
        sourceLanguage: content.sourceLanguage,
        method: input.method,
        targetLanguage: input.targetLanguage,
        priority: input.priority,
        note: input.note ?? "",
        status: input.method === "integration_job" ? "queued_for_integration" : "pending",
        ...(integrationState ? { integrationState } : {}),
        requestedBy: actor.id
      }
    });
    return toRecord(row as TranslationRequestRow);
  }

  async getRequestOrThrow(requestId: string): Promise<TranslationRequestRecord> {
    const row = await prisma.translationRequest.findUnique({ where: { id: requestId } });
    if (!row) {
      throw new Error("Translation request could not be found.");
    }
    return toRecord(row as TranslationRequestRow);
  }

  async completeRequest(
    actor: RequestActor,
    requestId: string,
    input: CompleteTranslationRequestInput & { reviewDraftVersionId: string }
  ): Promise<TranslationRequestRecord> {
    const existing = await this.getRequestOrThrow(requestId);
    if (existing.status === "ready_for_review") {
      throw new Error("This translation request is already ready for review.");
    }
    if (existing.status === "completed") {
      throw new Error("This translation request is already completed.");
    }
    if (existing.status === "integration_failed") {
      throw new Error("A failed integration request cannot be completed.");
    }

    const row = await prisma.translationRequest.update({
      where: { id: requestId },
      data: {
        status: "ready_for_review",
        completionNote: input.completionNote ?? "",
        completedAt: new Date(),
        completedBy: actor.id,
        reviewDraftVersionId: input.reviewDraftVersionId,
        ...(existing.method === "integration_job" ? { integrationState: "completed" } : {})
      }
    });
    return toRecord(row as TranslationRequestRow);
  }

  async resetForTests() {
    await prisma.translationRequest.deleteMany({});
  }
}

let singleton: TranslationRequestService | null = null;

export function getTranslationRequestService() {
  if (!singleton) {
    singleton = new TranslationRequestService();
  }
  return singleton;
}
