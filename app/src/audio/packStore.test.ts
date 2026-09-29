import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPackSchema, CourseSchema, deauvilleMarathonLandmarks } from '@sivoov/shared';
import type { AudioPack, PersonalVoices } from '@sivoov/shared';

/** The phone's document dir: file uri -> size, and what text files say. `offline` urls fail to download, `stalled` ones never answer. */
const disk = new Map<string, number>();
const texts = new Map<string, string>();
const offline = new Set<string>();
const stalled = new Set<string>();
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
      return disk.has(this.uri) || texts.has(this.uri);
    }
    get size() {
      return disk.get(this.uri) ?? 0;
    }
    delete() {
      disk.delete(this.uri);
    }
    async text() {
      return texts.get(this.uri) ?? '';
    }
    write(text: string) {
      texts.set(this.uri, text);
    }
    static async downloadFileAsync(url: string, file: File) {
      if (offline.has(url)) throw new Error('offline');
      if (stalled.has(url)) return new Promise<File>(() => undefined);
      disk.set(file.uri, sizes.get(url) ?? 0);
      return file;
    }
  }
  return { Directory, File, Paths: { cache: { path: 'cache' }, document: { path: 'document' } } };
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
  ['https://run.test/api/packs/m/3/intro.mp3', 1_300_000],
  ['https://run.test/api/packs/m/3/gun.mp3', 700_000],
]);
const filesOf = (version: number) =>
  Object.fromEntries([...sizes].filter(([url]) => url.includes(`/m/${version}/`)).map(([url, bytes]) => [url.split('/').pop()!, { url, bytes, sha256: 'x' }]));
const published = AudioPackSchema.parse({
  courseId: course.id,
  version: 2,
  events: [
    { id: 'intro', trigger: { kind: 'cue', at: 'armed', order: 1 }, source: { kind: 'file', key: 'intro.mp3' }, category: 'ceremony' },
    { id: 'gun', trigger: { kind: 'cue', at: 'gun', order: 1 }, source: { kind: 'file', key: 'gun.mp3' }, category: 'ceremony' },
  ],
  files: filesOf(2),
});
const republished = AudioPackSchema.parse({ ...published, version: 3, files: filesOf(3) });

/** The app killed and opened again: nothing in memory, the phone's files still there. */
const coldStart = () => usePackStore.setState({ courseId: null, pack: null, status: 'idle', outdated: false, bytes: 0, uris: {}, personal: {}, voices: {}, captions: {}, personalFor: null });

const wipe = () => {
  disk.clear();
  texts.clear();
  offline.clear();
  stalled.clear();
  pack.mockReset();
  myVoices.mockReset();
  platform.OS = 'android';
  coldStart();
};

