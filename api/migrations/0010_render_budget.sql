-- The pictures the image model made for a runner today (PHOTOS_PER_DAY in shared): the day
-- (UTC, YYYY-MM-DD) and the count. On the entry, not on the photo: deleting a photo (or
-- « Supprimer mes données ») never gives a picture back.
ALTER TABLE entrants ADD COLUMN photo_day TEXT;
ALTER TABLE entrants ADD COLUMN photo_renders INTEGER NOT NULL DEFAULT 0;

-- Sign-in looks a runner up by email alone (every race), and the dashboard and the runner list
-- join sessions on the entrant: both scanned whole tables.
CREATE INDEX IF NOT EXISTS entrants_email ON entrants(email);
CREATE INDEX IF NOT EXISTS sessions_entrant ON sessions(entrant_id);
