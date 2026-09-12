import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppEnv } from './env';
import { api } from './routes/api';
import { pages } from './routes/pages';

const app = new Hono<AppEnv>();

app.use('*', logger());
// The app's web target and the organizer's embeds call the JSON API from other origins.
app.use('/api/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.route('/api', api);
app.route('/', pages);

app.notFound((c) => (c.req.path.startsWith('/api') ? c.json({ error: 'not_found' }, 404) : c.text('Page introuvable', 404)));
app.onError((err, c) => {
  console.error(err);
  return c.req.path.startsWith('/api') ? c.json({ error: 'internal' }, 500) : c.text('Une erreur est survenue.', 500);
});

export default app;
