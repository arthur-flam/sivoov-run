import type { Bindings } from '../env';

/** Test accounts: the seeded entrants and organizers on fake domains, never a real person. */
export const isTestAccount = (email: string): boolean => /@example\.(com|org|net)$/i.test(email);

/**
 * Local and preview accept a fixed code (`TEST_CODE` var) for test accounts, so a session or a
 * phone can sign in without an inbox. Production has no TEST_CODE. See docs/ACCESS.md.
 */
export const acceptsTestCode = (env: Pick<Bindings, 'TEST_CODE' | 'ENVIRONMENT'>, email: string, code: string): boolean =>
  env.ENVIRONMENT !== 'production' && !!env.TEST_CODE && code === env.TEST_CODE && isTestAccount(email);
