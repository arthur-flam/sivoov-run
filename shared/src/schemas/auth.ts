import { z } from 'zod';

/**
 * Step 1 of the magic-code sign-in: the email of the entry. The race and the bib are only
 * asked when the email alone does not say which entry it is (`SignInAmbiguity`).
 */
export const CodeRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  raceSlug: z.string().min(1).optional(),
  bib: z.string().trim().min(1).optional(),
});
export type CodeRequest = z.infer<typeof CodeRequestSchema>;

/** Step 2: the 6-digit code from the email. */
export const CodeVerifySchema = CodeRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/, 'six digits'),
});
export type CodeVerify = z.infer<typeof CodeVerifySchema>;

export const SessionTokenSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type SessionToken = z.infer<typeof SessionTokenSchema>;

/**
 * The answer when an email names more than one entry: the races to choose from (more than one
 * race), or a bib to ask for (two entries of one race share the email, a family on one address).
 */
export const SignInAmbiguitySchema = z.object({
  error: z.literal('ambiguous'),
  races: z.array(z.object({ slug: z.string(), name: z.string() })),
  bib: z.boolean(),
});
export type SignInAmbiguity = z.infer<typeof SignInAmbiguitySchema>;
