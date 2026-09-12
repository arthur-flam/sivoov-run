import { z } from 'zod';

/** Step 1 of the magic-code sign-in: who you are in this race. */
export const CodeRequestSchema = z.object({
  raceSlug: z.string().min(1),
  bib: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
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
