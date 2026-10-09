/**
 * A whole run as a runner would hear it (PRODUCTION.md, "Testing what we make"): the start
 * ceremony, then every line the engine says at a given pace (`hearRun`, the app's own rhythm
 * director and takes), played the way the app plays them (one voice at a time, a line that
 * interrupts cuts the one before, each ambiance until the next), over a stand-in for the runner's
 * own music, ducked while the race speaks. One MP3 per pace and a timeline with every silence.
 * And the demo reel: the same run condensed to a few minutes, with chapters.
 */
import { execFileSync } from 'node:child_process';
import type { AudioEvent, AudioPack, Heard } from '@sivoov/shared';
import { mapLimit } from '../../src/lib/mapLimit';
import type { Cut, Layer } from './mix';
import { durationOf } from './mix';

/** What one line is when it plays: its file (the runner's own version, or the pack's), its ambiance, its words. */
export type Sounding = { file: string; under?: string; words: string; title: string };

/** A line placed on the run's clock (seconds from the gun; the ceremony is before 0). */
export type Placed = { at: number; event: Pick<AudioEvent, 'id' | 'mix' | 'priority'>; sounding: Sounding; km: number; take?: string; filler: boolean };

/** Where each sound ends up once the app has played it: the voice, its ambiance, and when. */
export type Played = { at: number; until: number; file: string; under?: { at: number; until: number; file: string }; placed: Placed };

/** An ambiance gives way to the next in this long (app/src/audio/under.ts). */
const FADE_S = 0.8;

/**
 * The app's player, on paper: one line at a time in the order they fire; a line that interrupts
 * (with a priority at least the current one's) cuts it; an ambiance plays to its end or until the
 * next one starts.
 */
export const playOut = (lines: Placed[]): Played[] => {
  const played: Played[] = [];
  lines
    .slice()
    .sort((a, b) => a.at - b.at)
    .forEach((p) => {
      const last = played[played.length - 1];
      const cuts = last && p.event.mix === 'interrupt' && p.event.priority >= last.placed.event.priority && last.until > p.at;
      if (cuts) last.until = p.at;
      const at = cuts || !last ? p.at : Math.max(p.at, last.until);
      played.push({ at, until: at + durationOf(p.sounding.file), file: p.sounding.file, placed: p, ...(p.sounding.under ? { under: { at, until: at + durationOf(p.sounding.under), file: p.sounding.under } } : {}) });
    });
  // Each ambiance stops where the next one starts.
  const unders = played.filter((x) => x.under);
  unders.forEach((x, i) => {
    const next = unders[i + 1];
    if (next && next.under!.at < x.under!.until) x.under!.until = next.under!.at + FADE_S;
  });
  return played;
};

