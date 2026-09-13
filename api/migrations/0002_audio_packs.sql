-- audio_packs already exists since 0001 (course_id, version, locale, manifest, created_at, UNIQUE(course_id, version, locale)).
-- This adds the lookup index the "latest pack for a course" query uses.
CREATE INDEX IF NOT EXISTS audio_packs_course_version ON audio_packs(course_id, version DESC);
