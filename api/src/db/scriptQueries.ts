import { z } from 'zod';
import { AudioPackSchema, AudioScriptSchema } from '@sivoov/shared';
import type { AudioScript } from '@sivoov/shared';

export type ScriptDraft = { script: AudioScript; version: number; updatedAt: string };
/** What the courses page shows about a published pack, without loading every manifest twice. */
export type PackSummary = { version: number; locale: string; files: number; bytes: number; createdAt: string };

const DraftRowSchema = z.object({ version: z.number(), script: z.string(), updated_at: z.string() });
const PackRowSchema = z.object({ version: z.number(), locale: z.string(), manifest: z.string(), created_at: z.string() });

/**
 * The studio's reads and writes: the script draft per (course, locale) and the packs already
 * published. The draft's `version` is the version the next publish produces.
 */
export const scriptDb = (d1: D1Database) => ({
  async draft(courseId: string, locale = 'fr'): Promise<ScriptDraft | null> {
    const row = await d1.prepare('SELECT version, script, updated_at FROM audio_scripts WHERE course_id = ? AND locale = ?').bind(courseId, locale).first();
    if (!row) return null;
    const r = DraftRowSchema.parse(row);
    const script = AudioScriptSchema.parse({ ...JSON.parse(r.script), courseId, locale, version: r.version });
    return { script, version: r.version, updatedAt: r.updated_at };
  },

  /** Upsert on (course, locale): the studio saves the whole draft every time. */
  async saveDraft(script: AudioScript): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO audio_scripts (course_id, locale, version, script, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(course_id, locale) DO UPDATE SET version=excluded.version, script=excluded.script, updated_at=excluded.updated_at`,
      )
      .bind(script.courseId, script.locale, script.version, JSON.stringify(script), new Date().toISOString())
      .run();
  },

  /** Seeding only: never overwrite an organizer's draft with the fixture. */
  async seedDraft(script: AudioScript): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO audio_scripts (course_id, locale, version, script, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(course_id, locale) DO NOTHING`,
      )
      .bind(script.courseId, script.locale, script.version, JSON.stringify(script), new Date().toISOString())
      .run();
  },

  async packs(courseId: string): Promise<PackSummary[]> {
    const { results } = await d1.prepare('SELECT version, locale, manifest, created_at FROM audio_packs WHERE course_id = ? ORDER BY version DESC').bind(courseId).all();
    return results.map((row) => {
      const r = PackRowSchema.parse(row);
      const pack = AudioPackSchema.parse({ ...JSON.parse(r.manifest), courseId, version: r.version, locale: r.locale });
      const files = Object.values(pack.files);
      return { version: r.version, locale: r.locale, files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), createdAt: r.created_at };
    });
  },

  async latestPackVersion(courseId: string, locale = 'fr'): Promise<number> {
    const row = await d1.prepare('SELECT MAX(version) AS v FROM audio_packs WHERE course_id = ? AND locale = ?').bind(courseId, locale).first<{ v: number | null }>();
    return row?.v ?? 0;
  },
});

export type ScriptDb = ReturnType<typeof scriptDb>;
