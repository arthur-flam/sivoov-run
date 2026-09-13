-- The audio script an organizer edits in the studio: one draft per (course, locale).
-- `version` is the version the next publish will produce; publishing writes audio_packs at
-- that version (immutable, cached for a year) and bumps the draft to version + 1.
CREATE TABLE audio_scripts (
  course_id TEXT NOT NULL REFERENCES courses(id),
  locale TEXT NOT NULL DEFAULT 'fr',
  version INTEGER NOT NULL DEFAULT 1,
  script TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (course_id, locale)
);
