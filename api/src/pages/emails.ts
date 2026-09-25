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
/**
 * Sent by the organizer from a runner's page: the bib, where to go and how to sign in. Plain
 * enough to be forwarded to someone who has never heard of Sivoov.
 */
export const instructionsEmail = ({ to, firstName, bib, distance, race, raceUrl, window, supportEmail }: {
  to: string; firstName: string; bib: string; distance: string; race: Race; raceUrl: string; window: string; supportEmail?: string;
}): Mail => {
  const name = race.theme.displayName;
  const steps = [
    `Ouvrez la page de la course : ${raceUrl}`,
    `Touchez « Je participe », puis saisissez votre numéro de dossard (${bib}) et cette adresse email.`,
    'Vous recevez un code à 6 chiffres par email : saisissez-le sur la page.',
    'Installez ensuite l’application Sivoov et connectez-vous de la même façon. C’est elle qui vous accompagne pendant la course.',
  ];
  const help = supportEmail ? `Une question ? Écrivez à ${supportEmail}.` : 'Une question ? Contactez l’organisateur de la course.';
  return {
    to,
    subject: `Votre dossard ${bib} · ${name}`,
    text: [
      `Bonjour ${firstName},`,
      `Votre inscription en virtuel est prête.\nCourse : ${name}\nDistance : ${distance}\nDossard : ${bib}`,
      `Vous courez où vous voulez, ${window}.`,
      `Pour vous connecter :\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      help,
      'Bonne course !\nSivoov Run',
    ].join('\n\n'),
    html: `<p>Bonjour ${escapeHtml(firstName)},</p>
<p>Votre inscription en virtuel est prête.<br />Course : <strong>${escapeHtml(name)}</strong><br />Distance : ${escapeHtml(distance)}</p>
<p style="font-size:15px;margin:0">Votre dossard</p><p style="font-size:34px;font-weight:700;margin:0 0 16px">${escapeHtml(bib)}</p>
<p>Vous courez où vous voulez, ${escapeHtml(window)}.</p>
<p><strong>Pour vous connecter</strong></p>
<ol>${steps.map((s) => `<li>${escapeHtml(s).replace(escapeHtml(raceUrl), `<a href="${escapeHtml(raceUrl)}">${escapeHtml(raceUrl)}</a>`)}</li>`).join('')}</ol>
<p>${escapeHtml(help)}</p><p>Bonne course !<br />Sivoov Run</p>`,
  };
};
