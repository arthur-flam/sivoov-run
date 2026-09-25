import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPackSchema, CourseSchema, deauvilleMarathonLandmarks } from '@sivoov/shared';
import type { AudioPack } from '@sivoov/shared';

/** The phone's cache dir: file uri -> size. `offline` urls fail to download. */
const disk = new Map<string, number>();
const offline = new Set<string>();
const platform = { OS: 'android' };
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-file-system', () => {
  const pathOf = (p: unknown): string => (typeof p === 'string' ? p : (p as { path: string }).path);
  class Directory {
    path: string;
    constructor(...parts: unknown[]) {
      this.path = parts.map(pathOf).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(dir: Directory, name: string) {
      this.uri = `file://${dir.path}/${name}`;
    }
    get exists() {
      return disk.has(this.uri);
    }
    get size() {
      return disk.get(this.uri) ?? 0;
    }
    delete() {
      disk.delete(this.uri);
    }
    static async downloadFileAsync(url: string, file: File) {
      if (offline.has(url)) throw new Error('offline');
      disk.set(file.uri, sizes.get(url) ?? 0);
      return file;
    }
  }
  return { Directory, File, Paths: { cache: { path: 'cache' } } };
});

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
const pack = vi.fn<() => Promise<AudioPack>>();
vi.mock('@/api', () => ({ ApiError, api: { pack: () => pack() } }));

const { usePackStore } = await import('./packStore');

const course = CourseSchema.parse({ id: 'deauville-2026-marathon', raceId: 'r', distanceKey: 'marathon', distanceM: 42195, landmarks: deauvilleMarathonLandmarks });
const sizes = new Map([
  ['https://run.test/api/packs/m/2/intro.mp3', 1_200_000],
  ['https://run.test/api/packs/m/2/gun.mp3', 650_000],
]);
const published = AudioPackSchema.parse({
  courseId: course.id,
  version: 2,
  events: [
    { id: 'intro', trigger: { kind: 'cue', at: 'armed', order: 1 }, source: { kind: 'file', key: 'intro.mp3' }, category: 'ceremony' },
    { id: 'gun', trigger: { kind: 'cue', at: 'gun', order: 1 }, source: { kind: 'file', key: 'gun.mp3' }, category: 'ceremony' },
  ],
  files: Object.fromEntries([...sizes].map(([url, bytes]) => [url.split('/').pop()!, { url, bytes, sha256: 'x' }])),
});

describe('the audio pack on the phone', () => {
  beforeEach(() => {
    disk.clear();
    offline.clear();
    pack.mockReset();
    platform.OS = 'android';
    usePackStore.setState({ courseId: null, pack: null, status: 'idle', bytes: 0, uris: {} });
  });

  it('downloads every file ahead of the run and says how much it weighs', async () => {
    pack.mockResolvedValue(published);
    await usePackStore.getState().load(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready', bytes: 1_850_000 });
    expect(usePackStore.getState().uriFor('gun.mp3')).toBe('file://cache/packs/deauville-2026-marathon/2/gun.mp3');
  });

  it('asks the network once however many screens want the pack', async () => {
    pack.mockResolvedValue(published);
    await Promise.all([usePackStore.getState().load(course), usePackStore.getState().load(course)]);
    await usePackStore.getState().load(course);
    expect(pack).toHaveBeenCalledTimes(1);
  });

  it('is in error when a file did not come down, streams it meanwhile, and a retry completes it', async () => {
    pack.mockResolvedValue(published);
    offline.add('https://run.test/api/packs/m/2/gun.mp3');
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('error');
    expect(usePackStore.getState().uriFor('gun.mp3')).toBe('https://run.test/api/packs/m/2/gun.mp3');
    offline.clear();
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('ready');
    expect(usePackStore.getState().uriFor('gun.mp3')).toBe('file://cache/packs/deauville-2026-marathon/2/gun.mp3');
  });

  it('keeps what it has when a retry cannot reach the server', async () => {
    pack.mockResolvedValueOnce(published).mockRejectedValueOnce(new Error('timeout'));
    offline.add('https://run.test/api/packs/m/2/gun.mp3');
    await usePackStore.getState().load(course);
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('error');
    expect(usePackStore.getState().pack?.version).toBe(2);
    expect(usePackStore.getState().uriFor('intro.mp3')).toBe('file://cache/packs/deauville-2026-marathon/2/intro.mp3');
  });

  it('tells a course with no published pack from a network failure, and runs on captions for both', async () => {
    pack.mockRejectedValueOnce(new ApiError(404, 'not_found')).mockRejectedValueOnce(new Error('timeout'));
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('none');
    expect(usePackStore.getState().pack?.files).toEqual({});
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('error');
    expect(usePackStore.getState().pack?.events.length).toBeGreaterThan(0);
  });

  it('on the web, streams the files: ready as soon as the manifest is in', async () => {
    platform.OS = 'web';
    pack.mockResolvedValue(published);
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('ready');
    expect(usePackStore.getState().uriFor('intro.mp3')).toBe('https://run.test/api/packs/m/2/intro.mp3');
    expect(disk.size).toBe(0);
  });
});
