CREATE TABLE IF NOT EXISTS oauth_states (
  value TEXT PRIMARY KEY,
  install_id_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS connections (
  install_id_hash TEXT PRIMARY KEY,
  access_envelope TEXT NOT NULL,
  refresh_envelope TEXT,
  workspace_id TEXT,
  workspace_name TEXT,
  updated_at INTEGER NOT NULL
);
