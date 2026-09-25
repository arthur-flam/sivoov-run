import { Hono } from 'hono';
import type { Context } from 'hono';
import { LeadInputSchema, t } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { Layout, ORGANIZERS_PATH } from '../pages/layout';
import { OrganizersPage } from '../pages/organizers/page';
import { LEAD_FIELDS } from '../pages/organizers/leadForm';
import type { LeadField, LeadFormState } from '../pages/organizers/leadForm';
import { submitLead } from '../lib/leads';
import { localeOf } from './locale';

/** The page for race directors and its contact form. Mounted before the pages, or /:slug takes it. */
export const organizers = new Hono<AppEnv>();

const render = (c: Context<AppEnv>, locale: Locale, form: LeadFormState, status: 200 | 400 | 429 = 200) =>
  c.html(
    <Layout title={`${t(locale, 'organizers.meta.title')} · Sivoov Run`} description={t(locale, 'organizers.meta.description')} locale={locale} path={ORGANIZERS_PATH}>
      <OrganizersPage locale={locale} form={form} />
    </Layout>,
    status,
  );

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const isField = (key: unknown): key is LeadField => LEAD_FIELDS.some((f) => f === key);

organizers.get(ORGANIZERS_PATH, (c) => render(c, localeOf(c), { step: 'form', values: {}, errors: [] }));

/** The address an English speaker would guess. The page is one page in two languages. */
organizers.get('/organizers', (c) => c.redirect(`${ORGANIZERS_PATH}?lang=en`, 301));

/** Plain form post: stored and sent to staff, or the form comes back with what was typed. */
organizers.post(ORGANIZERS_PATH, async (c) => {
  const locale = localeOf(c);
  const body = await c.req.parseBody();
  const values = Object.fromEntries(LEAD_FIELDS.map((f) => [f, text(body[f])])) as Record<LeadField, string>;
  // The hidden field only bots fill in: thank them, keep nothing, tell no one.
  if (text(body.website)) return render(c, locale, { step: 'sent', name: values.name });
  const parsed = LeadInputSchema.safeParse(values);
  if (!parsed.success) {
    const errors = [...new Set(parsed.error.issues.map((i) => i.path[0]).filter(isField))];
    return render(c, locale, { step: 'form', values, errors }, 400);
  }
  const result = await submitLead(c.env, parsed.data, locale, (p) => c.executionCtx.waitUntil(p));
  if (!result.ok) return render(c, locale, { step: 'form', values, errors: [], tooMany: true }, 429);
  return render(c, locale, { step: 'sent', name: result.lead.name });
});
