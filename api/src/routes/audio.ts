import { Hono } from 'hono';
import type { AudioPack } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';

/**
 * Public audio routes: the pack manifest for a course and the files it points at. No auth:
 * the content is the race's, not the runner's, and the app downloads it before the run.
 */
export const audio = new Hono<AppEnv>();

const PACK_PREFIX = 'packs/';

/** Manifest keys are R2 keys (`packs/<course>/<version>/<key>`); the app gets absolute URLs. */
export const withUrls = (pack: AudioPack, baseUrl: string): AudioPack => ({
  ...pack,
  files: Object.fromEntries(
    Object.entries(pack.files).map(([key, file]) => [key, { ...file, url: file.url.startsWith(PACK_PREFIX) ? `${baseUrl}/api/${file.url}` : file.url }]),
  ),
});

audio.get('/courses/:id/pack', async (c) => {
  const pack = await db(c.env.DB).latestAudioPack(c.req.param('id'));
  if (!pack) return c.json({ error: 'not_found' }, 404);
  return c.json(withUrls(pack, c.env.BASE_URL), 200, { 'Cache-Control': 'public, max-age=300' });
});

/** Streams one pack object from R2. Objects are immutable per (course, version): cache for a year. */
audio.get('/packs/:courseId/:version/:key', async (c) => {
  const { courseId, version, key } = c.req.param();
  const object = await c.env.FILES.get(`${PACK_PREFIX}${courseId}/${version}/${key}`);
  if (!object) return c.json({ error: 'not_found' }, 404);
  const contentType = object.httpMetadata?.contentType ?? (key.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream');
  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(object.size),
      ETag: object.httpEtag,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
    },
  });
});
