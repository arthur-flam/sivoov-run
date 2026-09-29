import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPackSchema, CourseSchema, deauvilleMarathonLandmarks } from '@sivoov/shared';
import type { AudioPack, PersonalVoices } from '@sivoov/shared';

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
const myVoices = vi.fn<(token: string, here?: { lat: number; lng: number }) => Promise<PersonalVoices>>();
vi.mock('@/api', () => ({ ApiError, api: { pack: () => pack(), myVoices: (token: string, here?: { lat: number; lng: number }) => myVoices(token, here) } }));

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
    myVoices.mockReset();
    usePackStore.setState({ courseId: null, pack: null, status: 'idle', bytes: 0, uris: {}, personal: {}, captions: {}, personalFor: null });
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

describe('a pack published after the phone has one', () => {
  const v3Url = 'https://run.test/api/packs/m/3/intro.mp3';
  const republished = AudioPackSchema.parse({ ...published, version: 3, files: { 'intro.mp3': { url: v3Url, bytes: 900_000, sha256: 'y' }, 'gun.mp3': published.files['gun.mp3'] } });
  beforeEach(() => {
    disk.clear();
    offline.clear();
    pack.mockReset();
    platform.OS = 'android';
    usePackStore.setState({ courseId: null, pack: null, status: 'idle', bytes: 0, uris: {}, personal: {}, captions: {}, personalFor: null });
    sizes.set(v3Url, 900_000);
  });

  it('replaces the one on the phone when the pre-flight asks, once its files are down', async () => {
    pack.mockResolvedValueOnce(published).mockResolvedValueOnce(republished);
    await usePackStore.getState().load(course);
    await usePackStore.getState().update(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready', bytes: 1_550_000 });
    expect(usePackStore.getState().pack?.version).toBe(3);
    expect(usePackStore.getState().uriFor('intro.mp3')).toBe('file://cache/packs/deauville-2026-marathon/3/intro.mp3');
  });

  it('is never looked for by the race home or the run screen, which keep the pack they have', async () => {
    pack.mockResolvedValueOnce(published).mockResolvedValueOnce(republished);
    await usePackStore.getState().load(course);
    await usePackStore.getState().load(course);
    expect(pack).toHaveBeenCalledTimes(1);
    expect(usePackStore.getState().pack?.version).toBe(2);
  });

  it('keeps the pack on the phone when the newer one cannot come down, or the server cannot be reached', async () => {
    pack.mockResolvedValueOnce(published).mockResolvedValueOnce(republished).mockRejectedValueOnce(new Error('timeout'));
    offline.add(v3Url);
    await usePackStore.getState().load(course);
    await usePackStore.getState().update(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready', bytes: 1_850_000 });
    expect(usePackStore.getState().uriFor('intro.mp3')).toBe('file://cache/packs/deauville-2026-marathon/2/intro.mp3');
    await usePackStore.getState().update(course);
    expect(usePackStore.getState().pack?.version).toBe(2);
  });

  it('retries a pack that did not come down, as a first load would', async () => {
    pack.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(published);
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('error');
    await usePackStore.getState().update(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready' });
    expect(usePackStore.getState().pack?.version).toBe(2);
  });
});

describe('the runner’s own lines', () => {
  const personalPack = AudioPackSchema.parse({
    ...published,
    events: [
      ...published.events,
      { id: 'call', trigger: { kind: 'cue', at: 'armed', order: 2 }, source: { kind: 'file', key: 'intro.mp3' }, category: 'personal', personal: { phase: 'prepare' } },
      { id: 'split', trigger: { kind: 'split', everyMeters: 5000 }, source: { kind: 'file', key: 'gun.mp3' }, category: 'personal', personal: { phase: 'live' } },
    ],
  });
  const lea: PersonalVoices = {
    courseId: course.id,
    version: 2,
    files: { call: { url: 'https://run.test/api/voices/abc.mp3', bytes: 9_000, sha256: 'a'.repeat(64) } },
    captions: { call: 'Dossard 1002, Léa Martin, de Rouen !', word: 'Never downloaded.' },
  };
  const call = personalPack.events.find((e) => e.id === 'call')!;
  const split = personalPack.events.find((e) => e.id === 'split')!;

  beforeEach(() => {
    disk.clear();
    offline.clear();
    pack.mockReset();
    myVoices.mockReset();
    platform.OS = 'android';
    usePackStore.setState({ courseId: null, pack: null, status: 'idle', bytes: 0, uris: {}, personal: {}, captions: {}, personalFor: null });
    sizes.set('https://run.test/api/voices/abc.mp3', 9_000);
  });

  it('come down with the pack and play instead of the offline file, before the start', async () => {
    pack.mockResolvedValue(personalPack);
    myVoices.mockResolvedValue(lea);
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    expect(usePackStore.getState().soundFor(call)).toBe(`file://cache/voices/${course.id}/2/${'a'.repeat(32)}.mp3`);
    // A live line is said when it plays: before that, its sound is the offline file.
    expect(usePackStore.getState().soundFor(split)).toBe('file://cache/packs/deauville-2026-marathon/2/gun.mp3');
    // The words come with it, for the caption; only for a line whose sound came down.
    expect(usePackStore.getState().captions).toEqual({ call: 'Dossard 1002, Léa Martin, de Rouen !' });
  });

  it('leave the offline files in place when the server cannot say them, and never throw', async () => {
    pack.mockResolvedValue(personalPack);
    myVoices.mockRejectedValue(new Error('timeout'));
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    expect(usePackStore.getState().soundFor(call)).toBe('file://cache/packs/deauville-2026-marathon/2/intro.mp3');
  });

  it('are asked for once, and again only when the pre-flight brings a position for the weather', async () => {
    pack.mockResolvedValue(personalPack);
    myVoices.mockResolvedValue(lea);
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    await usePackStore.getState().loadPersonal('token');
    await usePackStore.getState().loadPersonal('token', { lat: 49.44, lng: 1.1 });
    await usePackStore.getState().loadPersonal('token', { lat: 49.44, lng: 1.1 });
    expect(myVoices.mock.calls).toEqual([['token', undefined], ['token', { lat: 49.44, lng: 1.1 }]]);
  });

  it('are not asked for when the pack has none', async () => {
    pack.mockResolvedValue(published);
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    expect(myVoices).not.toHaveBeenCalled();
  });
});
