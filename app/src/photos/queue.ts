import { Platform } from 'react-native';
import { z } from 'zod';
import { storage } from '@/storage';
import type { PickedPhoto } from './picker';

/**
 * Photos taken in the app during the run, until the server has them. The camera leaves its file
 * in a cache the OS may clear, and the network comes and goes on a course: on a phone each photo
 * is copied into the document dir (`photos/`), listed under one storage key, and sent when it can
 * be, the next app start included. The web target keeps them in memory (its files are objects).
 */
const KEY = 'sivoov.photos.queue';
const DIR = 'photos';

const QueuedSchema = z.object({ momentId: z.string(), photo: z.object({ id: z.string(), uri: z.string(), name: z.string(), type: z.string(), takenAtMs: z.number().nullable() }) });
export type Queued = { momentId: string; photo: PickedPhoto };

const memory: { list: Queued[] } = { list: [] };

const read = async (): Promise<Queued[]> => {
  if (Platform.OS === 'web') return memory.list;
  try {
    const parsed = z.array(QueuedSchema).safeParse(JSON.parse((await storage.get(KEY)) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const write = async (list: Queued[]): Promise<void> => {
  if (Platform.OS === 'web') {
    memory.list = list;
    return;
  }
  // The files carry the photos; the list only names them (a few hundred bytes).
  await storage.set(KEY, JSON.stringify(list.map(({ momentId, photo }) => ({ momentId, photo: { id: photo.id, uri: photo.uri, name: photo.name, type: photo.type, takenAtMs: photo.takenAtMs } }))));
};

/** A copy the OS keeps, on a phone; the photo as it is on the web. */
const keepFile = async (photo: PickedPhoto): Promise<PickedPhoto> => {
  if (Platform.OS === 'web') return photo;
  const fs = await import('expo-file-system');
  const dir = new fs.Directory(fs.Paths.document, DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new fs.File(dir, `${Date.now()}-${photo.name.replace(/[^A-Za-z0-9._-]/g, '_')}`);
  new fs.File(photo.uri).copy(target);
  return { ...photo, uri: target.uri };
};

const removeFile = async (photo: PickedPhoto): Promise<void> => {
  if (Platform.OS === 'web') return;
  const fs = await import('expo-file-system');
  const file = new fs.File(photo.uri);
  if (file.exists) file.delete();
};

export const photoQueue = {
  list: read,
  /** Keeps the photo for the moment; a second one for the same moment replaces the first. */
  async add(momentId: string, photo: PickedPhoto): Promise<Queued> {
    const kept = { momentId, photo: await keepFile(photo) };
    const list = await read();
    await Promise.all(list.filter((q) => q.momentId === momentId).map((q) => removeFile(q.photo).catch(() => undefined)));
    await write([...list.filter((q) => q.momentId !== momentId), kept]);
    return kept;
  },
  /** The server has it: the copy and its entry go. */
  async done(queued: Queued): Promise<void> {
    await removeFile(queued.photo).catch(() => undefined);
    await write((await read()).filter((q) => q.photo.uri !== queued.photo.uri));
  },
};
