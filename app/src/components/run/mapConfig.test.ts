import { describe, expect, it } from 'vitest';
import { CAMERA_STEP_MS, GLIDE_MS, MOVE_MS, STALE_MS, SWING_MS, TURN_MS, basemapConfig, focusOf, jumpShot, nextCameraPlan, normalizeTurn } from './mapConfig';
import type { Pose } from './mapConfig';

/** A runner going due north at 5 m/s, the course's way 350° from north. */
const at = (ms: number): Pose => ({ center: { lat: 48.87 + (5 * ms) / 1000 / 111_320, lng: 2.3 }, bearing: 350 });
const bounds = { ne: [2.32, 48.88] as [number, number], sw: [2.28, 48.86] as [number, number] };
const latOf = (shot: { kind: string; center?: [number, number] }) => shot.center![1];

describe('the run map’s camera', () => {
  it('flies to a new view slowly, then moves once a second to where the runner will be', () => {
    const first = nextCameraPlan(null, 'follow', at, bounds, 0);
    expect(first.shot).toMatchObject({ kind: 'follow', mode: 'fly', durationMs: MOVE_MS, bearing: 350 });
    expect(nextCameraPlan(first, 'follow', at, bounds, 1000)).toBe(first);
    const step = nextCameraPlan(first, 'follow', at, bounds, MOVE_MS);
    expect(step.shot).toMatchObject({ mode: 'linear', durationMs: CAMERA_STEP_MS });
    expect(latOf(step.shot)).toBeCloseTo(latOf({ kind: 'follow', center: [2.3, at(CAMERA_STEP_MS).center.lat] }), 9);
    // Nothing new until that move is done: the map carries it out alone, evenly.
    expect(nextCameraPlan(step, 'follow', at, bounds, MOVE_MS + 500)).toBe(step);
    expect(nextCameraPlan(step, 'follow', at, bounds, MOVE_MS + CAMERA_STEP_MS - GLIDE_MS)).not.toBe(step);
  });

  it('goes straight to the runner when the app comes back, instead of moving across town from where it was left', () => {
    const first = nextCameraPlan(null, 'follow', at, bounds, 0);
    const step = nextCameraPlan(first, 'follow', at, bounds, MOVE_MS);
    const later = (ms: number) => ({ ...at(ms), center: { lat: 49.4, lng: 0.1 } });
    const back = nextCameraPlan(step, 'follow', later, bounds, step.until + STALE_MS + 1);
    expect(back.shot).toMatchObject({ kind: 'follow', mode: 'linear', durationMs: 0, center: [0.1, 49.4] });
    // Then the steady moves carry on from there.
    expect(nextCameraPlan(back, 'follow', later, bounds, back.until + GLIDE_MS).shot).toMatchObject({ mode: 'linear', durationMs: CAMERA_STEP_MS });
  });

  it('settles a turn let go of at once, on top of the course’s way, and keeps it', () => {
    const first = nextCameraPlan(null, 'follow', at, bounds, 0);
    const turned = nextCameraPlan(first, 'follow', at, bounds, 100, { turn: 15 });
    expect(turned.shot).toMatchObject({ mode: 'ease', durationMs: TURN_MS, bearing: 5 });
    expect(nextCameraPlan(turned, 'follow', () => ({ ...at(0), bearing: 10 }), bounds, 5000, { turn: 15 }).shot).toMatchObject({ mode: 'linear', bearing: 25 });
  });

  it('swings back to the course’s way visibly, not in a blink', () => {
    const turned = nextCameraPlan(nextCameraPlan(null, 'follow', at, bounds, 0), 'follow', at, bounds, 5000, { turn: 90 });
    const reset = nextCameraPlan(turned, 'follow', at, bounds, 6000, { turn: 0 });
    expect(reset.shot).toMatchObject({ mode: 'ease', durationMs: SWING_MS, bearing: 350 });
    expect(nextCameraPlan(reset, 'follow', at, bounds, 6300, { turn: 0 })).toBe(reset);
  });

  it('turns the whole course too, from north', () => {
    const overview = nextCameraPlan(null, 'overview', at, bounds, 0);
    expect(overview.shot).toMatchObject({ kind: 'overview', bearing: 0 });
    expect(nextCameraPlan(overview, 'overview', at, bounds, 100)).toBe(overview);
    expect(nextCameraPlan(overview, 'overview', at, bounds, 100, { turn: -30 }).shot).toMatchObject({ kind: 'overview', mode: 'ease', bearing: 330 });
  });

  it('puts the camera under the finger at once while it turns the map', () => {
    expect(jumpShot('follow', at(0), bounds, 40)).toMatchObject({ kind: 'follow', durationMs: 0, bearing: 30 });
  });

  it('turns around the runner, low in the picture, or the middle of the whole course', () => {
    expect(focusOf('follow', 400, 500)).toEqual({ x: 200, y: 220 + (500 - 244) / 2 });
    expect(focusOf('overview', 400, 500)).toEqual({ x: 200, y: 64 + (500 - 88) / 2 });
  });

  it('keeps a turn within half a circle either way', () => {
    expect(normalizeTurn(190)).toBe(-170);
    expect(normalizeTurn(-190)).toBe(170);
    expect(normalizeTurn(180)).toBe(180);
    expect(normalizeTurn(-180)).toBe(180);
  });

  it('leaves out house numbers at a runner’s eye level, keeps the towns over the whole course', () => {
    expect(basemapConfig('day', 'follow').showPlaceLabels).toBe(false);
    expect(basemapConfig('day', 'overview').showPlaceLabels).toBe(true);
  });
});
