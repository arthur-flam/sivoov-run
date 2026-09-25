import type { Race } from '@sivoov/shared';
import type { Mail } from '../lib/mailer';

export const codeEmail = ({ to, firstName, race, code }: { to: string; firstName: string; race: Race; code: string }): Mail => ({
  to,
  subject: `${code} · votre code Sivoov Run`,
  text: `Bonjour ${firstName},\n\nVotre code pour ${race.theme.displayName} : ${code}\n\nIl est valable 15 minutes.\n\nSivoov Run`,
  html: `<p>Bonjour ${firstName},</p><p>Votre code pour <strong>${race.theme.displayName}</strong> :</p>
<p style="font-size:34px;letter-spacing:0.3em;font-weight:700">${code}</p><p>Il est valable 15 minutes.</p><p>Sivoov Run</p>`,
});

/** The organizer admin's sign-in code. One code opens every race the address belongs to. */
export const adminCodeEmail = ({ to, code }: { to: string; code: string }): Mail => ({
  to,
  subject: `${code} · votre code organisateur Sivoov Run`,
  text: `Bonjour,\n\nVoici votre code pour entrer dans l’espace organisateur : ${code}\n\nIl est valable 15 minutes. Si vous n’avez rien demandé, ignorez ce message.\n\nSivoov Run`,
  html: `<p>Bonjour,</p><p>Voici votre code pour entrer dans l’espace organisateur :</p>
<p style="font-size:34px;letter-spacing:0.3em;font-weight:700">${code}</p><p>Il est valable 15 minutes. Si vous n’avez rien demandé, ignorez ce message.</p><p>Sivoov Run</p>`,
});
