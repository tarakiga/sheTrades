/**
 * Config Platform — Postgres Migration
 *
 * Creates the three persistence tables for the config platform:
 *   - config_documents
 *   - config_versions
 *   - config_audit_log
 *
 * Idempotent: safe to run multiple times (uses CREATE TABLE IF NOT EXISTS).
 *
 * Usage:
 *   POSTGRES_URL=... PG_SSL_ENABLED=true PG_SSL_REJECT_UNAUTHORIZED=true \
 *     tsx src/config-platform/migrate.ts
 */

import { Pool } from "pg";
import { getPostgresSslConfig } from "../admin/pg-tls.js";

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env variable: ${name}`);
  return value;
}

const DDL = `
CREATE TABLE IF NOT EXISTS config_documents (
  id            TEXT        PRIMARY KEY,
  namespace     TEXT        NOT NULL,
  key           TEXT        NOT NULL,
  type          TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL,
  created_by    TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL,
  updated_by    TEXT        NOT NULL,
  UNIQUE (namespace, key)
);

CREATE TABLE IF NOT EXISTS config_versions (
  id                          TEXT        PRIMARY KEY,
  document_id                 TEXT        NOT NULL REFERENCES config_documents(id) ON DELETE CASCADE,
  version_number              INTEGER     NOT NULL,
  state                       TEXT        NOT NULL,
  payload                     JSONB       NOT NULL,
  schema_version              INTEGER     NOT NULL DEFAULT 1,
  change_summary              TEXT,
  created_at                  TIMESTAMPTZ NOT NULL,
  created_by                  TEXT        NOT NULL,
  published_at                TIMESTAMPTZ,
  published_by                TEXT,
  rolled_back_from_version_id TEXT
);

CREATE INDEX IF NOT EXISTS config_versions_document_id_idx
  ON config_versions (document_id);

CREATE TABLE IF NOT EXISTS config_audit_log (
  id              TEXT        PRIMARY KEY,
  document_id     TEXT        NOT NULL REFERENCES config_documents(id) ON DELETE CASCADE,
  actor_id        TEXT        NOT NULL,
  actor_role      TEXT        NOT NULL,
  action          TEXT        NOT NULL,
  from_version_id TEXT,
  to_version_id   TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS config_audit_log_document_id_idx
  ON config_audit_log (document_id);
`;

import { fileURLToPath } from "url";

export async function runMigrations() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    console.log("POSTGRES_URL not set; skipping migrations.");
    return;
  }
  const pool = new Pool({
    connectionString,
    ssl: getPostgresSslConfig()
  });

  const client = await pool.connect();
  try {
    console.log("Running config platform migrations…");
    await client.query(DDL);
    console.log("✓ config_documents table ensured");
    console.log("✓ config_versions table ensured");
    console.log("✓ config_audit_log table ensured");
    console.log("Migration complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

// Check if this script is executed directly
const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith("migrate.ts") ||
  process.argv[1].endsWith("migrate.js")
);

if (isMain) {
  runMigrations().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Migration failed: ${message}`);
    process.exitCode = 1;
  });
}
