-- Photo moments: the places of a race where runners are asked for a selfie, which an image
-- model puts into the race. The organizer's photos of the place are R2 keys in `refs`.
CREATE TABLE photo_moments (
  id TEXT PRIMARY KEY,
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  at TEXT NOT NULL,
  ask TEXT NOT NULL,
  scene TEXT NOT NULL,
  refs TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX photo_moments_race ON photo_moments(race_id, sort);

-- A runner's picture for one moment: their photo (private), the picture made, whether their
-- result page shows it. One row per entrant and moment; trying again replaces the picture.
CREATE TABLE runner_photos (
  id TEXT PRIMARY KEY,
  entrant_id TEXT NOT NULL REFERENCES entrants(id) ON DELETE CASCADE,
  moment_id TEXT NOT NULL,
  selfie_key TEXT NOT NULL,
  status TEXT NOT NULL,
  result_key TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  shown INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (entrant_id, moment_id)
);

-- The app opens a web page already signed in: a one-use code, a few minutes long, for a web session.
CREATE TABLE web_links (
  code_hash TEXT PRIMARY KEY,
  entrant_id TEXT NOT NULL REFERENCES entrants(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
