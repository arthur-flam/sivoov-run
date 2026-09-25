import { LeadSchema } from '@sivoov/shared';
import type { Lead, LeadInput, Locale } from '@sivoov/shared';
import type { Bindings } from '../env';
import { leadQueries } from '../db/leadQueries';
import { newId } from './crypto';
import { mailerFor } from './mailer';
import { leadEmail } from '../pages/emails';

/** A public form: one person writing more than this in a day is a script or a stuck button. */
export const MAX_LEADS_PER_EMAIL_PER_DAY = 5;

export type LeadResult = { ok: true; lead: Lead } | { ok: false; error: 'too_many_requests' };

/** The STAFF_EMAILS var, comma-separated: who hears about a new lead. */
export const staffEmails = (env: Bindings): string[] =>
  (env.STAFF_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));

/** Stores the lead, then tells every staff address in the background via `defer`. */
export const submitLead = async (env: Bindings, input: LeadInput, locale: Locale, defer: (p: Promise<unknown>) => void): Promise<LeadResult> => {
  const q = leadQueries(env.DB);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if ((await q.countFromEmailSince(input.email, since)) >= MAX_LEADS_PER_EMAIL_PER_DAY) return { ok: false, error: 'too_many_requests' };
  const lead = LeadSchema.parse({ ...input, id: newId(), locale, createdAt: new Date().toISOString() });
  await q.insert(lead);
  const mailer = mailerFor(env);
  defer(Promise.all(staffEmails(env).map((to) => mailer.send(leadEmail({ to, lead })))));
  return { ok: true, lead };
};
