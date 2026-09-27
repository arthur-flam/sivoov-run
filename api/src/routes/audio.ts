import { Hono } from 'hono';
import type { AudioPack } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { byteRange, loadReel, reelKey } from '../lib/reel';

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

/**
 * A runner's personal line (lib/personal.ts), by the hash of what it says. Public like the pack:
 * the name is the sha256 of the sentence and the voice, so it cannot be listed or guessed
 * without knowing the sentence. Immutable.
 */
audio.get('/voices/:file', async (c) => {
  const file = c.req.param('file');
  if (!/^[0-9a-f]{64}\.(mp3|wav)$/.test(file)) return c.json({ error: 'invalid' }, 400);
  const object = await c.env.FILES.get(`voices/${file}`);
  if (!object) return c.json({ error: 'not_found' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': file.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
      'Content-Length': String(object.size),
      ETag: object.httpEtag,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
    },
  });
});

/** A course's demo reel: its chapters, then the sound. */
audio.get('/courses/:id/reel', async (c) => {
  const reel = await loadReel(c.env.FILES, c.req.param('id'));
  return reel ? c.json(reel, 200, { 'Cache-Control': 'public, max-age=300' }) : c.json({ error: 'not_found' }, 404);
});

/** The reel's MP3, with byte ranges: Safari will not play (nor seek) an audio file served without them. */
audio.get('/courses/:id/reel.mp3', async (c) => {
  const key = reelKey(c.req.param('id'), 'mp3');
  const head = await c.env.FILES.head(key);
  if (!head) return c.json({ error: 'not_found' }, 404);
  const range = byteRange(c.req.header('Range'), head.size);
  const object = await c.env.FILES.get(key, range ? { range } : undefined);
  if (!object) return c.json({ error: 'not_found' }, 404);
  const headers = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    ETag: head.httpEtag,
    'Cache-Control': 'public, max-age=300',
    'Content-Length': String(range ? range.length : head.size),
    ...(range ? { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}` } : {}),
  };
  return new Response(object.body, { status: range ? 206 : 200, headers });
});
