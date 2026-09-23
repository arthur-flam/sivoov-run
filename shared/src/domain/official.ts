import type { Run, RunStatus } from '../schemas/run';

/**
 * What the results table may trust from an uploaded run. The app says 'finished'; the server
 * keeps that word only for a real run that covered the course distance. Anything else is
 * stored as 'abandoned': it stays in the runner's history, never in the results.
 */
export const officialStatus = (run: Pick<Run, 'status' | 'source' | 'distanceM'>, courseDistanceM: number): RunStatus => {
  if (run.status !== 'finished' && run.status !== 'uploaded') return run.status;
  return run.source !== 'simulation' && run.distanceM >= courseDistanceM ? run.status : 'abandoned';
};
