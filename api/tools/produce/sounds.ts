/**
 * How the Champs-Élysées sound, line by line, for the 10 km and its 5 km demo (they share line
 * ids): what is mixed into a line's own file (`bed`: the village before « Bonjour Paris ! », the
 * horn under « Partez ! », the bells by the Seine) and the ambiance that starts under it and
 * outlasts it (`under`: the village, the drop at the gun, drums and the crowd up the Champs,
 * the hush before the Arc, the roar and the music at the U-turn, the Golden km, the finish).
 *
 * The arc in sound: a warm village, a countdown on a build with the crowd counting along, a drop
 * and a roar at the gun; then mostly the runner's own music, the speaker and two regulars in
 * their ear; the climb of the Champs under drums and a French crowd, thicker near the top, a
 * hush, the roar at the U-turn; the last kilometre on a piece that never stops rising; a fanfare
 * at the line. A line with an ambiance keeps its own file to the voice alone: the runner's own
 * version of it (rendered raw by the Worker) then sounds the same over the same ambiance.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE } from './assets';
import { shoutLayers } from './crowd';
import type { Cut, Layer } from './mix';
import { durationOf } from './mix';
import type { SourceId } from './sources';

export type Kit = {
  src: (id: SourceId) => Promise<string>;
  /** Gemini voices shouting « Allez ! » by the roadside (crowd.ts). */
  shouts: string[];
  /** The crowd counting « Trois ! Deux ! Un ! » along, five voices a number. */
  countAlong: string[][];
  /** The countdown's ten numbers, said by the speaker on the PA. */
  numbers: string[];
};

/** A line's sound: its file around the voice (`bed`), and the ambiance under it. */
export type Recipe = { bed?: (voice: string) => Promise<Cut>; under?: () => Promise<Cut> };

/** Loudness: a line the voice leads, the level of a raw Gemini render; an ambiance under a voice, about ten decibels below. */
const VOICE_LUFS = -15;
const UNDER_LUFS = -25;
/** Where the drop of `lyria-start` lands: the countdown rides the ten seconds before it, the gun starts on it. */
const DROP_AT = 45.0;

/** The voice alone, with a breath before and after: what every line is unless it says otherwise. */
export const spoken = (path: string, lufs = VOICE_LUFS): Cut => ({ layers: [{ path, at: 0.15, fx: 'ear' }], length: 0.15 + durationOf(path) + 0.35, lufs });

/** An ambiance that opens under its own line: held down while a voice of about `voiceS` plays, then up. */
const heldFor = (cut: Cut, voiceS: number, db = -8): Cut => ({ ...cut, duck: { until: voiceS, db } });

/** A heart at rest, synthesized: the hush before the Arc. */
const heartbeat = (): string => {
  const path = join(CACHE, 'sources', 'heartbeat.wav');
  if (!existsSync(path)) {
    const beat = '0.9*sin(2*PI*52*t)*exp(-22*mod(t,0.92))+0.6*sin(2*PI*46*t)*exp(-26*mod(t-0.26,0.92))*gte(mod(t,0.92),0.26)';
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${beat}':s=44100:d=30`, '-af', 'lowpass=f=180', path]);
  }
  return path;
};

