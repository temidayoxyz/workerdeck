CREATE TABLE workspace_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  invited_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX workspace_members_role_idx ON workspace_members(role, status);

CREATE TABLE access_groups (
  role TEXT PRIMARY KEY CHECK (role IN ('owner', 'admin', 'member')),
  cloudflare_id TEXT,
  synced_at TEXT,
  sync_error TEXT,
  updated_at TEXT NOT NULL
);
