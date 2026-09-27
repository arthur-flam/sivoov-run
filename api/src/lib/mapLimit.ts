/**
 * `items.map(fn)` with at most `limit` calls in flight. A Worker may hold only six connections
 * open at once (R2 bodies included): past that, requests fail with "Response closed due to
 * connection limit".
 */
export const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = new Array<R>(items.length);
  const cursor = { i: 0 };
  const worker = async (): Promise<void> => {
    const i = cursor.i++;
    if (i >= items.length) return;
    results[i] = await fn(items[i]!);
    return worker();
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};
