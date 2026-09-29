-- The runner's language (the app and the emails): their own choice, or the race's when they
-- have not made one. French unless the organizer says otherwise.
ALTER TABLE races ADD COLUMN default_locale TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE entrants ADD COLUMN locale TEXT;