export const recipesFor = async (k: Kit): Promise<Record<string, Recipe>> => {
  const s = k.src;
  const crowd = (o: { from: number; to: number; perMinute: number; seed: number; gain?: number }): Layer[] => shoutLayers(k.shouts, o);

  /** A swell of the French crowd, a few seconds: under a regular's shout. */
  const swell = async (): Promise<Cut> => ({
    layers: [{ path: await s('crowd-burst-2'), from: 2, dur: 7, gain: -6, fadeIn: 0.6, fadeOut: 3 }, ...crowd({ from: 0.3, to: 6, perMinute: 40, seed: 7, gain: -8 })],
    length: 7,
    lufs: UNDER_LUFS,
  });

  return {
    'ceremony.village': {
      // The village first: the DJ set down the avenue, the walla, then « Bonjour Paris ! ».
      bed: async (voice) => ({
        layers: [
          { path: await s('lyria-village'), from: 0, dur: 3 + durationOf(voice), fx: 'far', gain: -6, fadeIn: 0.4 },
          { path: await s('london-start'), from: 5, dur: 3 + durationOf(voice), gain: -4, fadeIn: 0.4 },
          { path: voice, at: 2.4, fx: 'pa' },
        ],
        lufs: -15,
      }),
      under: async () => ({
        layers: [
          { path: await s('lyria-village'), from: 3, dur: 100, fx: 'far', gain: -2, fadeOut: 8 },
          { path: await s('london-start'), from: 8, dur: 100, gain: 0, fadeOut: 8 },
          ...crowd({ from: 6, to: 95, perMinute: 6, seed: 1, gain: -14 }),
        ],
        lufs: UNDER_LUFS + 1,
      }),
    },
    'ceremony.countdown': {
      // The speaker's ten numbers, one a second; the crowd joins on the last three.
      bed: async () => ({
        layers: [
          ...k.numbers.map((path, i) => ({ path, at: i + 0.05, fit: 0.9, fx: 'pa' as const })),
          ...k.countAlong.flatMap((voices, n) => voices.map((path, v) => ({ path, at: 7.05 + n + v * 0.04, fit: 0.9, fx: 'far' as const, gain: -9 - v }))),
        ],
        length: 10,
        lufs: -14,
      }),
      under: async () => ({
        layers: [
          { path: await s('lyria-start'), from: DROP_AT - 10, dur: 10, fadeIn: 0.4 },
          { path: await s('crowd-build'), from: 8, dur: 10, gain: -4, fadeIn: 2 },
        ],
        length: 10,
        lufs: -21,
      }),
    },
    'ceremony.gun': {
      bed: async (voice) => ({
        layers: [
          { path: await s('air-horn'), from: 0, dur: 1.8, fadeOut: 0.4, gain: -2 },
          { path: voice, at: 0.2, fx: 'pa' },
        ],
        length: Math.max(2.2, 0.2 + durationOf(voice) + 0.3),
        lufs: -13,
      }),
      under: async () => ({
        layers: [
          { path: await s('lyria-start'), from: DROP_AT, fadeOut: 6 },
          { path: await s('crowd-whistles'), from: 0, dur: 30, gain: 1, fadeOut: 8 },
          { path: await s('crowd-long'), from: 20, dur: 60, at: 4, gain: -3, fadeIn: 4, fadeOut: 20 },
          ...crowd({ from: 1, to: 40, perMinute: 30, seed: 2, gain: -6 }),
        ],
        length: 70,
        lufs: -19,
      }),
    },
    'course.monceau': {
      // The park leads: birds, the fountain, before the voice and after it.
      under: async () => ({
        layers: [
          { path: await s('pigeons'), from: 0, dur: 35, gain: -6, fadeIn: 2, fadeOut: 5 },
          { path: await s('fountain'), from: 10, dur: 35, gain: -16, fadeIn: 3, fadeOut: 5 },
        ],
        lufs: UNDER_LUFS,
      }),
    },
    'course.rond-point': {
      // Up the Champs: drums, the roar, a French crowd shouting all the way.
      under: async () =>
        heldFor(
          {
            layers: [
              { path: await s('drums'), from: 0, dur: 100, gain: -3, fadeIn: 1.5, fadeOut: 10 },
              { path: await s('crowd-long'), from: 0, dur: 150, gain: -2, fadeIn: 2, fadeOut: 15 },
              ...crowd({ from: 4, to: 140, perMinute: 22, seed: 3, gain: -4 }),
            ],
            length: 150,
            lufs: UNDER_LUFS + 2,
          },
          9,
        ),
    },
    'course.cobbles': {
      // Near the top the crowd thickens, then thins out into the hush.
      under: async () =>
        heldFor(
          {
            layers: [
              { path: await s('crowd-build'), from: 10, dur: 55, gain: -2, fadeIn: 2, fadeOut: 12 },
              { path: await s('drums'), from: 40, dur: 55, gain: -6, fadeOut: 12 },
              ...crowd({ from: 2, to: 45, perMinute: 34, seed: 4, gain: -3 }),
            ],
            length: 55,
            lufs: UNDER_LUFS + 2,
          },
          6,
        ),
    },
    'course.hush': {
      // The break before the drop: a heart, the drums far away.
      under: async () => ({
        layers: [
          { path: heartbeat(), from: 0, dur: 25, gain: 0, fadeIn: 1, fadeOut: 4 },
          { path: await s('drums'), from: 60, dur: 25, fx: 'far', gain: -16, fadeIn: 2, fadeOut: 4 },
        ],
        lufs: UNDER_LUFS - 2,
      }),
    },
    'course.arc': {
      // The U-turn: the roar, and the music flips over.
      under: async () =>
        heldFor(
          {
            layers: [
              { path: await s('lyria-descent'), fadeOut: 3 },
              { path: await s('crowd-whistles'), from: 0, dur: 34, gain: 2, fadeOut: 8 },
              { path: await s('crowd-long'), from: 60, dur: 70, at: 20, gain: -6, fadeIn: 5, fadeOut: 10 },
              ...crowd({ from: 0.5, to: 30, perMinute: 40, seed: 5, gain: -4 }),
            ],
            lufs: -20,
          },
          8,
          -6,
        ),
    },
    'crowd.descent': { under: swell },
    'crowd.martine': { under: swell },
    'crowd.club': { under: swell },
    'course.alma': {
      // A Paris church bell across the water.
      bed: async (voice) => ({
        layers: [
          { path: await s('church-bells'), from: 30, dur: 2.5 + durationOf(voice) + 2.5, gain: -11, fadeIn: 1.5, fadeOut: 2.5 },
          { path: voice, at: 2.5, fx: 'ear' },
        ],
        lufs: VOICE_LUFS,
      }),
    },
    'course.golden': {
      // The last kilometre: a piece that never stops rising, the crowd building with it.
      under: async () =>
        heldFor(
          {
            layers: [
              { path: await s('lyria-golden') },
              { path: await s('crowd-long'), from: 0, dur: 160, at: 20, gain: -10, fadeIn: 30, fadeOut: 5 },
              { path: await s('crowd-build'), from: 0, dur: 60, at: 118, gain: -4, fadeIn: 10, fadeOut: 6 },
              ...crowd({ from: 90, to: 175, perMinute: 26, seed: 6, gain: -8 }),
            ],
            lufs: -22,
          },
          10,
          -10,
        ),
    },
    'course.final': {
      under: async () =>
        heldFor(
          {
            layers: [
              { path: await s('crowd-long'), from: 10, dur: 120, fadeIn: 2, fadeOut: 20 },
              { path: await s('crowd-whistles'), from: 0, dur: 34, gain: -4, fadeOut: 10 },
              ...crowd({ from: 1, to: 60, perMinute: 36, seed: 8, gain: -4 }),
            ],
            length: 120,
            lufs: -21,
          },
          4,
          -6,
        ),
    },
    'ceremony.line': {
      bed: async (voice) => ({
        layers: [
          { path: await s('air-horn'), from: 0, dur: 1.4, fadeOut: 0.3, gain: -3 },
          { path: await s('crowd-burst-2'), from: 0, dur: 7, gain: 0, fadeOut: 2.5 },
          { path: voice, at: 0.9, fx: 'pa', gain: 4 },
        ],
        length: 7,
        lufs: -13,
      }),
    },
    'ceremony.finish': {
      // The fanfare, held down under the runner's name and time, then up; the words after the line ride on it.
      under: async () => ({
        layers: [
          { path: await s('lyria-finish'), fadeOut: 4 },
          { path: await s('crowd-burst-2'), from: 5, dur: 30, gain: -4, fadeIn: 0.5, fadeOut: 10 },
          ...crowd({ from: 0.5, to: 25, perMinute: 30, seed: 9, gain: -8 }),
        ],
        lufs: -19,
        duck: { until: 8, db: -8, ramp: 2 },
      }),
    },
  };
};
