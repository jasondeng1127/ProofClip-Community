-- Community 0.8 schema. Deployer-owned; no commercial tables.
-- One-time Notion authorization states. Rows are deleted on use and pruned
-- by the 0.8 privacy migration; there is no consumed_at column.
CREATE TABLE IF NOT EXISTS oauth_states (
  value TEXT PRIMARY KEY,
  install_id_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
-- Encrypted connection material only. workspace_id/workspace_name are kept as
-- NULLable columns so the 0.7 -> 0.8 privacy migration can clear legacy values
-- on both fresh and upgraded databases; the Worker never reads or writes them.
CREATE TABLE IF NOT EXISTS connections (
  install_id_hash TEXT PRIMARY KEY,
  access_envelope TEXT NOT NULL,
  refresh_envelope TEXT,
  workspace_id TEXT,
  workspace_name TEXT,
  updated_at INTEGER NOT NULL
);
