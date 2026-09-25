import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { localeFromHeader, resolveLocale } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import type { AppEnv } from '../env';

/** ?lang= wins and is remembered; then the cookie; then Accept-Language; French by default. */
export const localeOf = (c: Context<AppEnv>): Locale => {
  const fromQuery = c.req.query('lang');
  if (fromQuery) {
    const l = resolveLocale(fromQuery);
    setCookie(c, 'lang', l, { path: '/', maxAge: 365 * 86400, sameSite: 'Lax' });
    return l;
  }
  const fromCookie = getCookie(c, 'lang');
  return fromCookie ? resolveLocale(fromCookie) : localeFromHeader(c.req.header('Accept-Language'));
};
