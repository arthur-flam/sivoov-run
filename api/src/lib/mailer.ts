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

/** "a@x.fr, @example.org" -> does this address match one of them (an address, or a whole domain)? */
export const allowedRecipient = (allowlist: string, to: string): boolean => {
  const address = to.trim().toLowerCase();
  return allowlist
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith('@') ? address.endsWith(entry) : address === entry));
};

/**
 * Sends only to the allowlist, and logs the rest. Preview is open to anyone with the test code,
 * so without it the preview admin could send invitations and runner emails from sivoov.app to
 * any address.
 */
export const allowlistMailer = (allowlist: string, inner: Mailer, fallback: Mailer = consoleMailer()): Mailer => ({
  send: (mail) => (allowedRecipient(allowlist, mail.to) ? inner.send(mail) : fallback.send(mail)),
});

export const mailerFor = (env: Bindings): Mailer => {
  if (!env.EMAIL || env.ENVIRONMENT === 'local') return consoleMailer();
  const real = cloudflareMailer(env.EMAIL, env.EMAIL_FROM ? parseFrom(env.EMAIL_FROM) : DEFAULT_FROM);
  return env.MAIL_ALLOWLIST ? allowlistMailer(env.MAIL_ALLOWLIST, real) : real;
};
