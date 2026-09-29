import type { Race } from '@sivoov/shared';
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
 * App Review signs in with a fixed code (`REVIEW_CODE`, a production var), and only as a
 * test account of a demo race: an `@example.com` address has no inbox and a demo race has no
 * real runner, so the code opens nothing that matters. See docs/ACCESS.md.
 */
export const acceptsReviewCode = (env: { REVIEW_CODE?: string }, email: string, race: Pick<Race, 'demoOf'>, code: string): boolean =>
  !!env.REVIEW_CODE && code === env.REVIEW_CODE && !!race.demoOf && isTestAccount(email);

/**
 * Voice rendering costs ElevenLabs credit: on preview and production, a session opened with the
 * shared test code may not spend it. Local always may (the tests stub the provider).
 */
export const maySpendCredit = (env: Pick<Bindings, 'ENVIRONMENT'>, email: string): boolean => env.ENVIRONMENT === 'local' || !isTestAccount(email);
