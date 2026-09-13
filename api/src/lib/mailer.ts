import type { Bindings } from '../env';

export type Mail = { to: string; subject: string; text: string; html?: string };

/** One method. Cloudflare Email Sending when the binding is there, the console in dev and tests. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export const consoleMailer = (log: (line: string) => void = console.log): Mailer => ({
  async send(mail) {
    log(`[mail] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}`);
  },
});

/** `from` must be on a zone onboarded to Email Sending (sivoov.app is). */
export const cloudflareMailer = (email: SendEmail, from: { email: string; name: string }): Mailer => ({
  async send(mail) {
    await email.send({ to: mail.to, from, subject: mail.subject, text: mail.text, html: mail.html });
  },
});

export const DEFAULT_FROM = { email: 'run@sivoov.app', name: 'Sivoov Run' };

/** "Name <address>" or a bare address -> the binding's shape. */
export const parseFrom = (value: string): { email: string; name: string } => {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const email = m?.[2];
  return email ? { name: m?.[1] || DEFAULT_FROM.name, email } : { name: DEFAULT_FROM.name, email: value.trim() };
};

export const mailerFor = (env: Bindings): Mailer =>
  env.EMAIL && env.ENVIRONMENT !== 'local' ? cloudflareMailer(env.EMAIL, env.EMAIL_FROM ? parseFrom(env.EMAIL_FROM) : DEFAULT_FROM) : consoleMailer();
