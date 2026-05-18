-- Task 026 baseline schema for CORE DIRECTIVE config management.
-- PostgreSQL-only source of truth for mutable options/content/legal blocks.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'config_namespace') THEN
    CREATE TYPE config_namespace AS ENUM ('content', 'options', 'legal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'config_document_type') THEN
    CREATE TYPE config_document_type AS ENUM ('lesson_content', 'option_set', 'legal_block', 'ui_copy');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'config_version_state') THEN
    CREATE TYPE config_version_state AS ENUM ('draft', 'published', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'config_actor_role') THEN
    CREATE TYPE config_actor_role AS ENUM ('admin', 'editor', 'viewer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'config_audit_action') THEN
    CREATE TYPE config_audit_action AS ENUM (
      'document_created',
      'draft_created',
      'draft_updated',
      'published',
      'rolled_back',
      'archived'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS config_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace config_namespace NOT NULL,
  key TEXT NOT NULL CHECK (key ~ '^[a-z0-9_.-]+$'),
  type config_document_type NOT NULL,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL,
  UNIQUE (namespace, key)
);

CREATE TABLE IF NOT EXISTS config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES config_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  state config_version_state NOT NULL,
  payload JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  change_summary TEXT,
  payload_checksum TEXT GENERATED ALWAYS AS (ENCODE(DIGEST(payload::TEXT, 'sha256'), 'hex')) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  published_by TEXT,
  rolled_back_from_version_id UUID REFERENCES config_versions(id),
  CONSTRAINT config_versions_publish_fields_chk CHECK (
    (state = 'published' AND published_at IS NOT NULL AND published_by IS NOT NULL)
    OR (state <> 'published')
  ),
  UNIQUE (document_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS config_versions_one_draft_per_document_idx
  ON config_versions(document_id)
  WHERE state = 'draft';

CREATE INDEX IF NOT EXISTS config_versions_document_state_idx
  ON config_versions(document_id, state, version_number DESC);

CREATE INDEX IF NOT EXISTS config_versions_payload_gin_idx
  ON config_versions USING GIN(payload);

CREATE TABLE IF NOT EXISTS config_publish_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES config_documents(id) ON DELETE CASCADE,
  from_version_id UUID REFERENCES config_versions(id),
  to_version_id UUID NOT NULL REFERENCES config_versions(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('publish', 'rollback')),
  event_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS config_publish_events_document_idx
  ON config_publish_events(document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS config_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES config_documents(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  actor_role config_actor_role NOT NULL,
  action config_audit_action NOT NULL,
  from_version_id UUID REFERENCES config_versions(id),
  to_version_id UUID REFERENCES config_versions(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS config_audit_log_document_idx
  ON config_audit_log(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS config_audit_log_metadata_gin_idx
  ON config_audit_log USING GIN(metadata);
