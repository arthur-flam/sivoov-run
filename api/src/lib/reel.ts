import { DemoReelSchema } from '@sivoov/shared';
import type { DemoReel } from '@sivoov/shared';

/**
 * A course's demo reel (DemoReelSchema), written to R2 by `npm run produce`: `demo/<courseId>/
 * reel.json` and `reel.mp3`. Public, like the pack. Null when a course has none.
 */
export const reelKey = (courseId: string, ext: 'json' | 'mp3'): string => `demo/${courseId}/reel.${ext}`;

export const loadReel = async (files: R2Bucket, courseId: string): Promise<DemoReel | null> => {
  const object = await files.get(reelKey(courseId, 'json'));
  if (!object) return null;
  const parsed = DemoReelSchema.safeParse(await object.json().catch(() => null));
  return parsed.success ? parsed.data : null;
};

/** `bytes=a-b`, `bytes=a-`, `bytes=-n` against a size: the R2 range and the Content-Range, or null to send it all. */
export const byteRange = (header: string | undefined, size: number): { offset: number; length: number } | null => {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  const [start, end] =
    m[1] === '' ? [Math.max(0, size - Number(m[2])), size - 1] : [Number(m[1]), m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)];
  return start <= end && start < size ? { offset: start, length: end - start + 1 } : null;
};
