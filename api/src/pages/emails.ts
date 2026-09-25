import type { Lead, Race } from '@sivoov/shared';
import type { Mail } from '../lib/mailer';

export const codeEmail = ({ to, firstName, race, code }: { to: string; firstName: string; race: Race; code: string }): Mail => ({
  to,
  subject: `${code} · votre code Sivoov Run`,
  text: `Bonjour ${firstName},\n\nVotre code pour ${race.theme.displayName} : ${code}\n\nIl est valable 15 minutes.\n\nSivoov Run`,
  html: `<p>Bonjour ${firstName},</p><p>Votre code pour <strong>${race.theme.displayName}</strong> :</p>
<p style="font-size:34px;letter-spacing:0.3em;font-weight:700">${code}</p><p>Il est valable 15 minutes.</p><p>Sivoov Run</p>`,
});

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

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

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
