import { describe, expect, it } from 'vitest';
import { batteryLine, createBatteryLog, isLow } from './batteryLog';
import type { PowerReading } from './batteryLog';

const reading = (level: number, extra: Partial<PowerReading> = {}): PowerReading => ({ level, charging: false, lowPower: false, ...extra });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const rig = (levels: number[]) => {
  const lines: string[] = [];
  const clock = { t: 0 };
  const queue = [...levels];
  const log = createBatteryLog({
    read: async () => reading(queue.shift() ?? -1),
    log: (m) => lines.push(m),
    now: () => clock.t,
  });
  return { log, lines, clock };
};

describe('battery logbook', () => {
  it('says the level, and what changes its meaning', () => {
    expect(batteryLine('start', reading(0.604))).toBe('start: 60 %');
    expect(batteryLine('run', reading(0.3, { charging: true, lowPower: true, optimized: true }))).toBe(
      'run: 30 %, charging, power saving on, battery optimization on',
    );
    expect(batteryLine('stop', reading(-1))).toBe('stop: level unknown');
  });

  it('reads at the start, every five minutes of fixes, and at the stop', async () => {
    const { log, lines, clock } = rig([0.6, 0.57, 0.55, 0.52]);
    log.due();
    expect(lines).toEqual([]);
    await log.start();
    clock.t = 4 * 60_000;
    log.due();
    clock.t = 5 * 60_000;
    log.due();
    await flush();
    clock.t = 9 * 60_000;
    log.due();
    clock.t = 10 * 60_000;
    log.due();
    await flush();
    await log.stop();
    expect(lines).toEqual(['start: 60 %', 'run: 57 %', 'run: 55 %', 'stop: 52 %']);
  });

  it('reads nothing between runs', async () => {
    const { log, lines, clock } = rig([0.9, 0.8]);
    await log.start();
    await log.stop();
    clock.t = 60 * 60_000;
    log.due();
    await log.stop();
    expect(lines).toEqual(['start: 90 %', 'stop: 80 %']);
  });

  it('writes a line and carries on when the battery cannot be read', async () => {
    const lines: string[] = [];
    const log = createBatteryLog({ read: () => Promise.reject(new Error('no battery')), log: (m) => lines.push(m), now: () => 0 });
    await expect(log.start()).resolves.toBeUndefined();
    expect(lines).toEqual(['start: unreadable (no battery)']);
  });

  it('gives up on a reading that never comes, so neither the start nor the finish waits on it', async () => {
    const lines: string[] = [];
    const log = createBatteryLog({ read: () => new Promise(() => undefined), log: (m) => lines.push(m), now: () => 0, timeoutMs: 10 });
    await log.start();
    expect(lines).toEqual(['start: unreadable (no answer in 10 ms)']);
  });

  it('hands every reading on, so the run can spare a phone that runs low', async () => {
    const seen: PowerReading[] = [];
    const log = createBatteryLog({ read: async () => reading(0.18), log: () => undefined, onReading: (r) => seen.push(r), now: () => 0 });
    await log.start();
    expect(seen).toEqual([reading(0.18)]);
  });
});

describe('a phone short of battery', () => {
  it('is one at 20 % or under, off the charger', () => {
    expect(isLow(reading(0.2))).toBe(true);
    expect(isLow(reading(0.21))).toBe(false);
    expect(isLow(reading(0.1, { charging: true }))).toBe(false);
  });

  it('is one whenever power saving is on, whatever the level', () => {
    expect(isLow(reading(0.8, { lowPower: true }))).toBe(true);
  });

  it('is not one when the phone does not say', () => {
    expect(isLow(reading(-1))).toBe(false);
  });
});
