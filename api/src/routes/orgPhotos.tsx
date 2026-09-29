import { Buffer } from 'node:buffer';
import { Hono } from 'hono';
import { z } from 'zod';
import { IMAGE_TYPES, PhotoMomentSchema, can, checkImage, remixPrompt, stripJpegMetadata } from '@sivoov/shared';
import type { PhotoMoment } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { photoQueries } from '../db/photoQueries';
import { newId } from '../lib/crypto';
import { requireCan, requireOrganizer } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { remixDeps, remixEnabled, renderRemix } from '../lib/photos';
import { mediaUrl, storeRaceImage } from '../lib/raceMedia';
import { OrgPhotosPage } from '../pages/org/photos';
import type { MomentForm, TriedPhoto } from '../pages/org/photos';
import { orgPage } from './orgPage';
import type { OrgContext } from './orgPage';

/**
 * The race's photo moments in the admin. Editing them is course content, like the
 * announcements (`edit_audio`); everyone on the team sees them.
 */
export const orgPhotos = new Hono<AppEnv & { Variables: OrgVars }>();

const MomentInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  at: z.string().trim().min(1).max(80),
  ask: z.string().trim().min(1).max(240),
  scene: z.string().trim().min(1).max(1200),
});

const DONE: Record<string, string> = { added: 'Moment ajouté.', saved: 'Moment enregistré.', removed: 'Moment retiré.' };

type PageState = { form?: MomentForm; tried?: TriedPhoto; status?: 200 | 400 | 422 };

const page = async (c: OrgContext, { form, tried, status = 200 }: PageState = {}) => {
  const race = c.get('race');
  const q = photoQueries(c.env.DB);
  const [moments, done, courses] = await Promise.all([q.moments(race.id), q.doneByMoment(race.id), db(c.env.DB).coursesForRace(race.id)]);
  // The longest course names every place a moment can stand on.
  const course = [...courses].sort((a, b) => b.distanceM - a.distanceM)[0];
  const flash = DONE[c.req.query('done') ?? ''];
  return orgPage(
    c,
    'photos',
    'Photos',
    <OrgPhotosPage
      race={race}
      course={course}
      moments={moments}
      done={done}
      canEdit={can(c.get('access'), 'edit_audio')}
      enabled={remixEnabled(remixDeps(c.env))}
      mediaUrl={(key) => mediaUrl(c.env.BASE_URL, key)}
      form={form}
      tried={tried}
      flash={flash}
    />,
    { status },
  );
};

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const files = (v: unknown): File[] => (Array.isArray(v) ? v : [v]).filter((f): f is File => f instanceof File && f.size > 0);

/** The moment from the form, with its new place photos stored; or what to fix. */
const readMoment = async (c: OrgContext, existing: PhotoMoment | null): Promise<{ ok: true; moment: PhotoMoment } | { ok: false; form: MomentForm }> => {
  const race = c.get('race');
  const body = await c.req.parseBody({ all: true });
  const values = { id: existing?.id, title: text(body.title), at: text(body.at), ask: text(body.ask), scene: text(body.scene) };
  const parsed = MomentInputSchema.safeParse(values);
  if (!parsed.success) return { ok: false, form: { ...values, error: 'Il manque un titre, ce que vous demandez ou la scène.' } };
  const sent = files(body.refs).slice(0, 3);
  const stored = await Promise.all(sent.map((f) => storeRaceImage(c.env, race.id, 'hero', f)));
  const bad = stored.find((s) => !s.ok);
  if (bad && !bad.ok) return { ok: false, form: { ...values, error: bad.error === 'too_big' ? 'Une photo dépasse 5 Mo.' : 'Les photos du lieu doivent être en JPEG, PNG ou WebP.' } };
  const refs = stored.flatMap((s) => (s.ok ? [s.key] : []));
  const moments = existing ? [] : await photoQueries(c.env.DB).moments(race.id);
  return {
    ok: true,
    moment: PhotoMomentSchema.parse({
      id: existing?.id ?? newId(),
      raceId: race.id,
      ...parsed.data,
      refs: refs.length > 0 ? refs : (existing?.refs ?? []),
      sort: existing?.sort ?? moments.length,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }),
  };
};

orgPhotos.get('/:slug/photos', requireOrganizer, (c) => page(c));

orgPhotos.post('/:slug/photos', requireOrganizer, requireCan('edit_audio'), async (c) => {
  const read = await readMoment(c, null);
  if (!read.ok) return page(c, { form: read.form, status: 400 });
  await photoQueries(c.env.DB).upsertMoment(read.moment);
  return c.redirect(`/org/${c.get('race').slug}/photos?done=added#m-${read.moment.id}`, 303);
});

orgPhotos.post('/:slug/photos/:id', requireOrganizer, requireCan('edit_audio'), async (c) => {
  const existing = await photoQueries(c.env.DB).moment(c.get('race').id, c.req.param('id'));
  if (!existing) return c.notFound();
  const read = await readMoment(c, existing);
  if (!read.ok) return page(c, { form: read.form, status: 400 });
  await photoQueries(c.env.DB).upsertMoment(read.moment);
  return c.redirect(`/org/${c.get('race').slug}/photos?done=saved#m-${existing.id}`, 303);
});

orgPhotos.post('/:slug/photos/:id/delete', requireOrganizer, requireCan('edit_audio'), async (c) => {
  await photoQueries(c.env.DB).deleteMoment(c.get('race').id, c.req.param('id'));
  return c.redirect(`/org/${c.get('race').slug}/photos?done=removed`, 303);
});

/**
 * The organizer's own photo put into a moment, shown once and kept nowhere: the way to tune the
 * scene before runners see it. Bib 1234.
 */
orgPhotos.post('/:slug/photos/:id/try', requireOrganizer, requireCan('edit_audio'), async (c) => {
  const race = c.get('race');
  const moment = await photoQueries(c.env.DB).moment(race.id, c.req.param('id'));
  if (!moment) return c.notFound();
  const file = files((await c.req.parseBody()).photo)[0];
  const bytes = file ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
  const check = checkImage(bytes, 'selfie');
  if (!check.ok) return page(c, { tried: { momentId: moment.id, error: 'Envoyez une photo en JPEG, PNG ou WebP, 8 Mo au plus.' }, status: 400 });
  const refs = (await Promise.all(moment.refs.map((key) => c.env.FILES.get(key)))).filter((o): o is R2ObjectBody => o !== null);
  const refPictures = await Promise.all(refs.map(async (o) => ({ bytes: new Uint8Array(await o.arrayBuffer()), contentType: o.httpMetadata?.contentType ?? 'image/jpeg' })));
  const prompt = remixPrompt({ raceName: race.theme.displayName, city: race.city, title: moment.title, scene: moment.scene, bib: '1234', refs: refPictures.length, finish: moment.at === 'finish' });
  const rendered = await renderRemix(remixDeps(c.env), prompt, { bytes: stripJpegMetadata(bytes), contentType: IMAGE_TYPES[check.kind].contentType }, refPictures);
  if (!rendered.ok) {
    const error = rendered.reason === 'refused' ? 'Le modèle a refusé cette image. Essayez une autre photo, ou une scène plus simple.' : 'L’image n’a pas pu être créée. Réessayez dans un moment.';
    return page(c, { tried: { momentId: moment.id, error }, status: 422 });
  }
  const dataUrl = `data:${rendered.picture.contentType};base64,${Buffer.from(rendered.picture.bytes).toString('base64')}`;
  return page(c, { tried: { momentId: moment.id, dataUrl } });
});
