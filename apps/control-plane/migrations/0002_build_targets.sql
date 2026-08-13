ALTER TABLE environments ADD COLUMN worker_tag TEXT;
ALTER TABLE environments ADD COLUMN build_trigger_id TEXT;

CREATE INDEX environments_worker_name_idx ON environments(worker_name);

CREATE UNIQUE INDEX deployments_active_environment_idx
  ON deployments(environment_id)
  WHERE status IN ('queued', 'building', 'deploying');
