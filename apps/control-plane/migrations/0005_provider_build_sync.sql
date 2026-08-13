CREATE UNIQUE INDEX deployments_build_id_idx
  ON deployments(build_id)
  WHERE build_id IS NOT NULL;

INSERT OR IGNORE INTO environments (
  id, project_id, name, slug, kind, worker_name, worker_tag, build_trigger_id,
  created_at, updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  project_id,
  'Preview',
  'preview',
  'preview',
  worker_name,
  worker_tag,
  NULL,
  created_at,
  updated_at
FROM environments
WHERE kind = 'production';
