CREATE TABLE provisioning_locks (
  scope TEXT NOT NULL,
  lock_key TEXT NOT NULL,
  actor TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (scope, lock_key)
);

CREATE INDEX provisioning_locks_expires_idx ON provisioning_locks(expires_at);
