PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  repository_url TEXT,
  repository_owner TEXT,
  repository_name TEXT,
  production_branch TEXT NOT NULL DEFAULT 'main',
  framework TEXT NOT NULL DEFAULT 'unknown' CHECK (framework IN ('static', 'vite', 'hono', 'astro', 'next', 'unknown')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE environments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('production', 'preview', 'development')),
  worker_name TEXT,
  url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, slug)
);

CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'building', 'deploying', 'ready', 'failed', 'cancelled', 'rolled_back')),
  git_commit_sha TEXT,
  git_commit_message TEXT,
  git_branch TEXT,
  build_id TEXT,
  worker_version_id TEXT,
  triggered_by TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX deployments_project_created_idx ON deployments(project_id, created_at DESC);
CREATE INDEX deployments_environment_created_idx ON deployments(environment_id, created_at DESC);

CREATE TABLE managed_resources (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('worker', 'd1', 'kv', 'r2', 'domain', 'queue', 'workflow')),
  cloudflare_id TEXT NOT NULL,
  name TEXT NOT NULL,
  ownership_tag TEXT NOT NULL UNIQUE,
  configuration_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX managed_resources_active_provider_idx
  ON managed_resources(kind, cloudflare_id)
  WHERE deleted_at IS NULL;

CREATE TABLE operations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  deployment_id TEXT REFERENCES deployments(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  step TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  request_id TEXT NOT NULL,
  ip_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX audit_events_created_idx ON audit_events(created_at DESC);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

