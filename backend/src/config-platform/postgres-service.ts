/**
 * Config Platform — Postgres-backed Service
 *
 * Drop-in replacement for the in-memory ConfigPlatformService.
 * All state lives in the three config_* tables. Survives restarts,
 * Cloud Run cold-starts, and horizontal scaling.
 */

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getPostgresSslConfig } from "../admin/pg-tls.js";
import type {
  ConfigAuditLog,
  ConfigDocument,
  ConfigDocumentType,
  ConfigNamespace,
  ConfigPayload,
  ConfigState,
  ConfigVersion,
  PublicConfigNamespace
} from "./contracts.js";
import {
  integrationConfigPayloadSchema,
  legalBlockPayloadSchema,
  lessonDocumentPayloadSchema,
  optionSetPayloadSchema
} from "./contracts.js";

// ---------------------------------------------------------------------------
// Pool singleton
// ---------------------------------------------------------------------------

let _pool: Pool | null = null;

export function getConfigPgPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) throw new Error("POSTGRES_URL is not set.");
    _pool = new Pool({
      connectionString,
      ssl: getPostgresSslConfig(),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
  }
  return _pool;
}

// ---------------------------------------------------------------------------
// Types mirroring service.ts
// ---------------------------------------------------------------------------

type Actor = { id: string; role: "admin" | "editor" | "viewer" };
type CreateDocumentInput = {
  namespace: ConfigNamespace;
  key: string;
  type: ConfigDocumentType;
  title: string;
  initialPayload: ConfigPayload;
};
type UpdateDraftInput = { payload: ConfigPayload; changeSummary?: string };
type PublishInput = { expectedDraftVersionId: string; publishNote?: string };
type RollbackInput = { targetVersionId: string; rollbackReason?: string };
type ArchiveInput = { archiveReason?: string };
type ReactivateInput = { reactivateReason?: string };
type ListDocumentsQuery = {
  namespace?: ConfigNamespace;
  type?: ConfigDocumentType;
  keyPrefix?: string;
  page: number;
  pageSize: number;
};
type ListDocumentsOptions = { includeIntegration?: boolean };

// ---------------------------------------------------------------------------
// Row → Domain mappers
// ---------------------------------------------------------------------------

function formatTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function toDocument(row: Record<string, unknown>): ConfigDocument {
  return {
    id: String(row.id),
    namespace: row.namespace as ConfigNamespace,
    key: String(row.key),
    type: row.type as ConfigDocumentType,
    title: String(row.title),
    isActive: Boolean(row.is_active),
    createdAt: formatTimestamp(row.created_at),
    createdBy: String(row.created_by),
    updatedAt: formatTimestamp(row.updated_at),
    updatedBy: String(row.updated_by)
  };
}

function toVersion(row: Record<string, unknown>): ConfigVersion {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    versionNumber: Number(row.version_number),
    state: row.state as ConfigState,
    payload: row.payload as ConfigPayload,
    schemaVersion: Number(row.schema_version ?? 1),
    ...(row.change_summary ? { changeSummary: String(row.change_summary) } : {}),
    createdAt: formatTimestamp(row.created_at),
    createdBy: String(row.created_by),
    ...(row.published_at ? { publishedAt: formatTimestamp(row.published_at) } : {}),
    ...(row.published_by ? { publishedBy: String(row.published_by) } : {}),
    ...(row.rolled_back_from_version_id
      ? { rolledBackFromVersionId: String(row.rolled_back_from_version_id) }
      : {})
  };
}

function nowIso() {
  return new Date().toISOString();
}

function validatePayloadForType(type: ConfigDocumentType, payload: ConfigPayload): ConfigPayload {
  switch (type) {
    case "option_set":
      return optionSetPayloadSchema.parse(payload);
    case "legal_block":
      return legalBlockPayloadSchema.parse(payload);
    case "integration_config":
      return integrationConfigPayloadSchema.parse(payload);
    case "lesson_content":
      // This is the LIVE path (service.ts is the in-memory variant). Previously
      // lesson_content fell through to `default` unvalidated, so a malformed
      // answerIndex reached the bot and silently mis-scored learners.
      return lessonDocumentPayloadSchema.parse(payload);
    default:
      return payload;
  }
}

