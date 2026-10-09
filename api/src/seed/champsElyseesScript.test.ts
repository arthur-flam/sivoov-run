import { describe, expect, it } from 'vitest';
import { buildScript, ceremonySequence, duplicateFileKeys, hearRun, lineIssues, manifestFor, speechSeconds, voiceFormat, voicingsOf } from '@sivoov/shared';
import type { AudioScriptInput, BuiltScript, RunPlan } from '@sivoov/shared';
import { champsElysees2027Script, champsElysees5kScript } from './champsElyseesScript';

/** The pack as publishing makes it, each file as long as its words take to say (the produced ones are close). */
const packOf = (built: BuiltScript) =>
  manifestFor(
    built,
    built.lines.flatMap((l) => voicingsOf(l, voiceFormat(built.voice)).map((v) => ({ key: v.fileKey, bytes: 1, sha256: 'x', seconds: speechSeconds(v.text) }))),
  );

const everything = (s: AudioScriptInput) =>
  buildScript(s).lines.flatMap((l) => voicingsOf(l).flatMap((v) => [v.text, v.personal?.kind === 'template' ? v.personal.template : ''])).join('\n');

const courses = [
  { name: 'the 10 km', script: champsElysees2027Script, targetM: 10_000, names: 14, beforeCountdownS: 35 },
  { name: 'the 5 km demo', script: champsElysees5kScript, targetM: 5000, names: 9, beforeCountdownS: 20 },
];

describe.each(courses)('$name', ({ script, targetM, names, beforeCountdownS }) => {
  const built = buildScript(script);
  const pack = packOf(built);

  it('can be published as written: nothing to fix, no file written twice', () => {
    expect(built.lines.flatMap((l) => lineIssues(l).map((i) => `${l.id}: ${i.code}`))).toEqual([]);
    expect(duplicateFileKeys(built.lines)).toEqual([]);
  });

  it('says the runner’s name often, by the speaker and by the crowd', () => {
    const placed = built.lines.filter((l) => l.trigger.kind !== 'filler' && l.personal?.kind === 'template' && l.personal.template.includes('{prenom}'));
    expect(placed.length).toBeGreaterThanOrEqual(names);
    expect(built.lines.filter((l) => l.voice && l.voice.id !== built.voice.id).length).toBeGreaterThanOrEqual(2);
  });

  it('never assumes the runner’s gender', () => {
    expect(everything(script)).not.toMatch(/\b(prêt|prête|venu|venue|fatigué|fatiguée|prêts)\b/i);
  });

  it('gets to the countdown fast', () => {
    const ceremony = ceremonySequence(pack)!;
    const before = ceremony.lines.slice(0, ceremony.countdownIndex!).reduce((s, l) => s + speechSeconds(built.lines.find((x) => x.id === l.id)!.text) + 0.5, 0);
    expect(before).toBeLessThanOrEqual(beforeCountdownS);
  });

  it('places every line on the course', () => {
    built.lines.forEach((l) => {
      if (l.trigger.kind === 'distance') expect(l.trigger.meters).toBeLessThan(targetM);
    });
  });

  // The density check (PRODUCTION.md, "Testing what we make"): from 4:00 to 8:00/km, with a stop and a walk.
  it.each<[string, RunPlan]>([
    ['4:00/km', { paceSecPerKm: 240 }],
    ['5:30/km', { paceSecPerKm: 330 }],
    ['7:00/km', { paceSecPerKm: 420 }],
    ['8:00/km with a stop and a walk', { paceSecPerKm: 480, stops: [{ atM: targetM * 0.3, seconds: 60 }], walks: [{ atM: targetM * 0.7, seconds: 60 }] }],
  ])('never stays quiet longer than %s allows', (_, plan) => {
    const heard = hearRun(pack, targetM, plan);
    const maxGapS = pack.maxGapS!;
    let end = 0;
    const longest = heard.reduce((worst, h) => {
      const quiet = h.elapsedMs / 1000 - end;
      end = Math.max(end, h.elapsedMs / 1000 + h.seconds);
      return Math.max(worst, quiet);
    }, 0);
    // A stop or a walk is the runner's own silence: the plan's 60 s each, at most.
    expect(longest).toBeLessThanOrEqual(maxGapS + (plan.stops || plan.walks ? 75 : 1));
    expect(heard[heard.length - 1]!.eventId).toBe('ceremony.after');
  });

  it('never says the same take twice while the pool has others, even at 8:00/km', () => {
    const heard = hearRun(pack, targetM, { paceSecPerKm: 480 });
    const said = (id: string) => heard.filter((h) => h.eventId === id).map((h) => h.take ?? '');
    ['crowd.martine', 'crowd.club', 'speaker.companion'].forEach((id) => {
      const takes = said(id);
      expect(new Set(takes).size).toBe(takes.length);
    });
  });
});
