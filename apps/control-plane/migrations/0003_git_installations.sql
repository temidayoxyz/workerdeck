CREATE TABLE git_installations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('github')),
  provider_installation_id TEXT NOT NULL UNIQUE,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE git_setup_states (
  state_hash TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
