import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { MEDIA_KEY_RE, contentTypeForKey } from '../lib/raceMedia';

/**
 * Public pictures of the races (logos, header photos), straight from R2. Only keys under
 * `races/` are served; anything else in the bucket (traces, geometry, audio) is a 404 here.
 * Keys are content-addressed, so a response never changes and is cached for a year.
 */
export const media = new Hono<AppEnv>();

media.get('/*', async (c) => {
  const key = c.req.path.replace(/^\/media\//, '');
  const contentType = contentTypeForKey(key);
  if (!MEDIA_KEY_RE.test(key) || !contentType) return c.notFound();
  const object = await c.env.FILES.get(key);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ETag: object.httpEtag,
    },
  });
});
