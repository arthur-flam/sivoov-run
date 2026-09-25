import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Locale, Race } from '@sivoov/shared';
import { distanceLabel, formatOfficialTime, translator } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { cardDeps, cardFormat, cardPng, cardsEnabled, previewImage } from '../lib/cards';
import type { CardFormat } from '../lib/cards';
import { cardRunner, fullName, raceCardId, resultForBib, runCardId } from '../lib/results';
import { ShareCard } from '../pages/card';
import { fmtDate } from '../pages/dates';
import { Layout } from '../pages/layout';
import type { OpenGraph } from '../pages/layout';
import { ResultPage } from '../pages/result';
import { ResultsPage } from '../pages/results';
import { localeOf, trackFor } from './pages';

/** Results, a runner's certificate, and the share cards behind every link preview. */
export const results = new Hono<AppEnv>();

const origin = (c: Context<AppEnv>): string => new URL(c.req.url).origin;

/** "9 → 15 novembre · Marathon · Semi-marathon": what the race card says under its title. */
const raceSubtitle = (race: Race, keys: Array<'marathon' | 'half' | '10k' | '5k'>, locale: Locale): string =>
  [`${fmtDate(race.windowStart, locale, race.timezone, { day: 'numeric' })} → ${fmtDate(race.windowEnd, locale, race.timezone)}`, ...keys.map((k) => distanceLabel(locale, k))].join(' · ');

const png = (body: ArrayBuffer) => new Response(body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });

results.get('/:slug/results', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const courses = await q.coursesForRace(race.id);
  const course = courses.find((x) => x.distanceKey === c.req.query('distance')) ?? courses[0];
  if (!course) return c.notFound();
  const rows = await q.resultsForCourse(course.id);
  return c.html(
    <Layout title={`${locale === 'fr' ? 'Résultats' : 'Results'} · ${race.theme.displayName}`} locale={locale} race={race} path={`/${race.slug}/results`}>
      <ResultsPage race={race} course={course} courses={courses} rows={rows} locale={locale} />
    </Layout>,
  );
});

results.get('/:slug/results/:bib', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  const result = race ? await resultForBib(q, race, c.req.param('bib')) : null;
  if (!race || !result) return c.notFound();
  const t = translator(locale);
  const base = origin(c);
  const page = `${base}/${race.slug}/results/${result.entrant.bib}`;
  const cards = cardsEnabled(cardDeps(c.env));
  const time = result.best ? formatOfficialTime(result.best.run.elapsedMs) : null;
  const title = time ? `${fullName(result.entrant)} · ${time} · ${race.theme.displayName}` : `${fullName(result.entrant)} · ${race.theme.displayName}`;
  const og: OpenGraph = {
    title,
    description: t('result.og.description', { distance: distanceLabel(locale, result.entrant.distanceKey) }),
    url: page,
    image: result.best ? previewImage(c.env, `${page}/card.png?format=og&lang=${locale}`, result.course.id, base) : previewImage(c.env, `${base}/${race.slug}/og.png?lang=${locale}`, result.course.id, base),
  };
  return c.html(
    <Layout title={title} locale={locale} race={race} path={`/${race.slug}/results/${result.entrant.bib}`} og={og}>
      <ResultPage race={race} result={result} track={await trackFor(c.env, result.course)} locale={locale} shareUrl={page} storyCardUrl={result.best && cards ? `${page}/card.png?format=story&lang=${locale}` : null} />
    </Layout>,
  );
});

/** The runner's card as a page: what Browser Rendering photographs. */
results.get('/:slug/results/:bib/card', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  const result = race ? await resultForBib(q, race, c.req.param('bib')) : null;
  const track = result ? await trackFor(c.env, result.course) : null;
  if (!race || !result?.best || !track) return c.notFound();
  return c.html(
    <ShareCard race={race} track={track} format={cardFormat(c.req.query('format'))} locale={locale} host={new URL(c.req.url).host} runner={cardRunner(race, result.entrant, result.best.run, locale)} subtitle="" />,
  );
});

results.get('/:slug/results/:bib/card.png', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  const result = race ? await resultForBib(q, race, c.req.param('bib')) : null;
  if (!race || !result?.best) return c.notFound();
  const format = cardFormat(c.req.query('format'));
  const page = `${origin(c)}/${race.slug}/results/${result.entrant.bib}/card?format=${format}&lang=${locale}`;
  const body = await cardPng(cardDeps(c.env), runCardId(result.best.run, locale), format, page);
  return body ? png(body) : c.notFound();
});

/** The race's own card: the landing page's link preview. */
results.get('/:slug/card', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  const courses = race ? await q.coursesForRace(race.id) : [];
  const track = race ? await trackFor(c.env, courses[0]) : null;
  if (!race || !track) return c.notFound();
  const subtitle = raceSubtitle(race, courses.map((x) => x.distanceKey), locale);
  return c.html(<ShareCard race={race} track={track} format={cardFormat(c.req.query('format'))} locale={locale} host={new URL(c.req.url).host} subtitle={subtitle} />);
});

results.get('/:slug/og.png', async (c) => {
  const locale = localeOf(c);
  const race = await db(c.env.DB).raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const body = await cardPng(cardDeps(c.env), raceCardId(race, locale), 'og', `${origin(c)}/${race.slug}/card?format=og&lang=${locale}`);
  return body ? png(body) : c.notFound();
});

/**
 * Takes a finisher's cards right after the result lands, so the first person to open the
 * shared link sees the picture instead of waiting on a browser. Fire and forget.
 */
export const prewarmCards = async (env: AppEnv['Bindings'], base: string, race: Race, bib: string): Promise<void> => {
  const deps = cardDeps(env);
  if (!cardsEnabled(deps)) return;
  const result = await resultForBib(db(env.DB), race, bib);
  if (!result?.best) return;
  const run = result.best.run;
  const formats: CardFormat[] = ['og', 'story'];
  await Promise.all(formats.map((f) => cardPng(deps, runCardId(run, 'fr'), f, `${base}/${race.slug}/results/${bib}/card?format=${f}&lang=fr`)));
};
