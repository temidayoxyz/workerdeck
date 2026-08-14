-- Replace the restrictive framework CHECK with an open column so new
-- frameworks can be added without a table rebuild in the future. The API
-- contract remains the validation boundary.
ALTER TABLE projects ADD COLUMN framework_next TEXT NOT NULL DEFAULT 'unknown';

UPDATE projects SET framework_next = framework;

ALTER TABLE projects DROP COLUMN framework;

ALTER TABLE projects RENAME COLUMN framework_next TO framework;
