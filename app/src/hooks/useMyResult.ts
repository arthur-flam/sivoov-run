import { useEffect, useRef } from 'react';
import { bestRankedRun } from '@sivoov/shared';
import type { Run } from '@sivoov/shared';
import { useSession } from '@/stores/session';
import { useUploads } from '@/stores/uploads';

/**
 * The runner's official result as far as the phone knows: the runs /me returned plus the ones
 * still in the upload queue, so the home screen shows the finish before the network does.
 * When an upload goes through, /me is asked again and the server's word replaces the phone's.
 */
export const useMyResult = (): Run | null => {
  const me = useSession((s) => s.me);
  const pending = useUploads((s) => s.pending);
  const sentCount = useUploads((s) => s.sent.length);
  // Only a run that has just gone through: the home screen already refreshes when it shows.
  const seen = useRef(sentCount);
  useEffect(() => {
    if (sentCount > seen.current) void useSession.getState().refresh().catch(() => undefined);
    seen.current = sentCount;
  }, [sentCount]);
  if (!me?.course) return null;
  return bestRankedRun(me.race, me.course.distanceM, [...me.runs, ...pending.map((p) => p.run)]);
};
