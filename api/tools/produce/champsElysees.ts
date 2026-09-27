/**
 * How the 10 km des Champs-Élysées sounds: for each line of the script, the file the runner
 * hears (the speaker over the start village, the Concorde, the park, a church bell, a crowd)
 * and the ambiance that plays under it (the village's DJ set, the drop at the gun, the drums up
 * the Champs, the descent music, the Golden km, the finish fanfare).
 *
 * The arc, in sound: a warm village, a countdown on a build, a drop and a roar at the gun, then
 * mostly the runner's own music with the speaker in their ear at the places that matter, the
 * climb of the Champs under drums, the descent under an anthem, the last kilometre on a piece
 * that never stops rising, and a fanfare at the line with the runner's name.
 */
import type { ScriptLine } from '@sivoov/shared';
import type { Cut, Layer } from './mix';
import { durationOf } from './mix';
import type { SourceId } from './sources';

export type Tools = {
  src: (id: SourceId) => Promise<string>;
  /** The speaker saying `text` in a `mood`; `take` for another reading. */
  say: (text: string, mood: Mood, take?: number) => Promise<string>;
};

export type LineProduction = { file?: Cut; under?: Cut };

/**
 * Where the speaker is (the scene, a place, never an instruction: the model sometimes says its
 * scene aloud, and a place read aloud is caught by the check while an instruction sounds like
 * narration) and how they speak there (added to the director's notes).
 */
export const MOODS = {
  pa: { scene: 'Sur la sono du village de départ, devant vingt mille coureurs.', style: 'Voix projetée, énergie de speaker, sourire dans la voix.' },
  count: { scene: 'Sur la sono du départ, pendant le compte à rebours.', style: 'Un seul chiffre, crié net et fort.' },
  ear: { scene: 'Dans les écouteurs d’un coureur, pendant sa course.', style: 'Proche, complice, posé, pas pressé.' },
  calm: { scene: 'Dans les écouteurs d’un coureur, dans un parc calme.', style: 'Doux, complice, presque à voix basse.' },
  hype: { scene: 'Dans les écouteurs d’un coureur, au milieu de la foule.', style: 'Grand moment : enthousiaste, la voix monte.' },
  finish: { scene: 'Sur la sono de la ligne d’arrivée, dans la clameur.', style: 'Explosion de joie, voix de fête.' },
} as const;
export type Mood = keyof typeof MOODS;

/** Lines with a produced file, how the speaker says them. The rest are said by the voice as written. */
const MOOD_OF: Record<string, Mood> = {
  'ceremony.welcome': 'pa',
  'ceremony.safety': 'pa',
  'ceremony.call': 'pa',
  'ceremony.word': 'pa',
  'ceremony.gun': 'pa',
  'course.concorde': 'ear',
  'course.madeleine': 'ear',
  'personal.split': 'ear',
  'course.monceau': 'calm',
  'course.lisbonne': 'ear',
  'course.half': 'hype',
  'course.rond-point': 'ear',
  'course.arc': 'hype',
  'course.montaigne': 'ear',
  'course.alma': 'ear',
  'course.golden': 'hype',
  'course.final': 'hype',
  'ceremony.line': 'finish',
  'ceremony.finish': 'finish',
};

export const moodOf = (lineId: string): Mood => MOOD_OF[lineId] ?? 'ear';

/** The words of the medal line, said inside the finish fanfare. */
export const MEDAL_LINE =
  'Votre médaille est la première des trois du Paris Masters Circuit. Rendez-vous au Trocadéro en septembre… et au pied de la tour Eiffel en décembre. Bravo, et à très vite !';

const COUNT = ['Dix !', 'Neuf !', 'Huit !', 'Sept !', 'Six !', 'Cinq !', 'Quatre !', 'Trois !', 'Deux !', 'Un !'];

/** Where the drop of `lyria-start` lands: the countdown rides the ten seconds before it, the gun starts on it. */
const DROP_AT = 45.0;

/** Loudness: a line the voice leads, the level of a raw Gemini render; an ambiance under a voice, ten decibels below. */
const VOICE_LUFS = -15;
const UNDER_LUFS = -25;

/** The speaker alone, with a breath before and after. */
const spoken = (path: string, fx: Layer['fx'], lufs = VOICE_LUFS, lead = 0.15): Cut => ({
  layers: [{ path, at: lead, fx }],
  length: lead + durationOf(path) + 0.35,
  lufs,
});

