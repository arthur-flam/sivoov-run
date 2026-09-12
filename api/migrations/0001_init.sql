-- Domain model v1 (docs/ARCHITECTURE.md). JSON columns hold zod-validated documents.
CREATE TABLE races (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'FR',
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  organizer_url TEXT,
  theme TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  race_id TEXT NOT NULL REFERENCES races(id),
  distance_key TEXT NOT NULL,
  distance_m REAL NOT NULL,
  geometry_key TEXT,
  landmarks TEXT NOT NULL DEFAULT '[]',
  UNIQUE (race_id, distance_key)
);

CREATE TABLE entrants (
  id TEXT PRIMARY KEY,
  race_id TEXT NOT NULL REFERENCES races(id),
  bib TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  distance_key TEXT NOT NULL,
  address TEXT,
  source TEXT NOT NULL DEFAULT 'import',
  slot_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (race_id, bib)
);
CREATE INDEX entrants_race_email ON entrants(race_id, email);

-- Magic codes: one active per entrant, hashed, few attempts, short life.
CREATE TABLE auth_codes (
  id TEXT PRIMARY KEY,
  entrant_id TEXT NOT NULL REFERENCES entrants(id),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX auth_codes_entrant ON auth_codes(entrant_id, created_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  entrant_id TEXT NOT NULL REFERENCES entrants(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  entrant_id TEXT NOT NULL REFERENCES entrants(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  distance_m REAL NOT NULL DEFAULT 0,
  splits TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  device TEXT,
  trace_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX runs_entrant ON runs(entrant_id, created_at);
CREATE INDEX runs_course_status ON runs(course_id, status, elapsed_ms);

CREATE TABLE audio_packs (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  version INTEGER NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fr',
  manifest TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (course_id, version, locale)
);

CREATE TABLE organizers (
  id TEXT PRIMARY KEY,
  race_id TEXT NOT NULL REFERENCES races(id),
  email TEXT NOT NULL,
  UNIQUE (race_id, email)
);
