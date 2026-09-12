import type { Race } from '@sivoov/shared';
import type { Mail } from '../lib/mailer';

export const codeEmail = ({ to, firstName, race, code }: { to: string; firstName: string; race: Race; code: string }): Mail => ({
  to,
  subject: `${code} · votre code Sivoov Run`,
  text: `Bonjour ${firstName},\n\nVotre code pour ${race.theme.displayName} : ${code}\n\nIl est valable 15 minutes.\n\nSivoov Run`,
  html: `<p>Bonjour ${firstName},</p><p>Votre code pour <strong>${race.theme.displayName}</strong> :</p>
<p style="font-size:34px;letter-spacing:0.3em;font-weight:700">${code}</p><p>Il est valable 15 minutes.</p><p>Sivoov Run</p>`,
});
