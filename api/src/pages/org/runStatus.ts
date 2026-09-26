import type { Tone } from './ui';

/** How a run reads in the admin: one word and a color, the same on every screen. */
export type RunStatusView = { label: string; tone: Tone };

/**
 * `ranked` is the results' own rule (`rankedRun` in SQL, `runVerdict` in shared): the stored status
 * alone says "finished" for a rehearsal too.
 */
export const runStatusView = (run: { status: string; source: string; excluded: boolean; ranked: boolean }): RunStatusView => {
  if (run.excluded) return { label: 'Écarté', tone: 'bad' };
  if (run.source === 'simulation') return { label: 'Essai simulé', tone: 'neutral' };
  // A finish outside the race window (a rehearsal) or on another distance: kept, never ranked.
  if ((run.status === 'finished' || run.status === 'uploaded') && !run.ranked) return { label: 'Hors classement', tone: 'warn' };
  if (run.status === 'finished') return { label: 'Arrivé', tone: 'good' };
  if (run.status === 'uploaded') return { label: 'Arrivé, fichier envoyé', tone: 'good' };
  if (run.status === 'running') return { label: 'En course', tone: 'info' };
  if (run.status === 'abandoned') return { label: 'Pas arrivé', tone: 'warn' };
  return { label: 'Prévu', tone: 'neutral' };
};
