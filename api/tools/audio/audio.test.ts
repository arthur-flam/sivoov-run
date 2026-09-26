import { describe, expect, it } from 'vitest';
import { AudioPackSchema, buildScript, ceremonySequence, nextEvents } from '@sivoov/shared';
import { loadScript } from './script';
import { mapLimit, sha256 } from './tts';
import { manifestFor, upsertSql } from './upload';

describe('deauville 2026 marathon script', () => {
  it('builds valid AudioEvents with a ceremony, landmarks, splits and a finish', async () => {
    const script = await loadScript('deauville-2026-marathon');
    const kinds = script.events.map((e) => e.trigger.kind);
    expect(kinds.at(-1)).toBe('finish');
    const landmarks = script.events.filter((e) => e.trigger.kind === 'distance');
    expect(landmarks.length).toBeGreaterThanOrEqual(6);
    expect(landmarks.length).toBeLessThanOrEqual(10);
    expect(script.events.find((e) => e.id === 'personal.split')?.source).toEqual({ kind: 'template', key: 'split', slots: ['km', 'splitTime'] });
    expect(script.events.every((e) => e.source.kind === 'template' || e.source.key.endsWith('.mp3'))).toBe(true);
  });
  it('plays its start ceremony before the clock: intro, countdown, then the gun that starts it', async () => {
    const script = await loadScript('deauville-2026-marathon');
    const ceremony = ceremonySequence(script);
    expect(ceremony?.lines.map((e) => e.id)).toEqual(['ceremony.intro', 'ceremony.countdown', 'ceremony.gun']);
    expect(ceremony?.gunIndex).toBe(2);
    // Nothing of the ceremony is left to fire once the clock runs.
    const atGun = nextEvents({ phase: 'running', distanceM: 0, elapsedMs: 0, paceSecPerKm: null }, script, new Set());
    expect(atGun.filter((f) => f.event.category === 'ceremony')).toEqual([]);
  });
  it('refuses duplicate ids', () => {
    const line = { id: 'x', title: 'x', category: 'course', mix: 'duck', priority: 5, trigger: { kind: 'start' }, key: 'x', text: 'x' } as const;
    expect(() => buildScript({ courseId: 'c', version: 1, voice: { id: 'v', name: 'v', model: 'm' }, lines: [line, line] })).toThrow(/duplicate/);
  });
});

describe('manifest and upsert', () => {
  it('produces a valid AudioPack with R2 keys as urls and an idempotent SQL upsert', async () => {
    const script = await loadScript('deauville-2026-marathon');
    const rendered = [{ key: 'ceremony-intro.mp3', path: '/tmp/x.mp3', bytes: 12, sha256: sha256('x') }];
    const pack = manifestFor(script, rendered);
    expect(AudioPackSchema.safeParse(pack).success).toBe(true);
    expect(pack.files['ceremony-intro.mp3']?.url).toBe('packs/deauville-2026-marathon/1/ceremony-intro.mp3');
    const sql = upsertSql(pack);
    expect(sql).toContain("ON CONFLICT(course_id, version, locale)");
    expect(sql).toContain("'deauville-2026-marathon/1/fr'");
  });
});

describe('mapLimit', () => {
  it('keeps order and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(3);
  });
});