function toVersionTag(documentId: string, versionNumber: number) {
  return `${documentId}:v${versionNumber}`;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class PostgresConfigPlatformService {
  private get db() {
    return getConfigPgPool();
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async getDocumentRow(id: string): Promise<ConfigDocument> {
    const result = await this.db.query("SELECT * FROM config_documents WHERE id = $1", [id]);
    const row = result.rows[0];
    if (!row) throw new Error("Config document not found.");
    return toDocument(row);
  }

  private async findDocumentByKey(
    namespace: ConfigNamespace,
    key: string
  ): Promise<ConfigDocument | null> {
    const result = await this.db.query(
      "SELECT * FROM config_documents WHERE namespace = $1 AND key = $2",
      [namespace, key]
    );
    return result.rows[0] ? toDocument(result.rows[0]) : null;
  }

  private async getDocumentByKey(namespace: ConfigNamespace, key: string): Promise<ConfigDocument> {
    const doc = await this.findDocumentByKey(namespace, key);
    if (!doc) throw new Error("Config document not found.");
    return doc;
  }

  private async getVersions(documentId: string): Promise<ConfigVersion[]> {
    const result = await this.db.query(
      "SELECT * FROM config_versions WHERE document_id = $1 ORDER BY version_number ASC",
      [documentId]
    );
    return result.rows.map(toVersion);
  }

  private async findDraftVersion(documentId: string): Promise<ConfigVersion | null> {
    const result = await this.db.query(
      "SELECT * FROM config_versions WHERE document_id = $1 AND state = 'draft' LIMIT 1",
      [documentId]
    );
    return result.rows[0] ? toVersion(result.rows[0]) : null;
  }

  private async findPublishedVersion(documentId: string): Promise<ConfigVersion | null> {
    const result = await this.db.query(
      "SELECT * FROM config_versions WHERE document_id = $1 AND state = 'published' ORDER BY version_number DESC LIMIT 1",
      [documentId]
    );
    return result.rows[0] ? toVersion(result.rows[0]) : null;
  }

  private async getNextVersionNumber(documentId: string): Promise<number> {
    const result = await this.db.query(
      "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM config_versions WHERE document_id = $1",
      [documentId]
    );
    return Number(result.rows[0]?.next ?? 1);
  }

  private async appendAudit(
    documentId: string,
    actor: Actor,
    action: ConfigAuditLog["action"],
    fromVersionId?: string,
    toVersionId?: string,
    metadata: Record<string, unknown> = {}
  ) {
    await this.db.query(
      `INSERT INTO config_audit_log
         (id, document_id, actor_id, actor_role, action, from_version_id, to_version_id, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        documentId,
        actor.id,
        actor.role,
        action,
        fromVersionId ?? null,
        toVersionId ?? null,
        JSON.stringify(metadata),
        nowIso()
      ]
    );
  }

  private async insertVersion(v: ConfigVersion) {
    await this.db.query(
      `INSERT INTO config_versions
         (id, document_id, version_number, state, payload, schema_version, change_summary,
          created_at, created_by, published_at, published_by, rolled_back_from_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        v.id,
        v.documentId,
        v.versionNumber,
        v.state,
        JSON.stringify(v.payload),
        v.schemaVersion,
        v.changeSummary ?? null,
        v.createdAt,
        v.createdBy,
        v.publishedAt ?? null,
        v.publishedBy ?? null,
        v.rolledBackFromVersionId ?? null
      ]
    );
  }

  private async updateVersionState(
    id: string,
    state: ConfigState,
    publishedAt?: string,
    publishedBy?: string
  ) {
    await this.db.query(
      "UPDATE config_versions SET state=$1, published_at=$2, published_by=$3 WHERE id=$4",
      [state, publishedAt ?? null, publishedBy ?? null, id]
    );
  }

  private async updateDocument(doc: ConfigDocument) {
    await this.db.query(
      "UPDATE config_documents SET title=$1, is_active=$2, updated_at=$3, updated_by=$4 WHERE id=$5",
      [doc.title, doc.isActive, doc.updatedAt, doc.updatedBy, doc.id]
    );
  }

  // ── public API (mirrors ConfigPlatformService) ────────────────────────────

  async createDocument(actor: Actor, input: CreateDocumentInput) {
    const existing = await this.findDocumentByKey(input.namespace, input.key);
    if (existing) {
      throw new Error("A config document with this namespace/key already exists.");
    }
    const initialPayload = validatePayloadForType(input.type, input.initialPayload);

    const doc: ConfigDocument = {
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

    await this.db.query(
      `INSERT INTO config_documents
         (id, namespace, key, type, title, is_active, created_at, created_by, updated_at, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [doc.id, doc.namespace, doc.key, doc.type, doc.title, doc.isActive,
       doc.createdAt, doc.createdBy, doc.updatedAt, doc.updatedBy]
    );

    const version: ConfigVersion = {
      id: randomUUID(),
      documentId: doc.id,
      versionNumber: 1,
      state: "draft",
      payload: initialPayload,
      schemaVersion: 1,
      createdAt: nowIso(),
      createdBy: actor.id
    };
    await this.insertVersion(version);
    await this.appendAudit(doc.id, actor, "document_created", undefined, version.id);
    await this.appendAudit(doc.id, actor, "draft_created", undefined, version.id);

    return { document: doc, draft: version };
  }

  async listDocuments(query: ListDocumentsQuery, options: ListDocumentsOptions = {}) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (options.includeIntegration === false) {
      conditions.push(`namespace != 'integration'`);
    }
    if (query.namespace) {
      conditions.push(`namespace = $${p++}`);
      params.push(query.namespace);
    }
    if (query.type) {
      conditions.push(`type = $${p++}`);
      params.push(query.type);
    }
    if (query.keyPrefix) {
      conditions.push(`key LIKE $${p++}`);
      params.push(`${query.keyPrefix}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await this.db.query(
      `SELECT COUNT(*) AS total FROM config_documents ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const offset = (query.page - 1) * query.pageSize;
    const rowResult = await this.db.query(
      `SELECT * FROM config_documents ${where} ORDER BY updated_at DESC LIMIT $${p++} OFFSET $${p++}`,
      [...params, query.pageSize, offset]
    );

    const items = await Promise.all(
      rowResult.rows.map(async (row) => {
        const document = toDocument(row);
        const draft = await this.findDraftVersion(document.id);
        const published = await this.findPublishedVersion(document.id);
        return { document, draft, published };
      })
    );

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async updateDraft(actor: Actor, documentId: string, input: UpdateDraftInput) {
    const document = await this.getDocumentRow(documentId);
    const existingDraft = await this.findDraftVersion(documentId);
    const nextPayload = validatePayloadForType(document.type, input.payload);

    // Delete the old draft version row
    if (existingDraft) {
      await this.db.query("DELETE FROM config_versions WHERE id = $1", [existingDraft.id]);
    }

    const nextVersionNumber = await this.getNextVersionNumber(documentId);
    const nextDraft: ConfigVersion = {
      id: randomUUID(),
      documentId,
      versionNumber: nextVersionNumber,
      state: "draft",
      payload: nextPayload,
      schemaVersion: existingDraft?.schemaVersion ?? 1,
      ...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
      createdAt: existingDraft?.createdAt ?? nowIso(),
      createdBy: existingDraft?.createdBy ?? actor.id
    };
    await this.insertVersion(nextDraft);

    const updatedDoc: ConfigDocument = { ...document, updatedAt: nowIso(), updatedBy: actor.id };
    await this.updateDocument(updatedDoc);

    await this.appendAudit(documentId, actor, "draft_updated", existingDraft?.id, nextDraft.id, {
      changeSummary: input.changeSummary ?? null
    });

    return { document: updatedDoc, draft: nextDraft };
  }

  async publishDocument(actor: Actor, documentId: string, input: PublishInput) {
    const document = await this.getDocumentRow(documentId);
    const versions = await this.getVersions(documentId);
    const draft = versions.find((v) => v.id === input.expectedDraftVersionId);
    if (!draft || draft.state !== "draft") throw new Error("Expected draft version was not found.");

    const previouslyPublished = versions.find((v) => v.state === "published") ?? null;

    // Archive the current published version
    if (previouslyPublished) {
      await this.updateVersionState(previouslyPublished.id, "archived");
    }

    // Promote draft to published
    const publishedAt = nowIso();
    await this.updateVersionState(draft.id, "published", publishedAt, actor.id);

    const published: ConfigVersion = {
      ...draft,
      state: "published",
      publishedAt,
      publishedBy: actor.id
    };

    const updatedDoc: ConfigDocument = { ...document, updatedAt: nowIso(), updatedBy: actor.id };
    await this.updateDocument(updatedDoc);

    await this.appendAudit(documentId, actor, "published", previouslyPublished?.id, published.id, {
      publishNote: input.publishNote ?? null
    });

    return { document: updatedDoc, published };
  }

  async rollbackDocument(actor: Actor, documentId: string, input: RollbackInput) {
    const document = await this.getDocumentRow(documentId);
    const versions = await this.getVersions(documentId);
    const target = versions.find((v) => v.id === input.targetVersionId);
    if (!target) throw new Error("Rollback target version was not found.");
    if (target.state === "draft") throw new Error("Draft versions cannot be rollback targets.");

    const previouslyPublished = versions.find((v) => v.state === "published") ?? null;
    if (previouslyPublished) {
      await this.updateVersionState(previouslyPublished.id, "archived");
    }

    const nextVersionNumber = await this.getNextVersionNumber(documentId);
    const rollbackVersion: ConfigVersion = {
      id: randomUUID(),
      documentId,
      versionNumber: nextVersionNumber,
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
    await this.insertVersion(rollbackVersion);

    const updatedDoc: ConfigDocument = { ...document, updatedAt: nowIso(), updatedBy: actor.id };
    await this.updateDocument(updatedDoc);

    await this.appendAudit(documentId, actor, "rolled_back", previouslyPublished?.id, rollbackVersion.id, {
      targetVersionId: input.targetVersionId,
      rollbackReason: input.rollbackReason ?? null
    });

    return { document: updatedDoc, published: rollbackVersion };
  }

  async getHistory(documentId: string) {
    await this.getDocumentRow(documentId); // validates existence
    const versions = await this.getVersions(documentId);
    const auditResult = await this.db.query(
      "SELECT * FROM config_audit_log WHERE document_id = $1 ORDER BY created_at DESC",
      [documentId]
    );
    return {
      versions: [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
      audit: auditResult.rows as ConfigAuditLog[]
    };
  }

  async getPublishedConfig(namespace?: PublicConfigNamespace) {
    const conditions = ["d.is_active = TRUE", "d.namespace != 'integration'"];
    const params: unknown[] = [];
    if (namespace) {
      conditions.push(`d.namespace = $${params.length + 1}`);
      params.push(namespace);
    }

    const result = await this.db.query(
      `SELECT d.id, d.namespace, d.key, d.updated_at,
              v.id AS version_id, v.version_number, v.payload
       FROM config_documents d
       JOIN config_versions v
         ON v.document_id = d.id AND v.state = 'published'
       WHERE ${conditions.join(" AND ")}
       ORDER BY v.version_number DESC`,
      params
    );

    // De-duplicate: keep only the highest version per document
    const seen = new Set<string>();
    const documents = result.rows
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .map((row) => ({
        namespace: row.namespace as ConfigNamespace,
        key: String(row.key),
        versionTag: toVersionTag(String(row.id), Number(row.version_number)),
        data: row.payload as ConfigPayload,
        updatedAt: formatTimestamp(row.updated_at)
      }));

    const versionTag = documents.map((d) => d.versionTag).join("|") || "empty";
    return { versionTag, documents };
  }

  async getDocumentByNamespaceKey(namespace: ConfigNamespace, key: string) {
    const document = await this.getDocumentByKey(namespace, key);
    const draft = await this.findDraftVersion(document.id);
    const published = await this.findPublishedVersion(document.id);
    return { document, draft, published };
  }

  getDocument(documentId: string): Promise<ConfigDocument> {
    return this.getDocumentRow(documentId);
  }

  async getPublishedDocumentByNamespaceKey(namespace: ConfigNamespace, key: string) {
    const doc = await this.findDocumentByKey(namespace, key);
    if (!doc || !doc.isActive) return null;
    const published = await this.findPublishedVersion(doc.id);
    if (!published) return null;
    return { document: doc, published };
  }

  async getHistoryByNamespaceKey(namespace: ConfigNamespace, key: string) {
    const doc = await this.getDocumentByKey(namespace, key);
    return this.getHistory(doc.id);
  }

  async archiveDocument(actor: Actor, documentId: string, input: ArchiveInput) {
    const document = await this.getDocumentRow(documentId);
    if (!document.isActive) throw new Error("Config document is already hidden.");

    const updatedDoc: ConfigDocument = { ...document, isActive: false, updatedAt: nowIso(), updatedBy: actor.id };
    await this.updateDocument(updatedDoc);
    await this.appendAudit(documentId, actor, "archived", undefined, undefined, {
      archiveReason: input.archiveReason ?? null
    });

    return { document: updatedDoc };
  }

  async reactivateDocument(actor: Actor, documentId: string, input: ReactivateInput) {
    const document = await this.getDocumentRow(documentId);
    if (document.isActive) throw new Error("Config document is already visible.");

    let published = await this.findPublishedVersion(documentId);
    if (!published) {
      const versions = await this.getVersions(documentId);
      const target = versions.filter((v) => v.state !== "draft").sort((a, b) => b.versionNumber - a.versionNumber)[0];
      if (!target) throw new Error("No previous live version is available to show again.");

      const nextVersionNumber = await this.getNextVersionNumber(documentId);
      const rollbackVersion: ConfigVersion = {
        id: randomUUID(),
        documentId,
        versionNumber: nextVersionNumber,
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
      await this.insertVersion(rollbackVersion);
      published = rollbackVersion;
    }

    const updatedDoc: ConfigDocument = { ...document, isActive: true, updatedAt: nowIso(), updatedBy: actor.id };
    await this.updateDocument(updatedDoc);
    await this.appendAudit(documentId, actor, "reactivated", published?.rolledBackFromVersionId, published?.id, {
      reactivateReason: input.reactivateReason ?? null
    });

    return { document: updatedDoc, published };
  }

  async archiveDocumentByNamespaceKey(actor: Actor, namespace: ConfigNamespace, key: string, input: ArchiveInput) {
    const doc = await this.getDocumentByKey(namespace, key);
    return this.archiveDocument(actor, doc.id, input);
  }

  async reactivateDocumentByNamespaceKey(actor: Actor, namespace: ConfigNamespace, key: string, input: ReactivateInput) {
    const doc = await this.getDocumentByKey(namespace, key);
    return this.reactivateDocument(actor, doc.id, input);
  }

  async purgeDocument(actor: Actor, documentId: string) {
    const document = await this.getDocumentRow(documentId);
    if (document.isActive) {
      throw new Error("Only trashed documents can be permanently deleted. Move it to trash first.");
    }
    // ON DELETE CASCADE handles versions and audit_log rows
    await this.db.query("DELETE FROM config_documents WHERE id = $1", [documentId]);
    return { purgedDocumentId: documentId };
  }

  async purgeTrashForNamespace(actor: Actor, namespace: ConfigNamespace) {
    const result = await this.db.query(
      "DELETE FROM config_documents WHERE namespace = $1 AND is_active = FALSE RETURNING key",
      [namespace]
    );
    const purgedKeys = result.rows.map((r) => String(r.key));
    return { purgedCount: purgedKeys.length, purgedKeys };
  }

  // Used only in tests — no-op for Postgres (drop/recreate tables instead)
  resetForTests() {
    throw new Error("resetForTests() is not supported on PostgresConfigPlatformService. Use a test schema.");
  }
}
