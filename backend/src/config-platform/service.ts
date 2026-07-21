import { randomUUID } from "node:crypto";
import { PostgresConfigPlatformService } from "./postgres-service.js";
import type {
  ConfigAuditLog,
  ConfigDocument,
  ConfigDocumentType,
  ConfigPayload,
  ConfigState,
  ConfigVersion
} from "./contracts.js";
import {
  type ConfigNamespace,
  type PublicConfigNamespace,
  integrationConfigPayloadSchema,
  legalBlockPayloadSchema,
  lessonDocumentPayloadSchema,
  optionSetPayloadSchema
} from "./contracts.js";
type Actor = {
  id: string;
  role: "admin" | "editor" | "viewer";
};

type CreateDocumentInput = {
  namespace: ConfigNamespace;
  key: string;
  type: ConfigDocumentType;
  title: string;
  initialPayload: ConfigPayload;
};

type UpdateDraftInput = {
  payload: ConfigPayload;
  changeSummary?: string | undefined;
};

type PublishInput = {
  expectedDraftVersionId: string;
  publishNote?: string | undefined;
};

type RollbackInput = {
  targetVersionId: string;
  rollbackReason?: string | undefined;
};

type ArchiveInput = {
  archiveReason?: string | undefined;
};

type ReactivateInput = {
  reactivateReason?: string | undefined;
};

type ListDocumentsQuery = {
  namespace?: ConfigNamespace;
  type?: ConfigDocumentType;
  keyPrefix?: string;
  page: number;
  pageSize: number;
};

