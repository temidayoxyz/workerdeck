CREATE TABLE managed_resources_expanded (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'worker',
      'd1',
      'kv',
      'r2',
      'domain',
      'queue',
      'workflow',
      'hyperdrive',
      'vectorize',
      'ai_gateway',
      'durable_object'
    )
  ),
  cloudflare_id TEXT NOT NULL,
  name TEXT NOT NULL,
  ownership_tag TEXT NOT NULL UNIQUE,
  configuration_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'detaching', 'adopted')),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO managed_resources_expanded (
  id,
  project_id,
  environment_id,
  kind,
  cloudflare_id,
  name,
  ownership_tag,
  configuration_json,
  created_at,
  deleted_at
)
SELECT
  id,
  project_id,
  environment_id,
  kind,
  cloudflare_id,
  name,
  ownership_tag,
  configuration_json,
  created_at,
  deleted_at
FROM managed_resources;

DROP TABLE managed_resources;

ALTER TABLE managed_resources_expanded RENAME TO managed_resources;

CREATE UNIQUE INDEX managed_resources_active_provider_idx
  ON managed_resources(kind, cloudflare_id)
  WHERE deleted_at IS NULL;
