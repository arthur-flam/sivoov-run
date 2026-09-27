import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { champsElysees10kGeometry } from '@sivoov/shared';
import type { DemoReel } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { byteRange } from '../src/lib/reel';
import { champsElyseesCourses, champsElyseesRace } from '../src/seed/champsElysees';

const COURSE = champsElyseesCourses[0]!.id;
const reel: DemoReel = {
  courseId: COURSE,
  duration: 240,
  paceSecPerKm: 283.2,
  chapters: [
    { t: 0, title: 'Le village de départ', km: 0, caption: 'La foule, la musique du village.' },
    { t: 50, title: 'Compte à rebours', km: 0, caption: 'Dix. Neuf.', mark: 'countdown' },
    { t: 60, title: 'Le départ', km: 0, caption: 'Partez !', mark: 'gun' },
    { t: 120, title: 'Demi-tour sous l’Arc', km: 6.9, caption: 'Les Champs-Élysées sont à vous <b>!</b>' },
    { t: 200, title: 'La ligne', km: 10, caption: 'Et c’est la ligne !', mark: 'finish' },
  ],
};
const mp3 = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(champsElyseesRace);
  await Promise.all(champsElyseesCourses.map((c) => q.upsertCourse(c)));
  await env.FILES.put(champsElyseesCourses[0]!.geometryKey!, JSON.stringify(champsElysees10kGeometry));
  await env.FILES.put(`demo/${COURSE}/reel.json`, JSON.stringify(reel));
  await env.FILES.put(`demo/${COURSE}/reel.mp3`, mp3);
});

describe('the race page of the 10 km des Champs-Élysées', () => {
  it('opens on the race, lets you listen to it, and shows the circuit it belongs to', async () => {
    const html = await (await SELF.fetch(`http://run.test/${champsElyseesRace.slug}`)).text();
    expect(html).toContain('10 km des Champs-Élysées, où que vous soyez.');
    expect(html).toContain('--race-accent:#ea5b1a');
    expect(html).toContain('id="ecouter"');
    expect(html).toContain(`src="/api/courses/${COURSE}/reel.mp3"`);
    // The chapters ride along as JSON the page's script reads; nothing in them can close the tag.
    expect(html).toContain('Les Champs-Élysées sont à vous \\u003cb>!\\u003c/b>');
    expect(html).toContain('Paris Masters Circuit');
    expect(html).toContain('Étape 1 sur 3');
    expect(html).toContain('10 km de la Tour Eiffel');
  });
});

describe('the demo reel', () => {
  it('serves its chapters and its sound, by byte range too', async () => {
    const chapters = await SELF.fetch(`http://run.test/api/courses/${COURSE}/reel`);
    expect(((await chapters.json()) as DemoReel).chapters).toHaveLength(5);
    const whole = await SELF.fetch(`http://run.test/api/courses/${COURSE}/reel.mp3`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('Accept-Ranges')).toBe('bytes');
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(mp3);
    const part = await SELF.fetch(`http://run.test/api/courses/${COURSE}/reel.mp3`, { headers: { Range: 'bytes=10-19' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(mp3.slice(10, 20));
    expect((await SELF.fetch('http://run.test/api/courses/nope/reel.mp3')).status).toBe(404);
  });

  it('reads the ranges Safari and Chrome send', () => {
    expect(byteRange('bytes=0-', 100)).toEqual({ offset: 0, length: 100 });
    expect(byteRange('bytes=0-1', 100)).toEqual({ offset: 0, length: 2 });
    expect(byteRange('bytes=-10', 100)).toEqual({ offset: 90, length: 10 });
    expect(byteRange('bytes=90-500', 100)).toEqual({ offset: 90, length: 10 });
    expect(byteRange('bytes=200-', 100)).toBeNull();
    expect(byteRange(undefined, 100)).toBeNull();
  });
});
