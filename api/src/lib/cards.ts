import { CARD_FORMATS } from '@sivoov/shared';
import type { CardFormat, Course } from '@sivoov/shared';
import type { Bindings } from '../env';

/**
 * Share cards as PNG. The card is an HTML page this Worker serves (`/:slug/card`,
 * `/:slug/results/:bib/card`); Cloudflare Browser Rendering photographs it once and the PNG is
 * kept in R2 at `cards/<id>-<format>.png`. One design, written once in Hono JSX, feeds the link
 * previews (og:image) and the image a runner posts. Without the optional token the pages fall
 * back to the course map, and nothing breaks.
 */
/**
 * og: the race report, landscape, what link previews crop to (1.91:1). post: the report as a 4:5
 * portrait that sits in every feed. story: 9:16, a full phone screen (Instagram, WhatsApp
 * status). sticker: the time and the course on a transparent ground, to lay over one's own
 * photo in a story, the way Strava's overlays work.
 */
export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  sticker: { width: 1080, height: 1920 },
};

export const cardFormat = (value: string | undefined): CardFormat => CARD_FORMATS.find((f) => f === value) ?? 'og';

export const cardKey = (id: string, format: CardFormat): string => `cards/${id}-${format}.png`;

export type CardDeps = { files: R2Bucket; accountId?: string; token?: string; fetchImpl?: typeof fetch };

export const cardDeps = (env: Bindings): CardDeps => ({ files: env.FILES, accountId: env.CF_ACCOUNT_ID, token: env.BROWSER_RENDERING_TOKEN });

export const cardsEnabled = (deps: Pick<CardDeps, 'accountId' | 'token'>): boolean => Boolean(deps.accountId && deps.token);

/**
 * The picture under a shared link: the card when this deployment renders cards, else the
 * course map, else nothing (the preview then shows the title alone). URLs are absolute.
 */
export const previewImage = (env: Bindings, cardUrl: string, course: Pick<Course, 'id' | 'geometryKey'> | undefined, base: string): { url: string; width: number; height: number } | undefined => {
  if (cardsEnabled(cardDeps(env)) && course?.geometryKey) return { url: cardUrl, ...CARD_SIZE.og };
  const map = courseMapUrl(env, course);
  return map ? { url: `${base}${map}`, ...CARD_SIZE.og } : undefined;
};

/** The course on a Mapbox picture at link-preview size, when there is a token and a course file. */
export const courseMapUrl = (env: Bindings, course: Pick<Course, 'id' | 'geometryKey'> | undefined): string | null =>
  env.MAPBOX_TOKEN && course?.geometryKey ? `/api/courses/${course.id}/map.png?w=1200&h=630` : null;

/** After a failed render, how long before anyone may try again: a failing renderer is not hammered. */
export const RETRY_AFTER_MS = 10 * 60_000;

/** The PNG for a card, from R2 when it was already taken; null when it cannot be had. */
export const cardPng = async (deps: CardDeps, id: string, format: CardFormat, pageUrl: string, nowMs = Date.now()): Promise<ArrayBuffer | null> => {
  const key = cardKey(id, format);
  const cached = await deps.files.get(key);
  if (cached) return cached.arrayBuffer();
  if (!cardsEnabled(deps)) return null;
  const failed = await deps.files.head(`${key}.failed`);
  if (failed && nowMs - failed.uploaded.getTime() < RETRY_AFTER_MS) return null;
  const call = deps.fetchImpl ?? fetch;
  const res = await call(`https://api.cloudflare.com/client/v4/accounts/${deps.accountId}/browser-rendering/screenshot`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${deps.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: pageUrl,
      viewport: { ...CARD_SIZE[format], deviceScaleFactor: 1 },
      // The fonts come from Google Fonts: wait for the network to settle before the shot.
      gotoOptions: { waitUntil: 'networkidle0', timeout: 20_000 },
      // The sticker keeps its ground transparent: it goes over the runner's own photo.
      screenshotOptions: { type: 'png', omitBackground: format === 'sticker' },
    }),
  }).catch(() => null);
  const type = res?.headers.get('Content-Type') ?? '';
  if (!res?.ok || !type.startsWith('image/')) {
    console.error('card render failed', res?.status, res ? (await res.text().catch(() => '')).slice(0, 200) : 'network');
    await deps.files.put(`${key}.failed`, String(res?.status ?? 'network'));
    return null;
  }
  const png = await res.arrayBuffer();
  await deps.files.put(key, png, { httpMetadata: { contentType: 'image/png' } });
  return png;
};
