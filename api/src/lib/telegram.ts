import type { Bindings } from '../env';
import { withEnvironment } from './notices';

type TelegramEnv = Pick<Bindings, 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_CHAT_ID' | 'ENVIRONMENT'>;

/** A blank secret counts as no secret: without both, nothing is sent (local, tests). */
const configured = (env: TelegramEnv): env is TelegramEnv & { TELEGRAM_BOT_TOKEN: string; TELEGRAM_CHAT_ID: string } =>
  !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID;

/**
 * Posts one line to the owner's chat (lines from lib/notices.ts). Never throws: a refusal or a
 * network failure is a console warning and nothing else. The token is in the URL, so the URL
 * is never logged, and an error that quotes it has it blanked.
 */
export const sendTelegram = async (env: TelegramEnv, text: string): Promise<void> => {
  if (!configured(env)) return;
  const token = env.TELEGRAM_BOT_TOKEN;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: withEnvironment(env.ENVIRONMENT, text), disable_web_page_preview: true }),
    });
    if (!res.ok) console.warn(`[telegram] sendMessage answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  } catch (e) {
    console.warn(`[telegram] sendMessage failed: ${(e instanceof Error ? e.message : String(e)).split(token).join('…')}`);
  }
};

/** The bit of a Hono context the notice needs; every route's context fits. */
type Ctx = { env: TelegramEnv; executionCtx: { waitUntil(promise: Promise<unknown>): void } };

/**
 * Tells the owner, after the response: the request never waits for Telegram and never fails
 * because of it. Nothing at all happens without the two secrets.
 */
export const notify = (c: Ctx, text: string): void => {
  if (!configured(c.env)) return;
  const sending = sendTelegram(c.env, text);
  try {
    c.executionCtx.waitUntil(sending);
  } catch {
    // No execution context (a bare `app.request` in a test): the send runs on its own.
  }
};
