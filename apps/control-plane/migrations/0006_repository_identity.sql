ALTER TABLE projects ADD COLUMN repository_key TEXT;

UPDATE projects
SET repository_key = 'github.com:' || lower(repository_owner) || '/' || lower(repository_name)
WHERE repository_owner IS NOT NULL
  AND repository_name IS NOT NULL
  AND (
    SELECT count(*)
    FROM projects AS duplicate
    WHERE lower(duplicate.repository_owner) = lower(projects.repository_owner)
      AND lower(duplicate.repository_name) = lower(projects.repository_name)
  ) = 1;

CREATE UNIQUE INDEX projects_repository_key_idx
  ON projects(repository_key)
  WHERE repository_key IS NOT NULL;
