CREATE TABLE IF NOT EXISTS interaction_notes (
  page_id TEXT PRIMARY KEY,
  notes_json TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS login_attempts (
  client_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  started_at INTEGER NOT NULL
);
