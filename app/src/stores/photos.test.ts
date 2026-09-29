import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('@/storage', () => ({ storage: { get: async () => null, set: async () => undefined, remove: async () => undefined } }));
vi.mock('@/diag', () => ({ diag: () => undefined }));
const takeSelfie = vi.fn();
vi.mock('@/photos/picker', () => ({ takeSelfie: () => takeSelfie() }));
const sendPhoto = vi.fn();
const photos = vi.fn();
vi.mock('@/api', () => ({ api: { sendPhoto: (...a: unknown[]) => sendPhoto(...a), photos: () => photos(), renderPhotos: vi.fn() } }));

const { usePhotos } = await import('./photos');
const { photoQueue } = await import('@/photos/queue');

const moments = [
  { id: 'start', title: 'Départ', ask: '', meters: 0 },
  { id: 'planches', title: 'Planches', ask: '', meters: 200 },
  { id: 'finish', title: 'Arrivée', ask: '', meters: 21097.5 },
];
const picked = (id: string, takenAtMs: number | null) => ({ id, uri: `blob:${id}`, name: `${id}.jpg`, type: 'image/jpeg', takenAtMs, file: new File([id], `${id}.jpg`) });
const view = (momentId: string) => ({ id: `p-${momentId}`, momentId, status: 'waiting' as const, attempts: 0, again: true, shown: false, picture: null });

beforeEach(async () => {
  sendPhoto.mockReset();
  takeSelfie.mockReset();
  usePhotos.setState({ enabled: true, moments, photos: [], kept: [], busy: null, error: null });
  await Promise.all((await photoQueue.list()).map((q) => photoQueue.done(q)));
});

describe('a photo taken with the camera during the run', () => {
  it('is kept on the phone while there is no network, and sent at the next try', async () => {
    takeSelfie.mockResolvedValue(picked('selfie', Date.now()));
    sendPhoto.mockRejectedValueOnce(new Error('timeout'));
    expect(await usePhotos.getState().snap('tok', 'planches')).toBe(true);
    await vi.waitFor(() => expect(sendPhoto).toHaveBeenCalledTimes(1));
    expect(usePhotos.getState().kept).toEqual(['planches']);
    expect(await photoQueue.list()).toHaveLength(1);

    sendPhoto.mockResolvedValueOnce({ photo: view('planches') });
    await usePhotos.getState().flush('tok');
    expect(sendPhoto.mock.calls[1]![1]).toBe('planches');
    expect(usePhotos.getState().kept).toEqual([]);
    expect(usePhotos.getState().photos.map((p) => p.momentId)).toEqual(['planches']);
    expect(await photoQueue.list()).toEqual([]);
  });

  it('asks nothing when the runner closed the camera', async () => {
    takeSelfie.mockResolvedValue(null);
    expect(await usePhotos.getState().snap('tok', 'planches')).toBe(false);
    expect(sendPhoto).not.toHaveBeenCalled();
  });
});

describe('photos picked after the run', () => {
  it('each go to the moment they were taken at', async () => {
    const gun = Date.parse('2026-11-12T08:00:00Z');
    sendPhoto.mockImplementation(async (_t: string, momentId: string) => ({ photo: view(momentId) }));
    const run = { startedAtMs: gun, elapsedMs: 6_300_000, splits: [{ km: 1, elapsedMs: 300_000, splitMs: 300_000 }] };
    const result = await usePhotos.getState().send('tok', [picked('line', gun - 5 * 60_000), picked('sea', gun + 70_000)], run, 21097.5);
    expect(result).toEqual({ sent: 2, unmatched: 0 });
    expect(sendPhoto.mock.calls.map((c) => c[1]).sort()).toEqual(['planches', 'start']);
  });
});
