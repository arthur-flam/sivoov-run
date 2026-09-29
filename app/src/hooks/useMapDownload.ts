import { useEffect, useState } from 'react';
import { paddedBounds } from '@sivoov/shared';
import type { CourseTrack } from '@sivoov/shared';
import { MAP_STYLE } from '@/components/run/mapConfig';
import { sdk } from '@/components/run/mapboxSdk';

export type MapDownload = { status: 'none' | 'saving' | 'saved' | 'error'; percent: number };

/** The overview's zoom down to the widest the vector tiles go; the followed camera over-zooms them. */
const ZOOMS = { min: 11, max: 16 } as const;
/** Room around the course, so the camera behind the runner still has streets to show at a turn. */
const MARGIN_M = 400;

/** One offline region per course and style: a new style is a new download, not a stale one. */
const regionName = (courseId: string) => `sivoov:${courseId}:standard-v1`;

/**
 * Keeps the course's map on the phone, like the audio pack, so a runner with no signal still
 * sees the course (the map otherwise needs the network; the diagram never does). Started from
 * the race home and the run screen, once per course, and never blocks a start: a map that did
 * not come down is only a map drawn from the network, or the diagram.
 */
export const useMapDownload = (courseId: string | null, track: CourseTrack | null, token: string | null): MapDownload => {
  const [state, setState] = useState<MapDownload>({ status: 'none', percent: 0 });
  useEffect(() => {
    const mapbox = sdk;
    if (!mapbox || !courseId || !track || !token) return;
    const offline = mapbox.offlineManager;
    const name = regionName(courseId);
    const complete = mapbox.OfflinePackDownloadState.Complete;
    let live = true;
    const report = (next: MapDownload) => live && setState(next);
    const run = async () => {
      await mapbox.setAccessToken(token);
      const existing = await offline.getPack(name);
      if (existing) {
        const status = await existing.status();
        if (status.state === complete) return report({ status: 'saved', percent: 100 });
        await existing.resume();
        return offline.subscribe(name, (_pack, s) => report(s.state === complete ? { status: 'saved', percent: 100 } : { status: 'saving', percent: Math.round(s.percentage) }), () => report({ status: 'error', percent: 0 }));
      }
      const b = paddedBounds(track.bounds, MARGIN_M);
      report({ status: 'saving', percent: 0 });
      await offline.createPack(
        { name, styleURL: MAP_STYLE, minZoom: ZOOMS.min, maxZoom: ZOOMS.max, bounds: [[b.maxLng, b.maxLat], [b.minLng, b.minLat]] },
        (_pack, s) => report(s.state === complete ? { status: 'saved', percent: 100 } : { status: 'saving', percent: Math.round(s.percentage) }),
        () => report({ status: 'error', percent: 0 }),
      );
    };
    run().catch(() => report({ status: 'error', percent: 0 }));
    return () => {
      live = false;
      offline.unsubscribe(name);
    };
  }, [courseId, track, token]);
  return state;
};