/** The speaker over a bed that fades in first and out after. */
const over = (path: string, fx: Layer['fx'], bed: Omit<Layer, 'at' | 'dur' | 'fadeIn' | 'fadeOut'>, lead = 1.2, tail = 1.8): Cut => {
  const v = durationOf(path);
  return {
    layers: [
      { ...bed, at: 0, dur: lead + v + tail, fadeIn: Math.min(lead, 1.5), fadeOut: tail },
      { path, at: lead, fx },
    ],
    lufs: VOICE_LUFS,
  };
};

export const produceChampsElysees = async (lines: ScriptLine[], t: Tools): Promise<Record<string, LineProduction>> => {
  const text = (id: string) => lines.find((l) => l.id === id)!.text;
  const say = (id: string, take?: number) => t.say(text(id), moodOf(id), take);
  const s = t.src;
  /** An ambiance that opens under its own line: held down while the line plays, then up. */
  const under = (cut: Cut, line: string, db = -8): Cut => ({ ...cut, duck: { until: 0.15 + durationOf(line), db } });
  // The personal finish call is rendered per runner: about this long.
  const CALL_S = 7.5;

  const village: Cut = {
    layers: [
      { path: await s('lyria-village'), from: 0, dur: 110, fx: 'far', gain: -2, fadeIn: 4, fadeOut: 8 },
      { path: await s('london-start'), from: 5, dur: 110, gain: 2, fadeIn: 2, fadeOut: 8 },
      { path: await s('french-crowd'), from: 0, dur: 100, gain: -5, fadeIn: 3, fadeOut: 8 },
    ],
    lufs: UNDER_LUFS + 1,
  };

  const numbers: string[] = [];
  for (const n of COUNT) numbers.push(await t.say(n, 'count'));
  const countdown: Cut = { layers: numbers.map((path, i) => ({ path, at: i + 0.05, fit: 0.9, fx: 'pa' as const })), length: 10, lufs: -14 };
  const build: Cut = {
    layers: [
      { path: await s('lyria-start'), from: DROP_AT - 10, dur: 10, fadeIn: 0.4 },
      { path: await s('crowd-build'), from: 8, dur: 10, gain: -4, fadeIn: 2 },
      { path: await s('london-start'), from: 60, dur: 10, gain: -6 },
    ],
    length: 10,
    lufs: -21,
  };

  const partez = await say('ceremony.gun');
  const gun: Cut = {
    layers: [
      { path: await s('air-horn'), from: 0, dur: 1.8, fadeOut: 0.4, gain: -2 },
      { path: partez, at: 0.2, fx: 'pa' },
    ],
    length: Math.max(2.2, 0.2 + durationOf(partez) + 0.3),
    lufs: -13,
  };
  const drop: Cut = {
    layers: [
      { path: await s('lyria-start'), from: DROP_AT, fadeOut: 6 },
      { path: await s('crowd-whistles'), from: 0, dur: 30, gain: 1, fadeOut: 8 },
      { path: await s('crowd-long'), from: 20, dur: 70, at: 4, gain: -2, fadeIn: 4, fadeOut: 20 },
      { path: await s('london-start'), from: 20, dur: 60, at: 20, gain: -4, fadeIn: 6, fadeOut: 15 },
    ],
    length: 80,
    lufs: -19,
  };

  const climb: Cut = {
    layers: [
      { path: await s('drums'), from: 0, dur: 100, gain: -2, fadeIn: 1.5, fadeOut: 10 },
      { path: await s('crowd-long'), from: 0, dur: 150, gain: 0, fadeIn: 2, fadeOut: 15 },
      { path: await s('london-cheers'), from: 0, dur: 110, at: 30, gain: -3, fadeIn: 5, fadeOut: 15 },
    ],
    length: 150,
    lufs: UNDER_LUFS + 2,
  };

  const descent: Cut = {
    layers: [
      { path: await s('lyria-descent'), fadeOut: 3 },
      { path: await s('crowd-whistles'), from: 0, dur: 34, gain: 2, fadeOut: 8 },
      { path: await s('crowd-long'), from: 60, dur: 70, at: 20, gain: -6, fadeIn: 5, fadeOut: 10 },
    ],
    lufs: -20,
  };

  const golden: Cut = {
    layers: [
      { path: await s('lyria-golden') },
      { path: await s('crowd-long'), from: 0, dur: 160, at: 20, gain: -10, fadeIn: 30, fadeOut: 5 },
      { path: await s('crowd-build'), from: 0, dur: 60, at: 118, gain: -4, fadeIn: 10, fadeOut: 6 },
    ],
    lufs: -22,
  };

  const home: Cut = {
    layers: [
      { path: await s('crowd-long'), from: 10, dur: 150, fadeIn: 2, fadeOut: 20 },
      { path: await s('london-cheers'), from: 0, dur: 111, gain: -2, fadeOut: 15 },
      { path: await s('crowd-whistles'), from: 0, dur: 34, gain: -4, fadeOut: 10 },
    ],
    length: 150,
    lufs: -21,
  };

  const lineCall = await say('ceremony.line');
  const theLine: Cut = {
    layers: [
      { path: await s('air-horn'), from: 0, dur: 1.4, fadeOut: 0.3, gain: -3 },
      { path: await s('crowd-burst-2'), from: 0, dur: 7, gain: 0, fadeOut: 2.5 },
      { path: lineCall, at: 0.9, fx: 'pa', gain: 4 },
    ],
    length: 7,
    lufs: -13,
  };

  const medal = await t.say(MEDAL_LINE, 'pa');
  const fanfare: Cut = {
    layers: [
      { path: await s('lyria-finish'), fadeOut: 4 },
      { path: await s('london-cheers'), from: 30, dur: 66, gain: -2, fadeIn: 0.5, fadeOut: 10 },
      { path: medal, at: 17, fx: 'ear', gain: 9 },
    ],
    lufs: -19,
  };

  /** The park: pigeons and the fountain come in before the voice and stay after it. */
  const park = async (path: string): Promise<Cut> => {
    const length = 2.5 + durationOf(path) + 3;
    return {
      layers: [
        { path: await s('pigeons'), from: 0, dur: length, gain: -8, fadeIn: 2, fadeOut: 3 },
        { path: await s('fountain'), from: 10, dur: length, gain: -20, fadeIn: 2.5, fadeOut: 3 },
        { path, at: 2.5, fx: 'ear' },
      ],
      lufs: -16,
    };
  };

  return {
    // The same voice in the produced lines and in the runner's own (raw) ones: no PA effect on speech.
    'ceremony.welcome': { file: spoken(await say('ceremony.welcome'), 'ear', -14), under: village },
    'ceremony.safety': { file: spoken(await say('ceremony.safety'), 'ear', -14) },
    'ceremony.call': { file: spoken(await say('ceremony.call'), 'ear', -14) },
    'ceremony.word': { file: spoken(await say('ceremony.word'), 'ear', -14) },
    'ceremony.countdown': { file: countdown, under: build },
    'ceremony.gun': { file: gun, under: drop },
    'course.concorde': { file: over(await say('course.concorde'), 'ear', { path: await s('french-crowd'), from: 40, gain: -14 }) },
    'course.madeleine': { file: over(await say('course.madeleine'), 'ear', { path: await s('french-crowd'), from: 70, gain: -16 }) },
    'personal.split': { file: spoken(await say('personal.split'), 'ear', -14) },
    'course.monceau': { file: await park(await say('course.monceau')) },
    'course.lisbonne': { file: spoken(await say('course.lisbonne'), 'ear') },
    'course.half': { file: over(await say('course.half'), 'ear', { path: await s('crowd-long'), from: 30, gain: -8 }, 2.2, 2.5) },
    'course.rond-point': { file: spoken(await say('course.rond-point'), 'ear'), under: under(climb, await say('course.rond-point')) },
    'course.arc': { file: spoken(await say('course.arc'), 'ear', -14), under: under(descent, await say('course.arc'), -6) },
    'course.montaigne': { file: over(await say('course.montaigne'), 'ear', { path: await s('applause'), from: 0, gain: -18 }) },
    'course.alma': { file: over(await say('course.alma'), 'ear', { path: await s('church-bells'), from: 30, gain: -9 }, 2.5, 2.5) },
    'course.golden': { file: spoken(await say('course.golden'), 'ear', -14), under: under(golden, await say('course.golden'), -10) },
    'course.final': { file: spoken(await say('course.final'), 'ear', -14), under: under(home, await say('course.final'), -6) },
    'ceremony.line': { file: theLine },
    'ceremony.finish': { file: spoken(await say('ceremony.finish'), 'ear', -14), under: { ...fanfare, duck: { until: CALL_S, db: -8, ramp: 2 } } },
  };
};

