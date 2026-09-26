-- Admin access v2 (docs/ARCHITECTURE.md, "Organizer access"). One person is one email: they
-- sign in once at /org and reach every race they belong to. Membership carries a role.
-- Sivoov staff are listed in the STAFF_EMAILS var and reach every race.
ALTER TABLE organizers ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE organizers ADD COLUMN name TEXT;
ALTER TABLE organizers ADD COLUMN invited_by TEXT;
ALTER TABLE organizers ADD COLUMN created_at TEXT;
CREATE INDEX IF NOT EXISTS organizers_email ON organizers(email);

-- Codes and sessions are keyed by email now, not by one race's organizer row. The old tables
-- only held short-lived codes and sessions: everyone signs in again once.
DROP TABLE IF EXISTS organizer_codes;
DROP TABLE IF EXISTS organizer_sessions;

CREATE TABLE admin_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX admin_codes_email ON admin_codes(email, created_at);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Runner sessions remember where they were opened and when they were last used, so the
-- organizer can tell who installed the app. `client` is 'web' or 'app'; `device` is JSON.
ALTER TABLE sessions ADD COLUMN client TEXT;
ALTER TABLE sessions ADD COLUMN device TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;

-- An organizer can set a time aside (wrong activity, obvious error) without deleting the run.
-- The app never writes these columns, so a re-upload does not bring an excluded time back.
ALTER TABLE runs ADD COLUMN excluded_at TEXT;
ALTER TABLE runs ADD COLUMN excluded_reason TEXT;
ALTER TABLE runs ADD COLUMN excluded_by TEXT;

-- Where runners write when they are stuck: shown on the race page and in the app.
ALTER TABLE races ADD COLUMN support_email TEXT;

-- Race organizers who asked to hear more, from the /organisateurs page.
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  race TEXT,
  message TEXT,
  locale TEXT NOT NULL DEFAULT 'fr',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  handled_at TEXT
);
