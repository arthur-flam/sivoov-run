import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();
vi.mock('@/storage', () => ({
  storage: {
    get: async (k: string) => memory.get(k) ?? null,
    set: async (k: string, v: string) => void memory.set(k, v),
    remove: async (k: string) => void memory.delete(k),
  },
}));
const setLocale = vi.fn();
vi.mock('@/api', () => ({ api: { setLocale: (...args: unknown[]) => setLocale(...args) } }));

const { useLanguage } = await import('./language');
const me = (saved: 'fr' | 'en' | undefined, raceDefault: 'fr' | 'en' = 'fr') => ({ entrant: { locale: saved }, race: { defaultLocale: raceDefault } });

describe('the app’s language', () => {
  beforeEach(() => {
    memory.clear();
    setLocale.mockReset().mockResolvedValue({ ok: true });
    useLanguage.setState({ choice: null, unsynced: false, raceDefault: null, locale: 'fr' });
  });

  it('is French before anyone chooses, then the race’s once signed in', async () => {
    await useLanguage.getState().load();
    expect(useLanguage.getState().locale).toBe('fr');
    await useLanguage.getState().sync(me(undefined, 'en'), 'tok');
    expect(useLanguage.getState().locale).toBe('en');
    expect(setLocale).not.toHaveBeenCalled();
  });

  it('switches at once and tells the server when signed in', async () => {
    await useLanguage.getState().sync(me(undefined), 'tok');
    await useLanguage.getState().choose('en', 'tok');
    expect(useLanguage.getState()).toMatchObject({ locale: 'en', unsynced: false });
    expect(setLocale).toHaveBeenCalledWith('tok', 'en');
  });

  it('keeps a choice made on the sign-in screen and sends it once signed in', async () => {
    await useLanguage.getState().choose('en', null);
    expect(useLanguage.getState()).toMatchObject({ locale: 'en', unsynced: true });
    await useLanguage.getState().sync(me('fr'), 'tok');
    expect(setLocale).toHaveBeenCalledWith('tok', 'en');
    expect(useLanguage.getState()).toMatchObject({ locale: 'en', unsynced: false });
  });

  it('sends it again later when the server could not be reached', async () => {
    setLocale.mockRejectedValueOnce(new Error('timeout'));
    await useLanguage.getState().choose('en', 'tok');
    expect(useLanguage.getState().unsynced).toBe(true);
    await useLanguage.getState().sync(me(undefined), 'tok');
    expect(setLocale).toHaveBeenCalledTimes(2);
    expect(useLanguage.getState().unsynced).toBe(false);
  });

  it('takes the runner’s choice made on the web or another phone', async () => {
    await useLanguage.getState().choose('fr', 'tok');
    await useLanguage.getState().sync(me('en'), 'tok');
    expect(useLanguage.getState().locale).toBe('en');
  });

  it('remembers the choice on the phone across a restart, and forgets the race when signed out', async () => {
    await useLanguage.getState().sync(me(undefined, 'en'), 'tok');
    await useLanguage.getState().choose('fr', 'tok');
    useLanguage.setState({ choice: null, unsynced: false, raceDefault: null, locale: 'fr' });
    await useLanguage.getState().load();
    expect(useLanguage.getState().choice).toBe('fr');
    useLanguage.getState().signedOut();
    expect(useLanguage.getState()).toMatchObject({ locale: 'fr', raceDefault: null });
  });
});
