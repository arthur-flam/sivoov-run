-- How many pictures the image model made for a runner, all moments together. It lives on the
-- entry, not on the photo: deleting a photo (or « Supprimer mes données ») never gives the
-- paid tries back.
ALTER TABLE entrants ADD COLUMN photo_renders INTEGER NOT NULL DEFAULT 0;

-- Sign-in looks a runner up by email alone (every race), and the dashboard and the runner list
-- join sessions on the entrant: both scanned whole tables.
CREATE INDEX IF NOT EXISTS entrants_email ON entrants(email);
CREATE INDEX IF NOT EXISTS sessions_entrant ON sessions(entrant_id);
