import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Locale, Race } from '@sivoov/shared';
import { distanceLabel, formatOfficialTime, translator } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { cardDeps, cardFormat, cardPng, cardsEnabled, previewImage } from '../lib/cards';
import type { CardFormat } from '../lib/cards';
import { fullName, raceCardId, resultForBib, runCardId, runnerCardFor, shortName } from '../lib/results';
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

const png = (body: ArrayBuffer, maxAge: number) =>
  new Response(body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${maxAge}${maxAge > 86400 ? ', immutable' : ''}` } });

/**
 * A runner's card URL names the card it shows (`v`): the bib card before the finish, then each
 * finish its own, so no cache, browser or link preview ever holds an old picture under it.
 */
const runnerCardUrl = (page: string, format: CardFormat, locale: Locale, id: string): string =>
  `${page}/card.png?format=${format}&lang=${locale}&v=${encodeURIComponent(id)}`;

/** When a card cannot be had, a link preview still gets a picture: the course map. */
const mapOr404 = (c: Context<AppEnv>, courseId: string | undefined): Response | Promise<Response> =>
  c.env.MAPBOX_TOKEN && courseId ? c.redirect(`/api/courses/${courseId}/map.png?w=1200&h=630`, 302) : c.notFound();

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
  const deps = cardDeps(c.env);
  const card = runnerCardFor(race, result, locale, Date.now());
  // A link preview fetches the page, then its image: start a finisher's photograph now, not
  // then. Bib cards are only taken when their URL is asked for, so a script walking the bibs
  // costs nothing.
  if (card && result.best && cardsEnabled(deps)) c.executionCtx.waitUntil(cardPng(deps, card.id, 'og', `${page}/card?format=og&lang=${locale}`).catch(() => null));
  const title = result.best
    ? `${fullName(result.entrant)} · ${formatOfficialTime(result.best.run.elapsedMs)} · ${race.theme.displayName}`
    : t('result.bib.title', { firstName: shortName(result.entrant), race: race.theme.displayName });
  const og: OpenGraph = {
    title,
    description: t('result.og.description', { distance: distanceLabel(locale, result.entrant.distanceKey) }),
    url: page,
    image: previewImage(c.env, card ? runnerCardUrl(page, 'og', locale, card.id) : `${base}/${race.slug}/og.png?lang=${locale}`, result.course.id, base),
  };
  return c.html(
    <Layout title={title} locale={locale} race={race} path={`/${race.slug}/results/${result.entrant.bib}`} og={og}>
      <ResultPage race={race} result={result} track={await trackFor(c.env, result.course)} locale={locale} now={Date.now()} shareUrl={page} storyCardUrl={card && cardsEnabled(deps) ? runnerCardUrl(page, 'story', locale, card.id) : null} />
    </Layout>,
  );
});

/** The runner's card as a page: what Browser Rendering photographs. */
results.get('/:slug/results/:bib/card', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  const result = race ? await resultForBib(q, race, c.req.param('bib')) : null;
  const card = race && result ? runnerCardFor(race, result, locale, Date.now()) : null;
  const track = result ? await trackFor(c.env, result.course) : null;
  if (!race || !card || !track) return c.notFound();
  return c.html(<ShareCard race={race} track={track} format={cardFormat(c.req.query('format'))} locale={locale} host={new URL(c.req.url).host} runner={card.card} subtitle="" />);
});

results.get('/:slug/results/:bib/card.png', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  const result = race ? await resultForBib(q, race, c.req.param('bib')) : null;
  const card = race && result ? runnerCardFor(race, result, locale, Date.now()) : null;
  if (!race || !result || !card) return c.notFound();
  const format = cardFormat(c.req.query('format'));
  const page = `${origin(c)}/${race.slug}/results/${result.entrant.bib}`;
  // An old URL (the bib card, a slower run) moves on to the current card.
  if (c.req.query('v') !== card.id) return c.redirect(runnerCardUrl(page, format, locale, card.id), 302);
  const body = await cardPng(cardDeps(c.env), card.id, format, `${page}/card?format=${format}&lang=${locale}`);
  if (body) return png(body, 31_536_000);
  // The portrait card has no stand-in: the share button then shares the link alone.
  return format === 'og' ? mapOr404(c, result.course.id) : c.notFound();
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
  return body ? png(body, 86_400) : mapOr404(c, (await db(c.env.DB).coursesForRace(race.id))[0]?.id);
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
