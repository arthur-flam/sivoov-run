import { LeadSchema } from '@sivoov/shared';
import type { Lead, LeadInput, Locale } from '@sivoov/shared';
import type { Bindings } from '../env';
import { leadNetworks, leadQueries } from '../db/leadQueries';
import { newId, sha256Hex } from './crypto';
import { mailerFor } from './mailer';
import { leadEmail } from '../pages/emails';

/** A public form: one person writing more than this in a day is a script or a stuck button. */
export const MAX_LEADS_PER_EMAIL_PER_DAY = 5;
/** Leads a day from one network (the sender's IP address): a script that changes the email each time stops here. */
export const MAX_LEADS_PER_NETWORK_PER_DAY = 3;
/**
 * Staff are emailed about this many leads an hour at most. Past it the leads are still stored
 * (they show in /org/leads) but send nothing: the Email Sending quota is the sign-in codes' first.
 */
export const MAX_LEAD_EMAILS_PER_HOUR = 20;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type LeadResult = { ok: true; lead: Lead } | { ok: false; error: 'too_many_requests' };

const TOO_MANY: LeadResult = { ok: false, error: 'too_many_requests' };

/** The STAFF_EMAILS var, comma-separated: who hears about a new lead. */
export const staffEmails = (env: Bindings): string[] =>
  (env.STAFF_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));

/**
 * Stores the lead, then tells every staff address in the background via `defer`. `ip` is the
 * sender's address (`CF-Connecting-IP`); without one, as in local dev, only the email limit applies.
 */
export const submitLead = async (env: Bindings, input: LeadInput, locale: Locale, defer: (p: Promise<unknown>) => void, ip?: string): Promise<LeadResult> => {
  const q = leadQueries(env.DB);
  const now = new Date();
  if ((await q.countFromEmailSince(input.email, new Date(now.getTime() - DAY_MS).toISOString())) >= MAX_LEADS_PER_EMAIL_PER_DAY) return TOO_MANY;
  const lead = LeadSchema.parse({ ...input, id: newId(), locale, createdAt: now.toISOString() });
  const networks = leadNetworks(env.FILES);
  if (ip && !(await networks.admit(await sha256Hex(ip), lead.id, now, MAX_LEADS_PER_NETWORK_PER_DAY))) return TOO_MANY;
  await q.insert(lead);
  if (ip) defer(networks.forgetOld(now));
  // Counted after the insert, this lead included: of leads stored at the same moment, only the first ones are emailed.
  const lastHour = await q.countSince(new Date(now.getTime() - HOUR_MS).toISOString());
  if (lastHour > MAX_LEAD_EMAILS_PER_HOUR) {
    console.log(`[leads] ${lastHour} leads in the last hour: ${lead.id} stored, staff not emailed`);
    return { ok: true, lead };
  }
  const mailer = mailerFor(env);
  defer(Promise.all(staffEmails(env).map((to) => mailer.send(leadEmail({ to, lead })))));
  return { ok: true, lead };
};
