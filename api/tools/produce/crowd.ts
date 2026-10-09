/**
 * A French crowd. The archive's crowds are stadiums with no words, or English rooms; a Paris
 * race needs people shouting « Allez ! » in French. So the crowd is made: a dozen Gemini voices
 * (men and women, young and old) each shouting a few short encouragements by the roadside,
 * scattered over a stretch of time and set back in the mix, over a wordless roar.
 * Deterministic: the same seed places the same shouts, so a mix can be made again.
 */
import { GEMINI_TTS_FALLBACK, GEMINI_TTS_MODEL } from '@sivoov/shared';
import { mapLimit } from '../../src/lib/mapLimit';
import type { Layer } from './mix';
import { durationOf } from './mix';

/** Who shouts: Google's voices, men and women (ai.google.dev, speech generation). */
const SHOUTERS = ['Puck', 'Fenrir', 'Orus', 'Algenib', 'Kore', 'Laomedeia', 'Gacrux', 'Zephyr', 'Aoede', 'Achird', 'Autonoe', 'Umbriel'];
const SHOUTS = ['Allez ! Allez ! Allez !', 'Allez les coureurs !', 'Bravo ! Bravo !', 'Allez, allez, allez, allez !', 'Courage !', 'Vas-y ! Vas-y !'];
const DIRECTION = 'Un spectateur dans la foule, au bord de la route, qui crie de toutes ses forces pour encourager les coureurs qui passent. Spontané, joyeux.';
const SCENE = 'Au bord de la route, dans la foule, au passage des coureurs.';
/** The crowd is texture: the lighter model, whose quota is its own (10 requests a minute a model on our key), leaves the speaker's to the speaker. */
const MODEL = GEMINI_TTS_FALLBACK[GEMINI_TTS_MODEL]!;

export type Say = (voice: { id: string; name: string; model: string; direction: string; scene: string }, text: string) => Promise<string>;

/** Every voice shouting every encouragement, rendered once and cached. */
export const shoutsOf = (say: Say): Promise<string[]> =>
  mapLimit(
    SHOUTERS.flatMap((id) => SHOUTS.map((text) => ({ id, text }))),
    4,
    ({ id, text }) => say({ id, name: id, model: MODEL, direction: DIRECTION, scene: SCENE }, text),
  );

/** The crowd counting the last three along with the speaker: five voices on each number. */
export const countAlongOf = async (say: Say): Promise<string[][]> => {
  const numbers = ['Trois !', 'Deux !', 'Un !'];
  const voices = SHOUTERS.slice(0, 5);
  const direction = 'Un spectateur dans la foule du départ qui compte à rebours avec le speaker, à pleine voix.';
  const said = await mapLimit(numbers.flatMap((n) => voices.map((id) => ({ id, n }))), 4, ({ id, n }) =>
    say({ id, name: id, model: MODEL, direction, scene: 'Dans la foule du village de départ.' }, n),
  );
  return numbers.map((_, i) => said.slice(i * voices.length, (i + 1) * voices.length));
};

/** A small deterministic generator: the same seed, the same crowd. */
const random = (seed: number) => {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4_294_967_296;
  };
};

/**
 * Shouts scattered from `from` to `to` seconds, about `perMinute` of them a minute, set back in
 * the crowd (the `far` effect, quieter the further back), never two of the same voice at once.
 */
export const shoutLayers = (shouts: string[], o: { from: number; to: number; perMinute: number; seed: number; gain?: number }): Layer[] => {
  const next = random(o.seed);
  const count = Math.round(((o.to - o.from) / 60) * o.perMinute);
  return Array.from({ length: count }, (_, i) => {
    const path = shouts[Math.floor(next() * shouts.length)]!;
    const at = o.from + ((i + next()) / count) * (o.to - o.from);
    const near = next();
    return { path, at: Math.min(at, Math.max(o.from, o.to - durationOf(path))), gain: (o.gain ?? -10) - (1 - near) * 10, fx: near > 0.7 ? undefined : ('far' as const) };
  });
};
