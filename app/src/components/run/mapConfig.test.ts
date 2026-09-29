import { describe, expect, it } from 'vitest';
import { GLIDE_MS, MOVE_MS, SWING_MS, TURN_MS, glideMsFor, nextCameraPlan, normalizeTurn } from './mapConfig';

const here = { center: { lat: 48.87, lng: 2.3 }, bearing: 350 };
const bounds = { ne: [2.32, 48.88] as [number, number], sw: [2.28, 48.86] as [number, number] };

describe('the run map’s camera', () => {
  it('flies to a new view slowly, then glides with the runner', () => {
    const first = nextCameraPlan(null, 'follow', here, bounds, 0);
    expect(first.shot).toMatchObject({ kind: 'follow', mode: 'fly', durationMs: MOVE_MS, bearing: 350 });
    expect(nextCameraPlan(first, 'follow', here, bounds, 1000)).toBe(first);
    expect(nextCameraPlan(first, 'follow', here, bounds, MOVE_MS).shot).toMatchObject({ mode: 'linear', durationMs: GLIDE_MS });
  });

  it('glides a simulation in shorter steps, over the time between them', () => {
    const first = nextCameraPlan(null, 'follow', here, bounds, 0);
    expect(nextCameraPlan(first, 'follow', here, bounds, MOVE_MS, { glideMs: glideMsFor(5) }).shot).toMatchObject({ mode: 'linear', durationMs: 100 });
    expect(glideMsFor(1)).toBe(GLIDE_MS);
  });

  it('turns with the runner’s finger at once, on top of the course’s way', () => {
    const first = nextCameraPlan(null, 'follow', here, bounds, 0);
    const turned = nextCameraPlan(first, 'follow', here, bounds, 100, { turn: 15 });
    expect(turned.shot).toMatchObject({ mode: 'ease', durationMs: TURN_MS, bearing: 5 });
    // And keeps the turn as the runner moves on.
    expect(nextCameraPlan(turned, 'follow', { ...here, bearing: 10 }, bounds, 5000, { turn: 15 }).shot).toMatchObject({ mode: 'linear', bearing: 25 });
  });

  it('swings back to the course’s way visibly, not in a blink', () => {
    const turned = nextCameraPlan(nextCameraPlan(null, 'follow', here, bounds, 0), 'follow', here, bounds, 5000, { turn: 90 });
    const reset = nextCameraPlan(turned, 'follow', here, bounds, 6000, { turn: 0 });
    expect(reset.shot).toMatchObject({ mode: 'ease', durationMs: SWING_MS, bearing: 350 });
    expect(nextCameraPlan(reset, 'follow', here, bounds, 6300, { turn: 0 })).toBe(reset);
  });

  it('turns the whole course too, from north', () => {
    const overview = nextCameraPlan(null, 'overview', here, bounds, 0);
    expect(overview.shot).toMatchObject({ kind: 'overview', bearing: 0 });
    expect(nextCameraPlan(overview, 'overview', here, bounds, 100)).toBe(overview);
    expect(nextCameraPlan(overview, 'overview', here, bounds, 100, { turn: -30 }).shot).toMatchObject({ kind: 'overview', mode: 'ease', bearing: 330 });
  });

  it('keeps a turn within half a circle either way', () => {
    expect(normalizeTurn(190)).toBe(-170);
    expect(normalizeTurn(-190)).toBe(170);
    expect(normalizeTurn(180)).toBe(180);
    expect(normalizeTurn(-180)).toBe(180);
  });
});
