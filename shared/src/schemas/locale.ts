import { z } from 'zod';

/** The languages Sivoov Run is written in. French first: every default is French. */
export const LocaleSchema = z.enum(['fr', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;
