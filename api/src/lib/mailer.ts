import type { Bindings } from '../env';

export type Mail = { to: string; subject: string; text: string; html?: string };

/** One method. Resend in production, the console in dev and tests. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export const consoleMailer = (log: (line: string) => void = console.log): Mailer => ({
  async send(mail) {
    log(`[mail] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}`);
  },
});

export const resendMailer = (apiKey: string, from: string): Mailer => ({
  async send(mail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
  },
});

export const mailerFor = (env: Bindings): Mailer =>
  env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY, env.EMAIL_FROM ?? 'Sivoov Run <run@sivoov.app>') : consoleMailer();
