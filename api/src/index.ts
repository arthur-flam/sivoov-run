import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppEnv } from './env';
import { api } from './routes/api';
import { audio } from './routes/audio';
import { media } from './routes/media';
import { pages } from './routes/pages';
import { results } from './routes/results';
import { org } from './routes/org';
import { organizers } from './routes/organizers';
import { upload } from './routes/upload';

const app = new Hono<AppEnv>();

app.use('*', logger());
// The app's web target and the organizer's embeds call the JSON API from other origins.
app.use('/api/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type', 'X-Sivoov-Client'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.route('/api', api);
app.route('/api', audio);
// Organizer admin is mounted before the pages so that /org/:slug is not taken for a race slug.
app.route('/org', org);
// Before the pages too, like /org: nothing in them may claim /:slug/results, /:slug/upload
// or /organisateurs first (it would be read as a race slug).
app.route('/', results);
app.route('/', upload);
app.route('/', organizers);
app.route('/media', media);
app.route('/', pages);

app.notFound((c) => (c.req.path.startsWith('/api') ? c.json({ error: 'not_found' }, 404) : c.text('Page introuvable', 404)));
app.onError((err, c) => {
  console.error(err);
  return c.req.path.startsWith('/api') ? c.json({ error: 'internal' }, 500) : c.text('Une erreur est survenue.', 500);
});

export default app;
