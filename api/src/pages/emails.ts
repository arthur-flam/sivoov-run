import { distanceLabel, translator } from '@sivoov/shared';
import type { DistanceKey, Lead, Locale, Race } from '@sivoov/shared';
import { fmtSpan } from './dates';
import type { Mail } from '../lib/mailer';

/** Anything a person typed, made safe to drop into an email's HTML. */
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The runner's sign-in code, in the language of the screen that asked for it (`codeEmailLocale`). */
export const codeEmail = ({ to, firstName, race, code, locale }: { to: string; firstName: string; race: Race; code: string; locale: Locale }): Mail => {
  const tr = translator(locale);
  const name = race.theme.displayName;
  return {
    to,
    subject: tr('email.code.subject', { code }),
    text: `${tr('email.hello', { firstName })}\n\n${tr('email.code.for', { race: name })} ${code}\n\n${tr('email.code.valid')}\n\nSivoov Run`,
    html: `<p>${tr('email.hello', { firstName: escapeHtml(firstName) })}</p><p>${tr('email.code.for', { race: `<strong>${escapeHtml(name)}</strong>` })}</p>
<p style="font-size:34px;letter-spacing:0.3em;font-weight:700">${code}</p><p>${tr('email.code.valid')}</p><p>Sivoov Run</p>`,
  };
};

/**
 * To Sivoov staff when a race organizer writes from /organisateurs. Plain text only: every field
 * comes from a public form, and text cannot inject markup into anyone's mail client.
 */
export const leadEmail = ({ to, lead }: { to: string; lead: Lead }): Mail => ({
  to,
  subject: `Nouvelle demande organisateur · ${lead.race}`,
  text: [
    'Une demande est arrivée depuis la page organisateurs.',
    '',
    `Nom : ${lead.name}`,
    `Email : ${lead.email}`,
    `Course : ${lead.race}`,
    `Langue : ${lead.locale === 'fr' ? 'français' : 'anglais'}`,
    ...(lead.message ? ['', 'Message :', lead.message] : []),
    '',
    `Répondez directement à ${lead.email}.`,
  ].join('\n'),
});

/** The organizer admin's sign-in code. One code opens every race the address belongs to. */
export const adminCodeEmail = ({ to, code }: { to: string; code: string }): Mail => ({
  to,
  subject: `${code} · votre code organisateur Sivoov Run`,
  text: `Bonjour,\n\nVoici votre code pour entrer dans l’espace organisateur : ${code}\n\nIl est valable 15 minutes. Si vous n’avez rien demandé, ignorez ce message.\n\nSivoov Run`,
  html: `<p>Bonjour,</p><p>Voici votre code pour entrer dans l’espace organisateur :</p>
<p style="font-size:34px;letter-spacing:0.3em;font-weight:700">${code}</p><p>Il est valable 15 minutes. Si vous n’avez rien demandé, ignorez ce message.</p><p>Sivoov Run</p>`,
});

export type TeamInvite = { to: string; name?: string; inviter: string; race: Race; roleLabel: string; roleHint: string; signinUrl: string };

/**
 * An invitation to a race's team: who invited them, to which race, what their role lets them do,
 * and how to get in (their email and a code, no password).
 */
export const teamInviteEmail = ({ to, name, inviter, race, roleLabel, roleHint, signinUrl }: TeamInvite): Mail => {
  const raceName = race.theme.displayName;
  return {
    to,
    subject: `${inviter} vous invite sur ${raceName}`,
    text: [
      `Bonjour${name ? ` ${name}` : ''},`,
      `${inviter} vous invite dans l’équipe de ${raceName} sur Sivoov Run, avec le rôle ${roleLabel}.`,
      `Ce rôle vous permet : ${roleHint}`,
      `Pour entrer, ouvrez ${signinUrl} et saisissez votre adresse (${to}). Vous recevrez un code à 6 chiffres. Il n’y a pas de mot de passe.`,
      'Sivoov Run',
    ].join('\n\n'),
    html: `<p>Bonjour${name ? ` ${escapeHtml(name)}` : ''},</p>
<p>${escapeHtml(inviter)} vous invite dans l’équipe de <strong>${escapeHtml(raceName)}</strong> sur Sivoov Run, avec le rôle <strong>${escapeHtml(roleLabel)}</strong>.</p>
<p>Ce rôle vous permet : ${escapeHtml(roleHint)}</p>
<p><a href="${escapeHtml(signinUrl)}">Entrer dans l’espace organisateur</a></p>
<p>Saisissez votre adresse (${escapeHtml(to)}). Vous recevrez un code à 6 chiffres. Il n’y a pas de mot de passe.</p>
<p>Sivoov Run</p>`,
  };
};

/**
 * Sent by the organizer from a runner's page: the bib, where to go and how to sign in, in the
 * runner's language (`runnerLocale`), the race page's link included. Plain enough to be
 * forwarded to someone who has never heard of Sivoov.
 */
export const instructionsEmail = ({ to, firstName, bib, distanceKey, race, origin, locale }: {
  to: string; firstName: string; bib: string; distanceKey: DistanceKey; race: Race; origin: string; locale: Locale;
}): Mail => {
  const tr = translator(locale);
  const name = race.theme.displayName;
  const raceUrl = `${origin}/${race.slug}${locale === 'fr' ? '' : `?lang=${locale}`}`;
  const distance = distanceLabel(locale, distanceKey);
  const steps = [
    tr('email.instructions.step1', { url: raceUrl }),
    tr('email.instructions.step2', { cta: tr('landing.cta'), bib }),
    tr('email.instructions.step3'),
    tr('email.instructions.step4'),
  ];
  const help = race.supportEmail ? tr('email.instructions.help', { email: race.supportEmail }) : tr('email.instructions.helpOrganizer');
  const window = tr('email.instructions.window', fmtSpan(race.windowStart, race.windowEnd, locale, race.timezone));
  return {
    to,
    subject: tr('email.instructions.subject', { bib, race: name }),
    text: [
      tr('email.hello', { firstName }),
      [tr('email.instructions.ready'), tr('email.instructions.race', { race: name }), tr('email.instructions.distance', { distance }), tr('email.instructions.bib', { bib })].join('\n'),
      window,
      `${tr('email.instructions.howTo')}\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      help,
      `${tr('email.instructions.signoff')}\nSivoov Run`,
    ].join('\n\n'),
    html: `<p>${tr('email.hello', { firstName: escapeHtml(firstName) })}</p>
<p>${tr('email.instructions.ready')}<br />${tr('email.instructions.race', { race: `<strong>${escapeHtml(name)}</strong>` })}<br />${tr('email.instructions.distance', { distance: escapeHtml(distance) })}</p>
<p style="font-size:15px;margin:0">${tr('email.instructions.yourBib')}</p><p style="font-size:34px;font-weight:700;margin:0 0 16px">${escapeHtml(bib)}</p>
<p>${escapeHtml(window)}</p>
<p><strong>${tr('email.instructions.howTo')}</strong></p>
<ol>${steps.map((s) => `<li>${escapeHtml(s).replace(escapeHtml(raceUrl), `<a href="${escapeHtml(raceUrl)}">${escapeHtml(raceUrl)}</a>`)}</li>`).join('')}</ol>
<p>${escapeHtml(help)}</p><p>${tr('email.instructions.signoff')}<br />Sivoov Run</p>`,
  };
};
