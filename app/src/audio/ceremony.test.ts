import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPackSchema } from '@sivoov/shared';
import type { AudioEvent, CueMoment } from '@sivoov/shared';

/** expo-audio at the boundary: one fake player per file, whose status the test drives. */
type Listener = (status: Record<string, unknown>) => void;
type FakePlayer = { uri: string; removed: boolean; emit: Listener };
const players: FakePlayer[] = [];
vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => undefined,
  createAudioPlayer: ({ uri }: { uri: string }) => {
    const p: FakePlayer = { uri, removed: false, emit: () => undefined };
    players.push(p);
    return {
      play: () => undefined,
      remove: () => {
        p.removed = true;
      },
      addListener: (_event: string, listener: Listener) => {
        p.emit = listener;
      },
      removeAllListeners: () => {
        p.emit = () => undefined;
      },
    };
  },
}));

const { ceremonyPlan, playCeremony } = await import('./ceremony');
import type { CeremonyCue } from './ceremony';

const status = (s: Record<string, unknown>) => ({ didJustFinish: false, playbackState: 'ready', isLoaded: true, duration: 0, currentTime: 0, playing: false, ...s });
const playing = (uri: string) => players.find((p) => p.uri === uri && !p.removed)!;
const cue = (id: string, at: CueMoment, order = 1) => ({ id, trigger: { kind: 'cue', at, order }, source: { kind: 'file', key: `${id}.mp3` }, mix: 'wait', priority: 10, category: 'ceremony' });
const pack = (...events: ReturnType<typeof cue>[]) => AudioPackSchema.parse({ courseId: 'c', version: 2, events, files: {} });
const all = (event: AudioEvent) => (event.source.kind === 'file' ? `file://${event.source.key}` : null);
const except = (...missing: string[]) => (event: AudioEvent) => (missing.includes(event.id) ? null : all(event));
const quiet = { start: () => 0, stop: () => undefined };

describe('the ceremony plan', () => {
  const full = pack(cue('gun', 'gun'), cue('countdown', 'countdown'), cue('welcome', 'armed', 1), cue('name', 'armed', 2));

  it('leaves out a line on the line whose sound did not come down, and keeps the start', () => {
    const plan = ceremonyPlan(full, except('name'));
    expect(plan?.lines.map((l) => l.event.id)).toEqual(['welcome', 'countdown', 'gun']);
    expect(plan).toMatchObject({ countdownIndex: 1, gunIndex: 2 });
  });

  it('gives up for the silent countdown when the countdown or the gun has no sound', () => {
    expect(ceremonyPlan(full, except('countdown'))).toBeNull();
    expect(ceremonyPlan(full, except('gun'))).toBeNull();
  });

  it('keeps one countdown for the digits, the last one', () => {
    const plan = ceremonyPlan(pack(cue('gun', 'gun'), cue('ten', 'countdown', 1), cue('five', 'countdown', 2)), all);
    expect(plan).toMatchObject({ countdownIndex: 1, gunIndex: 2 });
  });
});

describe('the ceremony as it plays', () => {
  beforeEach(() => {
    players.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const listen = (events: ReturnType<typeof cue>[]) => {
    const cues: CeremonyCue[] = [];
    const plan = ceremonyPlan(pack(...events), all)!;
    const ceremony = playCeremony(plan, () => Date.now(), { onCue: (c) => cues.push(c) }, quiet);
    return { cues, ceremony };
  };

  it('shows the digits of the one countdown line only, the other one plays like a line on the line', () => {
    const { cues } = listen([cue('gun', 'gun'), cue('ten', 'countdown', 1), cue('five', 'countdown', 2)]);
    playing('file://ten.mp3').emit(status({ duration: 10, playing: true }));
    playing('file://ten.mp3').emit(status({ duration: 10, currentTime: 4, playing: true }));
    playing('file://ten.mp3').emit(status({ didJustFinish: true }));
    playing('file://five.mp3').emit(status({ duration: 5, playing: true }));
    expect(cues).toEqual([{ at: 'armed' }, { at: 'countdown', seconds: 5 }]);
  });

  it('opens on ten when the countdown file says it lasts a little more (MP3 padding)', () => {
    const { cues } = listen([cue('gun', 'gun'), cue('countdown', 'countdown')]);
    playing('file://countdown.mp3').emit(status({ duration: 10.03, currentTime: 0, playing: true }));
    playing('file://countdown.mp3').emit(status({ duration: 10.03, currentTime: 1.03, playing: true }));
    playing('file://countdown.mp3').emit(status({ duration: 10.03, currentTime: 9.9, playing: true }));
    expect(cues).toEqual([
      { at: 'countdown', seconds: 10 },
      { at: 'countdown', seconds: 9 },
      { at: 'countdown', seconds: 1 },
    ]);
  });

  it('starts the clock when the countdown ended, not when the watchdog gave up on a gun that never loads', async () => {
    const { ceremony } = listen([cue('gun', 'gun'), cue('countdown', 'countdown')]);
    playing('file://countdown.mp3').emit(status({ duration: 10, playing: true }));
    vi.advanceTimersByTime(10_000);
    const lastWord = Date.now();
    playing('file://countdown.mp3').emit(status({ didJustFinish: true }));
    vi.advanceTimersByTime(8000);
    expect(await ceremony.gun).toBe(lastWord);
  });

  it('dates the gun from its own file when it plays', async () => {
    const { ceremony } = listen([cue('gun', 'gun'), cue('countdown', 'countdown')]);
    playing('file://countdown.mp3').emit(status({ didJustFinish: true }));
    vi.advanceTimersByTime(300);
    playing('file://gun.mp3').emit(status({ duration: 2, currentTime: 0.2, playing: true }));
    expect(await ceremony.gun).toBe(Date.now() - 200);
  });
});