describe('the audio pack on the phone', () => {
  beforeEach(wipe);

  it('downloads every file ahead of the run and says how much it weighs', async () => {
    pack.mockResolvedValue(published);
    await usePackStore.getState().load(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready', bytes: 1_850_000 });
    expect(usePackStore.getState().uriFor('gun.mp3')).toBe('file://document/packs/deauville-2026-marathon/2/gun.mp3');
  });

  it('asks the network once however many screens want the pack', async () => {
    pack.mockResolvedValue(published);
    await Promise.all([usePackStore.getState().load(course), usePackStore.getState().load(course)]);
    await usePackStore.getState().load(course);
    expect(pack).toHaveBeenCalledTimes(1);
  });

  it('is in error when a file did not come down, never plays it from the network, and a retry completes it', async () => {
    pack.mockResolvedValue(published);
    offline.add('https://run.test/api/packs/m/2/gun.mp3');
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('error');
    // Offline at the start, a remote file would hold the ceremony for nothing: only files on the phone play.
    expect(usePackStore.getState().uriFor('gun.mp3')).toBeNull();
    offline.clear();
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('ready');
    expect(usePackStore.getState().uriFor('gun.mp3')).toBe('file://document/packs/deauville-2026-marathon/2/gun.mp3');
  });

  it('keeps what it has when a retry cannot reach the server', async () => {
    pack.mockResolvedValueOnce(published).mockRejectedValueOnce(new Error('timeout'));
    offline.add('https://run.test/api/packs/m/2/gun.mp3');
    await usePackStore.getState().load(course);
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('error');
    expect(usePackStore.getState().pack?.version).toBe(2);
    expect(usePackStore.getState().uriFor('intro.mp3')).toBe('file://document/packs/deauville-2026-marathon/2/intro.mp3');
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

describe('a cold start with no network', () => {
  beforeEach(wipe);

  it('plays the race from the pack kept on the phone, ready at once', async () => {
    pack.mockResolvedValue(published);
    await usePackStore.getState().load(course);
    coldStart();
    pack.mockRejectedValue(new Error('timeout'));
    await usePackStore.getState().load(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready', bytes: 1_850_000 });
    expect(usePackStore.getState().pack?.version).toBe(2);
    expect(usePackStore.getState().uriFor('gun.mp3')).toBe('file://document/packs/deauville-2026-marathon/2/gun.mp3');
  });

  it('is ready before the network answers', async () => {
    pack.mockResolvedValue(published);
    await usePackStore.getState().load(course);
    coldStart();
    pack.mockReturnValue(new Promise<AudioPack>(() => undefined));
    void usePackStore.getState().load(course);
    await vi.waitFor(() => expect(usePackStore.getState().status).toBe('ready'));
    expect(usePackStore.getState().uriFor('intro.mp3')).not.toBeNull();
  });

  it('plays what is still on the phone when a file went missing', async () => {
    pack.mockResolvedValue(published);
    await usePackStore.getState().load(course);
    disk.delete('file://document/packs/deauville-2026-marathon/2/gun.mp3');
    coldStart();
    pack.mockRejectedValue(new Error('timeout'));
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('error');
    expect(usePackStore.getState().uriFor('intro.mp3')).not.toBeNull();
    expect(usePackStore.getState().uriFor('gun.mp3')).toBeNull();
  });
});

describe('a newer pack', () => {
  beforeEach(wipe);

  it('replaces the one on the phone once all its files are there', async () => {
    pack.mockResolvedValueOnce(published).mockResolvedValueOnce(republished);
    await usePackStore.getState().load(course);
    coldStart();
    await usePackStore.getState().load(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready', outdated: false, bytes: 2_000_000 });
    expect(usePackStore.getState().uriFor('gun.mp3')).toBe('file://document/packs/deauville-2026-marathon/3/gun.mp3');
    // And it is the one a later cold start finds.
    coldStart();
    pack.mockRejectedValue(new Error('timeout'));
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().pack?.version).toBe(3);
  });

  it('waits while one of its files cannot come down: the whole older pack keeps playing, the next load tries again', async () => {
    pack.mockResolvedValueOnce(published).mockResolvedValue(republished);
    await usePackStore.getState().load(course);
    offline.add('https://run.test/api/packs/m/3/gun.mp3');
    coldStart();
    await usePackStore.getState().load(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready', outdated: true });
    expect(usePackStore.getState().pack?.version).toBe(2);
    expect(usePackStore.getState().uriFor('gun.mp3')).toBe('file://document/packs/deauville-2026-marathon/2/gun.mp3');
    offline.clear();
    await usePackStore.getState().load(course);
    expect(usePackStore.getState()).toMatchObject({ status: 'ready', outdated: false });
    expect(usePackStore.getState().pack?.version).toBe(3);
  });
});

describe('a stalled download', () => {
  beforeEach(() => {
    wipe();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('is given up on after thirty seconds: the pack says so and can be asked again', async () => {
    pack.mockResolvedValue(published);
    stalled.add('https://run.test/api/packs/m/2/gun.mp3');
    const loading = usePackStore.getState().load(course);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(usePackStore.getState().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(1_000);
    await loading;
    expect(usePackStore.getState().status).toBe('error');
    stalled.clear();
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().status).toBe('ready');
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
  const ownFile = `file://document/voices/${course.id}/2/${'a'.repeat(32)}.mp3`;

  beforeEach(() => {
    wipe();
    sizes.set('https://run.test/api/voices/abc.mp3', 9_000);
  });

  it('come down with the pack and play instead of the offline file, before the start', async () => {
    pack.mockResolvedValue(personalPack);
    myVoices.mockResolvedValue(lea);
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    expect(usePackStore.getState().soundFor(call)).toBe(ownFile);
    // A live line is said when it plays: before that, its sound is the offline file.
    expect(usePackStore.getState().soundFor(split)).toBe('file://document/packs/deauville-2026-marathon/2/gun.mp3');
    // The words come with it, for the caption; only for a line whose sound came down.
    expect(usePackStore.getState().captions).toEqual({ call: 'Dossard 1002, Léa Martin, de Rouen !' });
  });

  it('are kept on the phone for a cold start with no network, with their words', async () => {
    pack.mockResolvedValue(personalPack);
    myVoices.mockResolvedValue(lea);
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    coldStart();
    pack.mockRejectedValue(new Error('timeout'));
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().soundFor(call)).toBe(ownFile);
    expect(usePackStore.getState().captions).toEqual({ call: 'Dossard 1002, Léa Martin, de Rouen !' });
    // Fresh enough: not asked for again.
    await usePackStore.getState().loadPersonal('token');
    expect(myVoices).toHaveBeenCalledTimes(1);
  });

  it('play the offline file when theirs did not come down, never the remote one', async () => {
    pack.mockResolvedValue(personalPack);
    myVoices.mockResolvedValue(lea);
    offline.add('https://run.test/api/voices/abc.mp3');
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    expect(usePackStore.getState().soundFor(call)).toBe('file://document/packs/deauville-2026-marathon/2/intro.mp3');
    expect(usePackStore.getState().captions).toEqual({});
  });

  it('leave the offline files in place when the server cannot say them, and never throw', async () => {
    pack.mockResolvedValue(personalPack);
    myVoices.mockRejectedValue(new Error('timeout'));
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    expect(usePackStore.getState().soundFor(call)).toBe('file://document/packs/deauville-2026-marathon/2/intro.mp3');
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

  it('belong to their pack version: a newer pack drops them', async () => {
    pack.mockResolvedValueOnce(personalPack).mockResolvedValueOnce({ ...personalPack, version: 3, files: filesOf(3) });
    myVoices.mockResolvedValue(lea);
    await usePackStore.getState().load(course);
    await usePackStore.getState().loadPersonal('token');
    coldStart();
    await usePackStore.getState().load(course);
    expect(usePackStore.getState().pack?.version).toBe(3);
    expect(usePackStore.getState()).toMatchObject({ personal: {}, captions: {}, personalFor: null });
  });
});
