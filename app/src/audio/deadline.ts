/**
 * The promise, or a rejection with 'timeout' once `ms` have passed. The work itself goes on
 * (a download cannot be aborted): only the wait for it ends. A stalled download must never
 * hold the pack in 'loading', nor a live line past the moment it is news.
 */
export const withDeadline = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), Math.max(0, ms));
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
