import { randomUUID } from "node:crypto";
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

function nowIso() {
  return new Date().toISOString();
}

export class TranslationRequestService {
  private readonly requests = new Map<string, TranslationRequestRecord>();

  listRequests() {
    return Array.from(this.requests.values()).sort((left, right) =>
      right.requestedAt.localeCompare(left.requestedAt)
    );
  }

  createRequest(actor: RequestActor, input: CreateTranslationRequestInput, content: RequestContent) {
    const integrationState: TranslationIntegrationState | undefined =
      input.method === "integration_job" ? "queued" : undefined;
    const record: TranslationRequestRecord = {
      id: randomUUID(),
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
      requestedBy: actor.id,
      requestedAt: nowIso()
    };

    this.requests.set(record.id, record);
    return record;
  }

  getRequestOrThrow(requestId: string) {
    const record = this.requests.get(requestId);
    if (!record) {
      throw new Error("Translation request could not be found.");
    }
    return record;
  }

  completeRequest(
    actor: RequestActor,
    requestId: string,
    input: CompleteTranslationRequestInput & { reviewDraftVersionId: string }
  ) {
    const existing = this.getRequestOrThrow(requestId);
    if (existing.status === "ready_for_review") {
      throw new Error("This translation request is already ready for review.");
    }
    if (existing.status === "completed") {
      throw new Error("This translation request is already completed.");
    }
    if (existing.status === "integration_failed") {
      throw new Error("A failed integration request cannot be completed.");
    }

    const completed: TranslationRequestRecord = {
      ...existing,
      status: "ready_for_review",
      completionNote: input.completionNote ?? "",
      completedAt: nowIso(),
      completedBy: actor.id,
      reviewDraftVersionId: input.reviewDraftVersionId,
      ...(existing.method === "integration_job" ? { integrationState: "completed" as const } : {})
    };

    this.requests.set(requestId, completed);
    return completed;
  }

  resetForTests() {
    this.requests.clear();
  }
}

let singleton: TranslationRequestService | null = null;

export function getTranslationRequestService() {
  if (!singleton) {
    singleton = new TranslationRequestService();
  }
  return singleton;
}