type ListDocumentsOptions = {
  includeIntegration?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function toVersionTag(documentId: string, versionNumber: number) {
  return `${documentId}:v${versionNumber}`;
}

function isPayloadPublishable(payload: ConfigPayload) {
  if (Array.isArray(payload)) return payload.length > 0;
  if (payload && typeof payload === "object") {
    return Object.keys(payload).length > 0;
  }
  return payload !== null && payload !== undefined;
}

function validatePayloadForDocumentType(type: ConfigDocumentType, payload: ConfigPayload) {
  switch (type) {
    case "lesson_content":
      // Enforces only that quiz indices reference real options. Everything else
      // passes through — 43 lessons are live and this must not block publishing
      // over a field the schema does not know about.
      return lessonDocumentPayloadSchema.parse(payload);
    case "option_set":
      return optionSetPayloadSchema.parse(payload);
    case "legal_block":
      return legalBlockPayloadSchema.parse(payload);
    case "integration_config":
      return integrationConfigPayloadSchema.parse(payload);
    case "ui_copy":
      return payload;
  }
}

export class ConfigPlatformService {
  private readonly documents = new Map<string, ConfigDocument>();
  private readonly versionsByDocument = new Map<string, ConfigVersion[]>();
  private readonly auditByDocument = new Map<string, ConfigAuditLog[]>();

  private appendAudit(
    documentId: string,
    actor: Actor,
    action: ConfigAuditLog["action"],
    fromVersionId?: string,
    toVersionId?: string,
    metadata: Record<string, unknown> = {}
  ) {
    const row: ConfigAuditLog = {
      id: randomUUID(),
      documentId,
      actorId: actor.id,
      actorRole: actor.role,
      action,
      ...(fromVersionId ? { fromVersionId } : {}),
      ...(toVersionId ? { toVersionId } : {}),
      metadata,
      createdAt: nowIso()
    };
    const existing = this.auditByDocument.get(documentId) ?? [];
    existing.push(row);
    this.auditByDocument.set(documentId, existing);
  }

  private getVersions(documentId: string) {
    return this.versionsByDocument.get(documentId) ?? [];
  }

  private saveVersions(documentId: string, versions: ConfigVersion[]) {
    this.versionsByDocument.set(documentId, versions);
  }

  private getNextVersionNumber(documentId: string) {
    const versions = this.getVersions(documentId);
    const max = versions.reduce((acc, item) => Math.max(acc, item.versionNumber), 0);
    return max + 1;
  }

  private findDocumentByNamespaceKey(namespace: ConfigNamespace, key: string) {
    for (const doc of this.documents.values()) {
      if (doc.namespace === namespace && doc.key === key) {
        return doc;
      }
    }
    return null;
  }

  private getDocumentOrThrow(documentId: string) {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error("Config document not found.");
    }
    return document;
  }

  private findDraftVersion(documentId: string) {
    return this.getVersions(documentId).find((item) => item.state === "draft") ?? null;
  }

  private findPublishedVersion(documentId: string) {
    const versions = this.getVersions(documentId);
    const published = versions.filter((item) => item.state === "published");
    if (published.length === 0) return null;
    return published.sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null;
  }

  async createDocument(actor: Actor, input: CreateDocumentInput) {
    const duplicate = this.findDocumentByNamespaceKey(input.namespace, input.key);
    if (duplicate) {
      throw new Error("A config document with this namespace/key already exists.");
    }
    const initialPayload = validatePayloadForDocumentType(input.type, input.initialPayload);

    const document: ConfigDocument = {
      id: randomUUID(),
      namespace: input.namespace,
      key: input.key,
      type: input.type,
      title: input.title,
      isActive: true,
      createdAt: nowIso(),
      createdBy: actor.id,
      updatedAt: nowIso(),
      updatedBy: actor.id
    };
    this.documents.set(document.id, document);

    const version: ConfigVersion = {
      id: randomUUID(),
      documentId: document.id,
      versionNumber: 1,
      state: "draft",
      payload: initialPayload,
      schemaVersion: 1,
      createdAt: nowIso(),
      createdBy: actor.id
    };
    this.saveVersions(document.id, [version]);
    this.appendAudit(document.id, actor, "document_created", undefined, version.id);
    this.appendAudit(document.id, actor, "draft_created", undefined, version.id);

    return { document, draft: version };
  }

  async listDocuments(query: ListDocumentsQuery, options: ListDocumentsOptions = {}) {
    let rows = Array.from(this.documents.values());
    if (options.includeIntegration === false) {
      rows = rows.filter((item) => item.namespace !== "integration");
    }
    if (query.namespace) {
      rows = rows.filter((item) => item.namespace === query.namespace);
    }
    if (query.type) {
      rows = rows.filter((item) => item.type === query.type);
    }
    if (query.keyPrefix) {
      rows = rows.filter((item) => item.key.startsWith(query.keyPrefix ?? ""));
    }
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const start = (query.page - 1) * query.pageSize;
    const paged = rows.slice(start, start + query.pageSize);

    return {
      items: paged.map((document) => ({
        document,
        draft: this.findDraftVersion(document.id),
        published: this.findPublishedVersion(document.id)
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: rows.length
    };
  }

  async updateDraft(actor: Actor, documentId: string, input: UpdateDraftInput) {
    const document = this.getDocumentOrThrow(documentId);
    const versions = this.getVersions(documentId);
    const existingDraft = this.findDraftVersion(documentId);
    const createdAt = existingDraft?.createdAt ?? nowIso();
    const createdBy = existingDraft?.createdBy ?? actor.id;
    const previousDraftId = existingDraft?.id;
    const nextPayload = validatePayloadForDocumentType(document.type, input.payload);

    const nextDraft: ConfigVersion = {
      id: randomUUID(),
      documentId,
      versionNumber: this.getNextVersionNumber(documentId),
      state: "draft",
      payload: nextPayload,
      schemaVersion: existingDraft?.schemaVersion ?? 1,
      ...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
      createdAt,
      createdBy
    };

    const withoutDraft = versions.filter((item) => item.state !== "draft");
    withoutDraft.push(nextDraft);
    this.saveVersions(documentId, withoutDraft);

    const updatedDocument: ConfigDocument = {
      ...document,
      updatedAt: nowIso(),
      updatedBy: actor.id
    };
    this.documents.set(documentId, updatedDocument);

    this.appendAudit(documentId, actor, "draft_updated", previousDraftId, nextDraft.id, {
      changeSummary: input.changeSummary ?? null
    });

    return { document: updatedDocument, draft: nextDraft };
  }

  async publishDocument(actor: Actor, documentId: string, input: PublishInput) {
    const document = this.getDocumentOrThrow(documentId);
    const versions = this.getVersions(documentId);
    const draft = versions.find((item) => item.id === input.expectedDraftVersionId);
    if (!draft || draft.state !== "draft") {
      throw new Error("Expected draft version was not found.");
    }
    if (!isPayloadPublishable(draft.payload)) {
      throw new Error("Cannot publish an empty config payload.");
    }

    const previouslyPublished = versions.find((item) => item.state === "published") ?? null;
    const nextVersions = versions.map((item) => {
      if (item.id === draft.id) {
        return {
          ...item,
          state: "published" as ConfigState,
          publishedAt: nowIso(),
          publishedBy: actor.id
        };
      }
      if (item.state === "published") {
        return { ...item, state: "archived" as ConfigState };
      }
      return item;
    });
    this.saveVersions(documentId, nextVersions);

    const published = nextVersions.find((item) => item.id === draft.id);
    if (!published) {
      throw new Error("Publish transition failed.");
    }

    const updatedDocument: ConfigDocument = {
      ...document,
      updatedAt: nowIso(),
      updatedBy: actor.id
    };
    this.documents.set(documentId, updatedDocument);

    this.appendAudit(documentId, actor, "published", previouslyPublished?.id, published.id, {
      publishNote: input.publishNote ?? null
    });

    return { document: updatedDocument, published };
  }

  async rollbackDocument(actor: Actor, documentId: string, input: RollbackInput) {
    const document = this.getDocumentOrThrow(documentId);
    const versions = this.getVersions(documentId);
    const target = versions.find((item) => item.id === input.targetVersionId);
    if (!target) {
      throw new Error("Rollback target version was not found.");
    }
    if (target.state === "draft") {
      throw new Error("Draft versions cannot be rollback targets.");
    }

    const previouslyPublished = versions.find((item) => item.state === "published") ?? null;
    const rollbackVersion: ConfigVersion = {
      id: randomUUID(),
      documentId,
      versionNumber: this.getNextVersionNumber(documentId),
      state: "published",
      payload: target.payload,
      schemaVersion: target.schemaVersion,
      changeSummary: input.rollbackReason ?? `Rollback to version ${target.versionNumber}`,
      createdAt: nowIso(),
      createdBy: actor.id,
      publishedAt: nowIso(),
      publishedBy: actor.id,
      rolledBackFromVersionId: target.id
    };

    const nextVersions = versions.map((item) =>
      item.state === "published" ? { ...item, state: "archived" as ConfigState } : item
    );
    nextVersions.push(rollbackVersion);
    this.saveVersions(documentId, nextVersions);

    const updatedDocument: ConfigDocument = {
      ...document,
      updatedAt: nowIso(),
      updatedBy: actor.id
    };
    this.documents.set(documentId, updatedDocument);

    this.appendAudit(
      documentId,
      actor,
      "rolled_back",
      previouslyPublished?.id,
      rollbackVersion.id,
      {
        targetVersionId: input.targetVersionId,
        rollbackReason: input.rollbackReason ?? null
      }
    );

    return {
      document: updatedDocument,
      published: rollbackVersion
    };
  }

  async getHistory(documentId: string) {
    this.getDocumentOrThrow(documentId);
    return {
      versions: this.getVersions(documentId).sort((a, b) => b.versionNumber - a.versionNumber),
      audit: (this.auditByDocument.get(documentId) ?? []).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      )
    };
  }

  async getPublishedConfig(namespace?: PublicConfigNamespace) {
    const rows = Array.from(this.documents.values())
      .filter((document) => document.isActive)
      .filter((document) => document.namespace !== "integration")
      .filter((document) => (namespace ? document.namespace === namespace : true))
      .map((document) => {
        const published = this.findPublishedVersion(document.id);
        if (!published) return null;
        return {
          namespace: document.namespace,
          key: document.key,
          versionTag: toVersionTag(document.id, published.versionNumber),
          data: published.payload,
          updatedAt: document.updatedAt
        };
      })
      .filter(Boolean);

    const documents = rows as Array<{
      namespace: ConfigNamespace;
      key: string;
      versionTag: string;
      data: ConfigPayload;
      updatedAt: string;
    }>;

    const versionTag = documents.map((item) => item.versionTag).join("|") || "empty";
    return { versionTag, documents };
  }

  async getDocumentByNamespaceKey(namespace: ConfigNamespace, key: string) {
    const document = this.findDocumentByNamespaceKey(namespace, key);
    if (!document) {
      throw new Error("Config document not found.");
    }
    return {
      document,
      draft: this.findDraftVersion(document.id),
      published: this.findPublishedVersion(document.id)
    };
  }

  async getDocument(documentId: string) {
    return this.getDocumentOrThrow(documentId);
  }

  async getPublishedDocumentByNamespaceKey(namespace: ConfigNamespace, key: string) {
    const match = this.findDocumentByNamespaceKey(namespace, key);
    if (!match || !match.isActive) {
      return null;
    }

    const published = this.findPublishedVersion(match.id);
    if (!published) {
      return null;
    }

    return {
      document: match,
      published
    };
  }

  async getHistoryByNamespaceKey(namespace: ConfigNamespace, key: string) {
    const match = this.findDocumentByNamespaceKey(namespace, key);
    if (!match) {
      throw new Error("Config document not found.");
    }
    return this.getHistory(match.id);
  }

  async archiveDocument(actor: Actor, documentId: string, input: ArchiveInput) {
    const document = this.getDocumentOrThrow(documentId);
    if (!document.isActive) {
      throw new Error("Config document is already hidden.");
    }

    const updatedDocument: ConfigDocument = {
      ...document,
      isActive: false,
      updatedAt: nowIso(),
      updatedBy: actor.id
    };
    this.documents.set(documentId, updatedDocument);

    this.appendAudit(documentId, actor, "archived", undefined, undefined, {
      archiveReason: input.archiveReason ?? null
    });

    return { document: updatedDocument };
  }

  async reactivateDocument(actor: Actor, documentId: string, input: ReactivateInput) {
    const document = this.getDocumentOrThrow(documentId);
    if (document.isActive) {
      throw new Error("Config document is already visible.");
    }

    const versions = this.getVersions(documentId);
    let nextVersions = [...versions];
    let published = versions.find((item) => item.state === "published") ?? null;

    if (!published) {
      const target = [...versions]
        .filter((item) => item.state !== "draft")
        .sort((a, b) => b.versionNumber - a.versionNumber)[0];

      if (!target) {
        throw new Error("No previous live version is available to show again.");
      }

      const rollbackVersion: ConfigVersion = {
        id: randomUUID(),
        documentId,
        versionNumber: this.getNextVersionNumber(documentId),
        state: "published",
        payload: target.payload,
        schemaVersion: target.schemaVersion,
        changeSummary: input.reactivateReason ?? `Reactivated from version ${target.versionNumber}`,
        createdAt: nowIso(),
        createdBy: actor.id,
        publishedAt: nowIso(),
        publishedBy: actor.id,
        rolledBackFromVersionId: target.id
      };

      nextVersions = versions.map((item) =>
        item.state === "published" ? { ...item, state: "archived" as ConfigState } : item
      );
      nextVersions.push(rollbackVersion);
      this.saveVersions(documentId, nextVersions);
      published = rollbackVersion;
    }

    const updatedDocument: ConfigDocument = {
      ...document,
      isActive: true,
      updatedAt: nowIso(),
      updatedBy: actor.id
    };
    this.documents.set(documentId, updatedDocument);

    this.appendAudit(
      documentId,
      actor,
      "reactivated",
      published?.rolledBackFromVersionId,
      published?.id,
      {
        reactivateReason: input.reactivateReason ?? null
      }
    );

    return { document: updatedDocument, ...(published ? { published } : {}) };
  }

  async archiveDocumentByNamespaceKey(
    actor: Actor,
    namespace: ConfigNamespace,
    key: string,
    input: ArchiveInput
  ) {
    const match = this.findDocumentByNamespaceKey(namespace, key);
    if (!match) {
      throw new Error("Config document not found.");
    }
    return this.archiveDocument(actor, match.id, input);
  }

  async reactivateDocumentByNamespaceKey(
    actor: Actor,
    namespace: ConfigNamespace,
    key: string,
    input: ReactivateInput
  ) {
    const match = this.findDocumentByNamespaceKey(namespace, key);
    if (!match) {
      throw new Error("Config document not found.");
    }
    return this.reactivateDocument(actor, match.id, input);
  }

  async purgeDocument(actor: Actor, documentId: string) {
    const document = this.getDocumentOrThrow(documentId);
    if (document.isActive) {
      throw new Error("Only trashed documents can be permanently deleted. Move it to trash first.");
    }
    this.documents.delete(documentId);
    this.versionsByDocument.delete(documentId);
    this.auditByDocument.delete(documentId);
    return { purgedDocumentId: documentId };
  }

  async purgeTrashForNamespace(actor: Actor, namespace: ConfigNamespace) {
    const trashedDocs = Array.from(this.documents.values()).filter(
      (doc) => doc.namespace === namespace && !doc.isActive
    );
    const purgedKeys: string[] = [];
    for (const doc of trashedDocs) {
      this.documents.delete(doc.id);
      this.versionsByDocument.delete(doc.id);
      this.auditByDocument.delete(doc.id);
      purgedKeys.push(doc.key);
    }
    return { purgedCount: purgedKeys.length, purgedKeys };
  }

  resetForTests() {
    this.documents.clear();
    this.versionsByDocument.clear();
    this.auditByDocument.clear();
  }
}

let singleton: ConfigPlatformService | PostgresConfigPlatformService | null = null;

export function getConfigPlatformService(): ConfigPlatformService | PostgresConfigPlatformService {
  if (!singleton) {
    if (process.env.POSTGRES_URL) {
      singleton = new PostgresConfigPlatformService();
    } else {
      singleton = new ConfigPlatformService();
    }
  }
  return singleton;
}
