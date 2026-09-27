/**
 * A small mixing desk over ffmpeg. A cut is layers placed on a timeline: a source (a crowd, a
 * piece of music, a voice), where it starts in the cut (`at`), which part of it (`from`,
 * `dur`), how loud (`gain`, dB), its fades, and an effect (the PA of the start village, a
 * sound bleeding from far away). The mix is normalized to a loudness (LUFS) and written as MP3.
 * Pure description here; `render` runs ffmpeg.
 */
import { execFileSync } from 'node:child_process';

/**
 * - `pa`: the speaker on the start area's loudspeakers (band-limited, compressed, a slap of
 *   the buildings);
 * - `far`: music or a PA heard from down the avenue;
 * - `ear`: the speaker in the runner's ears, close and even.
 */
export type Fx = 'pa' | 'far' | 'ear';

export type Layer = {
  /** A file path. */
  path: string;
  at?: number;
  from?: number;
  /** Seconds taken from the source; the rest of it by default. */
  dur?: number;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
  fx?: Fx;
};

export type Cut = {
  layers: Layer[];
  /** Hard length; the longest layer by default. */
  length?: number;
  /** Integrated loudness the cut is normalized to. */
  lufs: number;
};

const FX: Record<Fx, string> = {
  pa: 'highpass=f=170,lowpass=f=7000,acompressor=threshold=-20dB:ratio=3:attack=5:release=90:makeup=3,aecho=0.85:0.55:38|95:0.22|0.10',
  far: 'highpass=f=110,lowpass=f=2600,aecho=0.8:0.7:140|290:0.32|0.18',
  ear: 'highpass=f=70,acompressor=threshold=-22dB:ratio=2.5:attack=5:release=120:makeup=2',
};

const durations = new Map<string, number>();

/** A file's length in seconds (ffprobe, remembered). */
export const durationOf = (path: string): number => {
  const known = durations.get(path);
  if (known !== undefined) return known;
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).toString().trim();
  const d = Number(out);
  if (!Number.isFinite(d)) throw new Error(`no duration for ${path}`);
  durations.set(path, d);
  return d;
};

const n = (x: number) => x.toFixed(3);

/** The layer's own length once cut. */
export const layerLength = (l: Layer): number => l.dur ?? Math.max(0, durationOf(l.path) - (l.from ?? 0));

/** Where the cut ends: its length, or its longest layer. */
export const cutLength = (cut: Cut): number => cut.length ?? Math.max(...cut.layers.map((l) => (l.at ?? 0) + layerLength(l)));

/** The ffmpeg arguments for a cut. */
export const ffmpegArgs = (cut: Cut, out: string): string[] => {
  const chains = cut.layers.map((l, i) => {
    const dur = layerLength(l);
    const steps = [
      'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo',
      `atrim=start=${n(l.from ?? 0)}:duration=${n(dur)}`,
      'asetpts=PTS-STARTPTS',
      ...(l.fx ? [FX[l.fx]] : []),
      `volume=${n(l.gain ?? 0)}dB`,
      ...(l.fadeIn ? [`afade=t=in:st=0:d=${n(l.fadeIn)}`] : []),
      ...(l.fadeOut ? [`afade=t=out:st=${n(Math.max(0, dur - l.fadeOut))}:d=${n(l.fadeOut)}`] : []),
      `adelay=${Math.round((l.at ?? 0) * 1000)}:all=1`,
    ];
    return `[${i}:a]${steps.join(',')}[l${i}]`;
  });
  const length = cutLength(cut);
  const mix = `${cut.layers.map((_, i) => `[l${i}]`).join('')}amix=inputs=${cut.layers.length}:normalize=0:duration=longest,atrim=duration=${n(length)},loudnorm=I=${cut.lufs}:TP=-1.5:LRA=14[out]`;
  return [
    '-y', '-v', 'error',
    ...cut.layers.flatMap((l) => ['-i', l.path]),
    '-filter_complex', [...chains, mix].join(';'),
    '-map', '[out]', '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '160k',
    out,
  ];
};

export const render = (cut: Cut, out: string): void => {
  execFileSync('ffmpeg', ffmpegArgs(cut, out), { stdio: 'inherit' });
};