/** The stretches where nothing of the race sounds, after `from` (the gun's ambiance): [start, end]. */
export const silencesOf = (played: Played[], from: number): [number, number][] => {
  const spans = played.flatMap((p) => [[p.at, p.until] as const, ...(p.under ? [[p.under.at, p.under.until] as const] : [])]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let end = from;
  spans.forEach(([a, b]) => {
    if (a > end) out.push([end, a]);
    end = Math.max(end, b);
  });
  return out;
};

/** The runner's music: the playlist looped over the whole run, ducked to a third while the race sounds. */
const musicTrack = (playlist: string, out: string, from: number, to: number, played: Played[]): Layer => {
  const terms = played
    .flatMap((p) => [[p.at, p.until] as const, ...(p.under ? [[p.under.at, p.under.until] as const] : [])])
    .filter(([a, b]) => b > from && a < to)
    .map(([a, b]) => `clip((t-${(a - from - 0.8).toFixed(2)})/0.8,0,1)*clip((${(b - from + 1.5).toFixed(2)}-t)/1.5,0,1)`);
  // ffmpeg's expressions nest: a long run's hundred spans are summed and capped instead of max()'d one into the next.
  const ducked = terms.length ? `min(1,${terms.join('+')})` : '0';
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-stream_loop', '-1', '-i', playlist, '-t', (to - from).toFixed(2), '-af', `volume='1-0.65*${ducked}':eval=frame,afade=t=in:d=3`, '-ar', '44100', '-ac', '2', out]);
  return { path: out, at: from, gain: -9 };
};

const shifted = (p: Played, dt: number): Played => ({
  ...p,
  at: p.at + dt,
  until: p.until + dt,
  ...(p.under ? { under: { ...p.under, at: p.under.at + dt, until: p.under.until + dt } } : {}),
});

/** The run as one cut: the voices, the ambiances, and the music from `musicFrom` (run time) to the line. `t0`: where the gun lands in the file. */
export const runCut = (played: Played[], o: { t0: number; playlist: string; music: string; musicFrom: number }): Cut => {
  const inFile = played.map((p) => shifted(p, o.t0));
  const end = Math.max(...inFile.map((p) => Math.max(p.until, p.under?.until ?? 0))) + 2;
  const layers: Layer[] = inFile.flatMap((p) => [
    { path: p.file, at: p.at, dur: p.until - p.at, ...(p.until - p.at < durationOf(p.file) - 0.05 ? { fadeOut: 0.3 } : {}) },
    ...(p.under ? [{ path: p.under.file, at: p.under.at, dur: Math.min(durationOf(p.under.file), p.under.until - p.under.at), fadeOut: Math.min(FADE_S, p.under.until - p.under.at) }] : []),
  ]);
  const line = inFile.find((p) => p.placed.event.id === 'ceremony.line')?.at ?? end;
  return { layers: [...layers, musicTrack(o.playlist, o.music, o.t0 + o.musicFrom, line, inFile)], length: end, lufs: -16 };
};

const clock = (s: number) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;

/** The timeline a listener reads beside the file: when, where, who, the words, and each silence before. */
export const timelineMd = (title: string, played: Played[], t0: number, quietFrom: number): string => {
  const silences = silencesOf(played, quietFrom);
  const rows = played.map((p) => {
    const before = silences.find(([, b]) => Math.abs(b - p.at) < 0.01);
    const gap = before ? `${Math.round(before[1] - before[0])} s` : '';
    return `| ${clock(t0 + p.at)} | ${p.placed.km.toFixed(2)} | ${gap} | ${p.placed.sounding.title}${p.placed.take ? ` (${p.placed.take})` : ''}${p.placed.filler ? ' ·' : ''} | ${p.placed.sounding.words.replaceAll('|', '/')} |`;
  });
  const longest = Math.max(0, ...silences.map(([a, b]) => b - a));
  return [
    `# ${title}`,
    '',
    `${played.length} lines, ${played.filter((p) => p.placed.filler).length} from the rhythm director (·). Longest silence: ${Math.round(longest)} s. Time in the file, km on the course, the silence before each line.`,
    '',
    '| file | km | silence | line | words |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
};

/** The heard lines of a run, with their place in the pack, as `Placed` (the sounding comes from the caller; four renders at a time). */
export const placedOf = (pack: Pick<AudioPack, 'events'>, heard: Heard[], soundingOf: (h: Heard, event: AudioEvent) => Promise<Sounding | null>) =>
  mapLimit(heard, 4, async (h): Promise<Placed | null> => {
    const event = pack.events.find((e) => e.id === h.eventId)!;
    const sounding = await soundingOf(h, event);
    return sounding ? { at: h.elapsedMs / 1000, event, sounding, km: h.distanceM / 1000, ...(h.take ? { take: h.take } : {}), filler: event.trigger.kind === 'filler' } : null;
  }).then((all) => all.filter((p): p is Placed => p !== null));

/** How long the reel lets an ambiance play on after its line, before the next moment. */
const HOLD_S: Record<string, number> = { 'ceremony.gun': 12, 'course.rond-point': 12, 'course.cobbles': 6, 'course.hush': 5, 'course.arc': 14, 'course.monceau': 6, 'course.golden': 14, 'course.final': 3 };

/**
 * The demo reel: the run condensed to a few minutes. The whole ceremony; then every placed line
 * in order, the first kilometre call and the first one read against the runner's own pace, the
 * crowd's first two shouts; each ambiance held a few seconds; the finish to the end of its words.
 */
export const reelOf = (placed: Placed[]): Placed[] => {
  const firstSplits = [placed.find((p) => p.event.id === 'personal.split'), placed.find((p) => p.event.id === 'personal.split' && p.take)];
  const crowd = placed.filter((p) => p.filler && p.event.id.startsWith('crowd.')).slice(0, 2);
  const kept = placed.filter((p) => p.at < 0 || p.event.id === 'ceremony.gun' || (!p.filler && p.event.id !== 'personal.split') || firstSplits.includes(p) || crowd.includes(p));
  return kept.reduce<Placed[]>((acc, p) => {
    const last = acc[acc.length - 1];
    const at = p.at <= 0 || !last ? p.at : Math.max(0, last.at) + durationOf(last.sounding.file) + (HOLD_S[last.event.id] ?? 1.2);
    return [...acc, { ...p, at }];
  }, []);
};
