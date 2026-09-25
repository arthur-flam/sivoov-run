const BASE = 'https://same.site';

/**
 * Where to send a runner after sign-in: a path on this site, or null. Anything that would leave
 * the site is refused, including `//host` and the forms a URL parser turns into it (`/\host`, `/.//host`).
 */
export const sameSitePath = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.startsWith('/') || !URL.canParse(value, BASE)) return null;
  const url = new URL(value, BASE);
  const path = `${url.pathname}${url.search}`;
  return url.origin === BASE && !path.startsWith('//') ? path : null;
};
