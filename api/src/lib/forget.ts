import type { Entrant } from '@sivoov/shared';
import type { Bindings } from '../env';
import { db } from '../db/queries';
import { photoQueries } from '../db/photoQueries';
import { CARD_FORMATS, cardKey } from './cards';

const CARD_LOCALES = ['fr', 'en'] as const;
/** R2 deletes at most this many keys per call. */
const R2_DELETE_BATCH = 1000;

/**
 * « Supprimer mes données » (the app's home, required by the App Store): everything Sivoov
 * collected about the runner goes, in D1 and in R2: runs and their GPS traces, their share
 * cards, the lines the AI wrote for them, their photos and the pictures made of them, their
 * codes and sessions. The entry (name, email,
 * bib, address) stays: the organizer registered it and the runner asks them to remove it.
 * Rendered voices are kept by sentence hash (`voices/`), with nothing tying them to the runner.
 */
export const forgetRunner = async (env: Bindings, entrant: Entrant): Promise<{ runs: number }> => {
  const q = db(env.DB);
  const courses = await q.coursesForRace(entrant.raceId);
  const { runIds, traceKeys } = await q.forgetEntrant(entrant.id);
  const listed = await Promise.all(courses.map((c) => listAll(env.FILES, `personal-texts/${c.id}/`)));
  const written = listed.flat().filter((key) => key.endsWith(`/${entrant.id}.json`));
  const cards = runIds.flatMap((id) => CARD_LOCALES.flatMap((l) => CARD_FORMATS.map((f) => cardKey(`${id}-${l}`, f))));
  const photos = await photoQueries(env.DB).forgetPhotos(entrant.id);
  const keys = [...traceKeys, ...cards, ...written, ...photos];
  await Promise.all(
    Array.from({ length: Math.ceil(keys.length / R2_DELETE_BATCH) }, (_, i) => env.FILES.delete(keys.slice(i * R2_DELETE_BATCH, (i + 1) * R2_DELETE_BATCH))),
  );
  return { runs: runIds.length };
};

const listAll = async (files: R2Bucket, prefix: string, cursor?: string): Promise<string[]> => {
  const page = await files.list({ prefix, cursor });
  const keys = page.objects.map((o) => o.key);
  return page.truncated ? [...keys, ...(await listAll(files, prefix, page.cursor))] : keys;
};
