import type { AudioEvent, AudioPack } from '../schemas/audio';

/** What the trigger function needs to know about the run. A projection of RunState. */
export type TriggerState = {
  phase: 'idle' | 'running' | 'finished';
  distanceM: number;
  elapsedMs: number;
  paceSecPerKm: number | null;
};

export type Firing = { event: AudioEvent; key: string };

/** Split and repeating pace events fire once per bucket; the key tells them apart. */
const keyFor = (event: AudioEvent, state: TriggerState): string | null => {
  const { trigger } = event;
  switch (trigger.kind) {
    case 'start':
      return state.phase !== 'idle' ? event.id : null;
    case 'finish':
      return state.phase === 'finished' ? event.id : null;
    case 'distance':
      return state.phase !== 'idle' && state.distanceM >= trigger.meters ? event.id : null;
    case 'elapsed':
      return state.phase !== 'idle' && state.elapsedMs >= trigger.seconds * 1000 ? event.id : null;
    case 'split': {
      const bucket = Math.floor(state.distanceM / trigger.everyMeters);
      return state.phase === 'running' && bucket >= 1 ? `${event.id}#${bucket}` : null;
    }
    case 'pace': {
      if (state.phase !== 'running' || state.paceSecPerKm === null || state.distanceM < trigger.afterMeters) return null;
      const slow = trigger.slowerThan !== undefined && state.paceSecPerKm > trigger.slowerThan;
      const fast = trigger.fasterThan !== undefined && state.paceSecPerKm < trigger.fasterThan;
      if (!slow && !fast) return null;
      const bucket = Math.floor(state.distanceM / 1000);
      return event.once ? event.id : `${event.id}#${bucket}`;
    }
  }
};

/**
 * Pure: which events should play now, given what already fired. Highest priority first.
 * The app plays them and records the keys; `fired` is that record.
 */
export const nextEvents = (state: TriggerState, pack: Pick<AudioPack, 'events'>, fired: ReadonlySet<string>): Firing[] =>
  pack.events
    .map((event) => ({ event, key: keyFor(event, state) }))
    .filter((f): f is Firing => f.key !== null && !fired.has(f.key))
    .sort((a, b) => b.event.priority - a.event.priority);

/** Only the finish survives a pause; the rest of a missed backlog is dropped. */
export const afterPause = (firings: Firing[]): Firing[] => firings.filter((f) => f.event.trigger.kind === 'finish');
