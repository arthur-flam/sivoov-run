import { describe, expect, it } from 'vitest';
import { deauvilleMarathonGeometry } from '../fixtures';
import { RunJournalSchema } from '../schemas/runJournal';
import type { RunJournal } from '../schemas/runJournal';
import { buildTrack } from './course';
import { journalLine, MAX_RUN_MS, orphanFixes, parseJournalSamples, recoveryFor, replayRun, RESUME_WITHIN_MS } from './runJournal';
import { constantPace, simulateRun } from './simulate';
import { applySample, idleRun, startRun } from './tracker';

const track = buildTrack(deauvilleMarathonGeometry.points);
const GUN = 1_000_000;
/** A 10 km at 5:00/km with realistic noise: one fix a second. */
const samples = simulateRun({ track, targetM: 10_500, pace: constantPace(300), startTime: GUN, noiseM: 4, seed: 7 });
const journal = (over: Partial<RunJournal> = {}): RunJournal =>
  RunJournalSchema.parse({ version: 1, runId: 'r1', entrantId: 'e1', courseId: 'c1', targetM: 10_000, startedAt: GUN, updatedAt: GUN, fired: [], ...over });
const live = (upTo: number) => samples.slice(0, upTo).reduce((s, sample) => applySample(s, sample), startRun(idleRun(10_000), GUN));
const file = (list: typeof samples) => list.map(journalLine).join('');

describe('a run kept on the phone while it happens', () => {
  it('comes back from its journal exactly as the app had it: same distance, same splits', () => {
    const atKm3 = samples.findIndex((s) => s.timestamp >= GUN + 15 * 60_000);
    const replayed = replayRun(journal(), parseJournalSamples(file(samples.slice(0, atKm3))));
    const kept = live(atKm3);
    expect(replayed.distanceM).toBe(kept.distanceM);
    expect(replayed.splits).toEqual(kept.splits);
    expect(replayed.startedAt).toBe(GUN);
  });

  it('drops the half line a process killed mid-write leaves, and a fix written twice', () => {
    const text = `${file(samples.slice(0, 10))}${journalLine(samples[9]!)}{"lat":49.3,"lng":0.0`;
    const parsed = parseJournalSamples(text);
    expect(parsed).toHaveLength(10);
    expect(parsed.map((s) => s.timestamp)).toEqual(samples.slice(0, 10).map((s) => s.timestamp));
  });

  it('puts fixes back in time order: a batch the background task wrote late still counts', () => {
    const shuffled = [...samples.slice(100, 200), ...samples.slice(0, 100)];
    expect(replayRun(journal(), parseJournalSamples(file(shuffled))).distanceM).toBe(live(200).distanceM);
  });
});

describe('what the app does with a run it finds when it starts', () => {
  const upTo = samples.findIndex((s) => s.timestamp >= GUN + 20 * 60_000);
  const lastFix = samples[upTo - 1]!.timestamp;

  it('offers to carry on when the phone went dark minutes ago (a crash, a restart)', () => {
    const recovery = recoveryFor(journal({ updatedAt: lastFix }), samples.slice(0, upTo), lastFix + 3 * 60_000);
    expect(recovery.kind).toBe('resume');
    expect(recovery.state.phase).toBe('running');
    expect(recovery.state.distanceM).toBeGreaterThan(3800);
  });

  it('carries on after an hour and a half dark: only the runner stops a run', () => {
    expect(recoveryFor(journal({ updatedAt: lastFix }), samples.slice(0, upTo), lastFix + 90 * 60_000).kind).toBe('resume');
  });

  it('closes a run silent for over two hours: it is uploaded as it stands', () => {
    expect(recoveryFor(journal({ updatedAt: lastFix }), samples.slice(0, upTo), lastFix + RESUME_WITHIN_MS + 1).kind).toBe('close');
  });

  it('closes a run the runner had stopped, even seconds ago', () => {
    expect(recoveryFor(journal({ updatedAt: lastFix, stoppedAt: lastFix }), samples.slice(0, upTo), lastFix + 1000).kind).toBe('close');
  });

  it('closes a run whose fixes reached the finish, as a finish', () => {
    const recovery = recoveryFor(journal(), samples, samples[samples.length - 1]!.timestamp + 1000);
    expect(recovery.kind).toBe('close');
    expect(recovery.state.phase).toBe('finished');
    expect(recovery.state.distanceM).toBe(10_000);
  });

  it('never resumes a run started more than a day of running ago', () => {
    expect(recoveryFor(journal({ updatedAt: GUN + MAX_RUN_MS }), [], GUN + MAX_RUN_MS + 1).kind).toBe('close');
  });

  it('bridges the minutes the phone was dark with a straight line, as long as a runner could have covered it', () => {
    const before = samples.slice(0, upTo);
    // Six minutes dark, then the fixes pick up where the runner is now.
    const after = samples.filter((s) => s.timestamp >= lastFix + 6 * 60_000);
    const resumed = replayRun(journal(), [...before, ...after.slice(0, 60)]);
    const uninterrupted = live(upTo + 6 * 60 + 60);
    // A straight line cuts the corners the runner took in the dark: a little short, never long.
    expect(resumed.distanceM).toBeLessThanOrEqual(uninterrupted.distanceM + 10);
    expect(resumed.distanceM).toBeGreaterThan(uninterrupted.distanceM * 0.97);
  });
});

describe('fixes that arrive while the app is gone', () => {
  it('are kept for a run still going, so it comes back with the kilometres run meanwhile', () => {
    expect(orphanFixes(journal(), GUN + 60 * 60_000)).toBe('keep');
  });

  it('switch the GPS off when no run is waiting for them: no journal, a stopped run, a run from yesterday', () => {
    expect(orphanFixes(null, GUN)).toBe('stop');
    expect(orphanFixes(journal({ stoppedAt: GUN + 1000 }), GUN + 2000)).toBe('stop');
    expect(orphanFixes(journal(), GUN + MAX_RUN_MS)).toBe('stop');
  });
});
