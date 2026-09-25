import type { Bindings } from '../env';

/** Test accounts: the seeded entrants and organizers on fake domains, never a real person. */
export const isTestAccount = (email: string): boolean => /@example\.(com|org|net)$/i.test(email);

/**
 * Local and preview accept a fixed code (`TEST_CODE` var) for test accounts, so a session or a
 * phone can sign in without an inbox. Production has no TEST_CODE. See docs/ACCESS.md.
 */
export const acceptsTestCode = (env: Pick<Bindings, 'TEST_CODE' | 'ENVIRONMENT'>, email: string, code: string): boolean =>
  env.ENVIRONMENT !== 'production' && !!env.TEST_CODE && code === env.TEST_CODE && isTestAccount(email);

/**
 * Voice rendering costs ElevenLabs credit: on preview and production, a session opened with the
 * shared test code may not spend it. Local always may (the tests stub the provider).
 */
export const maySpendCredit = (env: Pick<Bindings, 'ENVIRONMENT'>, email: string): boolean => env.ENVIRONMENT === 'local' || !isTestAccount(email);
