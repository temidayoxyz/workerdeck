CREATE TABLE cache_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path_expression TEXT NOT NULL,
  edge_ttl_seconds INTEGER NOT NULL CHECK (edge_ttl_seconds BETWEEN 0 AND 2592000),
  browser_ttl_seconds INTEGER CHECK (browser_ttl_seconds BETWEEN 0 AND 2592000),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT,
  sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, path_expression)
);

CREATE INDEX cache_rules_project_idx ON cache_rules(project_id, position);

CREATE TABLE cache_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revalidation_namespace_resource_id TEXT,
  updated_at TEXT NOT NULL
);
