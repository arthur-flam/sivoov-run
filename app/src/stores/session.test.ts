import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();
vi.mock('@/storage', () => ({
  storage: {
    get: async (k: string) => memory.get(k) ?? null,
    set: async (k: string, v: string) => void memory.set(k, v),
    remove: async (k: string) => void memory.delete(k),
  },
}));
let cached: unknown = null;
vi.mock('@/stores/meCache', () => ({
  meCache: {
    read: async () => cached,
    write: async (me: unknown) => void (cached = me),
    clear: async () => void (cached = null),
  },
}));
class ApiError extends Error {
  constructor(public status: number) {
    super(String(status));
  }
}
const me = vi.fn();
vi.mock('@/api', () => ({ ApiError, api: { me: (...args: unknown[]) => me(...args) } }));

const { useSession } = await import('./session');
const ME = { entrant: { id: 'e1' }, race: { id: 'r' }, course: { id: 'c' }, runs: [] };

describe('session', () => {
  beforeEach(() => {
    memory.clear();
    cached = null;
    me.mockReset();
    useSession.setState({ status: 'loading', token: null, me: null, error: null });
  });

  it('starts offline from the last /me it saw, so the runner can still run', async () => {
    memory.set('sivoov.session', 'tok');
    me.mockResolvedValueOnce(ME);
    await useSession.getState().restore();
    me.mockRejectedValueOnce(new TypeError('Network request failed'));
    useSession.setState({ me: null });
    await useSession.getState().restore();
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', token: 'tok', me: ME, error: 'offline' });
  });

  it('is signed in from the last /me it saw before the network answers, then takes the fresh one', async () => {
    memory.set('sivoov.session', 'tok');
    cached = ME;
    const fresh = { ...ME, runs: [{ id: 'run1' }] };
    let answer: (me: unknown) => void = () => undefined;
    me.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const restoring = useSession.getState().restore();
    await vi.waitFor(() => expect(useSession.getState()).toMatchObject({ status: 'signedIn', me: ME }));
    answer(fresh);
    await restoring;
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', me: fresh, error: null });
    expect(cached).toEqual(fresh);
  });

  it('waits for /me when nothing is kept', async () => {
    memory.set('sivoov.session', 'tok');
    me.mockResolvedValueOnce(ME);
    await useSession.getState().restore();
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', token: 'tok', me: ME, error: null });
  });

  it('forgets the cache when the token is refused', async () => {
    memory.set('sivoov.session', 'tok');
    cached = ME;
    me.mockRejectedValueOnce(new ApiError(401));
    await useSession.getState().restore();
    expect(useSession.getState()).toMatchObject({ status: 'signedOut', me: null });
    expect(cached).toBeNull();
  });
});
