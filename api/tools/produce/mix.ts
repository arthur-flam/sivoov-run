/**
 * A small mixing desk over ffmpeg. A cut is layers placed on a timeline: a source (a crowd, a
 * piece of music, a voice), where it starts in the cut (`at`), which part of it (`from`,
 * `dur`), how loud (`gain`, dB), its fades, and an effect (the PA of the start village, a
 * sound bleeding from far away). The mix is normalized to a loudness (LUFS) and written as MP3.
 * Pure description here; `render` runs ffmpeg.
 */
import { execFileSync, spawnSync } from 'node:child_process';

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
  /** At most this long: a longer source is sped up to fit (a countdown number in its second). */
  fit?: number;
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
  /**
   * An ambiance that starts under its own line: held `db` down until `until` seconds (the
   * line's length), then back up over `ramp`. The app plays line and ambiance on two players,
   * so the mix cannot duck one under the other: the ambiance leaves the room itself.
   */
  duck?: { until: number; db: number; ramp?: number };
};

const FX: Record<Fx, string> = {
  pa: 'highpass=f=140,lowpass=f=7500,equalizer=f=3200:t=q:w=1.2:g=-3,equalizer=f=450:t=q:w=1:g=-2,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=150:makeup=2,aecho=0.85:0.5:38|95:0.2|0.09',
  far: 'highpass=f=110,lowpass=f=2600,aecho=0.8:0.7:140|290:0.32|0.18',
  // Nearly nothing: the runner's own lines come raw from the Worker and must sound the same.
  ear: 'highpass=f=70',
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
const sourceLength = (l: Layer): number => l.dur ?? Math.max(0, durationOf(l.path) - (l.from ?? 0));
/** How much faster a layer plays to fit, 1 when it fits already (atempo keeps the pitch). */
const tempoOf = (l: Layer): number => (l.fit && sourceLength(l) > l.fit ? Math.min(2, sourceLength(l) / l.fit) : 1);
export const layerLength = (l: Layer): number => sourceLength(l) / tempoOf(l);

/** Where the cut ends: its length, or its longest layer. */
export const cutLength = (cut: Cut): number => cut.length ?? Math.max(...cut.layers.map((l) => (l.at ?? 0) + layerLength(l)));

/** The layers mixed, ducked if asked, cut to length, then `tail` (the loudness step). */
const graph = (cut: Cut, tail: string): string => {
  const chains = cut.layers.map((l, i) => {
    const dur = layerLength(l);
    const steps = [
      'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo',
      `atrim=start=${n(l.from ?? 0)}:duration=${n(sourceLength(l))}`,
      'asetpts=PTS-STARTPTS',
      ...(tempoOf(l) > 1 ? [`atempo=${tempoOf(l).toFixed(3)}`] : []),
      ...(l.fx ? [FX[l.fx]] : []),
      `volume=${n(l.gain ?? 0)}dB`,
      ...(l.fadeIn ? [`afade=t=in:st=0:d=${n(l.fadeIn)}`] : []),
      ...(l.fadeOut ? [`afade=t=out:st=${n(Math.max(0, dur - l.fadeOut))}:d=${n(l.fadeOut)}`] : []),
      `adelay=${Math.round((l.at ?? 0) * 1000)}:all=1`,
    ];
    return `[${i}:a]${steps.join(',')}[l${i}]`;
  });
  const duck = cut.duck
    ? (() => {
        const g = 10 ** (cut.duck.db / 20);
        const u = cut.duck.until;
        const r = cut.duck.ramp ?? 1.5;
        return [`volume='if(lt(t,${n(u)}),${g.toFixed(4)},if(lt(t,${n(u + r)}),${g.toFixed(4)}+(1-${g.toFixed(4)})*(t-${n(u)})/${n(r)},1))':eval=frame`];
      })()
    : [];
  const mix = [
    `${cut.layers.map((_, i) => `[l${i}]`).join('')}amix=inputs=${cut.layers.length}:normalize=0:duration=longest`,
    ...duck,
    // Pad, then cut: a cut is exactly its length (the countdown's ten seconds drive the digits).
    `apad=whole_dur=${n(cutLength(cut))}`,
    `atrim=duration=${n(cutLength(cut))}`,
    tail,
  ].join(',');
  return [...chains, `${mix}[out]`].join(';');
};

const inputs = (cut: Cut) => cut.layers.flatMap((l) => ['-i', l.path]);

/** The ffmpeg arguments for a cut, normalized with loudness already measured (linear: no pumping). */
export const ffmpegArgs = (cut: Cut, out: string, measured?: Record<string, string>): string[] => {
  const target = `I=${cut.lufs}:TP=-1.5:LRA=18`;
  const loud = measured
    ? `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
    : `loudnorm=${target}`;
  return ['-y', '-v', 'error', ...inputs(cut), '-filter_complex', graph(cut, loud), '-map', '[out]', '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', out];
};

/** Two passes: measure the mix's loudness, then bring it to the target with one constant gain. */
export const render = (cut: Cut, out: string): void => {
  const probe = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', ...inputs(cut), '-filter_complex', graph(cut, `loudnorm=I=${cut.lufs}:TP=-1.5:LRA=18:print_format=json`), '-map', '[out]', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const json = probe.stderr.slice(probe.stderr.lastIndexOf('{'), probe.stderr.lastIndexOf('}') + 1);
  const measured = json ? (JSON.parse(json) as Record<string, string>) : undefined;
  execFileSync('ffmpeg', ffmpegArgs(cut, out, measured), { stdio: 'inherit' });
};
