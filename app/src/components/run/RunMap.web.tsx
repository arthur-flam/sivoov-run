import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { followCamera } from '@sivoov/shared';
import { MAP_STYLE, basemapConfig, courseLine, courseMarks, nextCameraPlan, overviewBounds, paint, runnerPoint } from './mapConfig';
import type { CameraPlan, CameraShot, RunMapProps } from './mapConfig';

/**
 * The run map in a browser (the web target: development and `npm run shots`), with Mapbox GL
 * JS from Mapbox's CDN like the admin's maps, at the same pinned version. Same layers, same
 * camera plan as the native map; only the drawing library differs.
 */
const VERSION = '3.31.0';
const JS = `https://api.mapbox.com/mapbox-gl-js/v${VERSION}/mapbox-gl.js`;
const CSS = `https://api.mapbox.com/mapbox-gl-js/v${VERSION}/mapbox-gl.css`;

/** The few calls of Mapbox GL JS this file makes. */
type GlSource = { setData: (data: unknown) => void };
type GlMap = {
  on: (event: string, cb: (e?: unknown) => void) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => GlSource | undefined;
  setPaintProperty: (layer: string, name: string, value: unknown) => void;
  setConfigProperty: (importId: string, name: string, value: unknown) => void;
  easeTo: (options: Record<string, unknown>) => void;
  jumpTo: (options: Record<string, unknown>) => void;
  fitBounds: (bounds: [[number, number], [number, number]], options: Record<string, unknown>) => void;
  isStyleLoaded: () => boolean;
  resize: () => void;
  remove: () => void;
};
type Gl = { accessToken: string; Map: new (options: Record<string, unknown>) => GlMap };

let loading: Promise<Gl | null> | null = null;

const loadGl = (): Promise<Gl | null> => {
  const g = globalThis as { mapboxgl?: Gl; document?: Document };
  if (g.mapboxgl) return Promise.resolve(g.mapboxgl);
  if (!g.document) return Promise.resolve(null);
  loading ??= new Promise((resolve) => {
    const doc = g.document!;
    const css = doc.createElement('link');
    css.rel = 'stylesheet';
    css.href = CSS;
    doc.head.appendChild(css);
    const script = doc.createElement('script');
    script.src = JS;
    script.onload = () => resolve(g.mapboxgl ?? null);
    script.onerror = () => resolve(null);
    doc.head.appendChild(script);
  });
  return loading;
};

/** Everything but the web target can draw it too; here, whenever WebGL and the CDN are there. */
export const mapAvailable = true;

/** A style that has not loaded by then is taken as failed: the screen draws the course instead. */
const STYLE_TIMEOUT_MS = 12_000;

/**
 * A change of view eases; the follow steps jump. In a browser the map draws on the page's own
 * thread (in software, headless): gliding four times a second would redraw without pause and
 * starve the page, a simulated run included. Phones glide (RunMap.tsx), the map drawing apart.
 */
const apply = (map: GlMap, shot: CameraShot, durationMs = shot.durationMs) => {
  if (shot.kind === 'overview') {
    map.fitBounds([shot.sw, shot.ne], { pitch: shot.pitch, bearing: 0, padding: shot.padding, duration: durationMs });
    return;
  }
  const camera = { center: shot.center, bearing: shot.bearing, pitch: shot.pitch, zoom: shot.zoom, padding: shot.padding };
  if (shot.mode === 'linear' || durationMs === 0) map.jumpTo(camera);
  else map.easeTo({ ...camera, duration: durationMs });
};

export const RunMap = memo(function RunMap({ token, track, officialM, runM, landmarks, accent, view, light, onFail }: RunMapProps) {
  const host = useRef<View>(null);
  const map = useRef<GlMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const plan = useRef<CameraPlan | null>(null);
  const applied = useRef<CameraPlan | null>(null);
  const colours = useMemo(() => paint(accent), [accent]);
  const bounds = useMemo(() => overviewBounds(track), [track]);
  const markStep = Math.floor(runM / 50);
  const marks = useMemo(() => courseMarks(track, officialM, landmarks, markStep * 50), [track, officialM, landmarks, markStep]);
  const here = followCamera(track, officialM, runM);
  plan.current = nextCameraPlan(plan.current, view, here, bounds, Date.now());

  useEffect(() => {
    let live = true;
    let created: GlMap | null = null;
    const timeout = setTimeout(() => live && onFail(), STYLE_TIMEOUT_MS);
    void loadGl().then((gl) => {
      if (!live) return;
      if (!gl || !host.current) return onFail();
      try {
        gl.accessToken = token;
        const first = plan.current!;
        const center = first.shot.kind === 'follow' ? first.shot.center : [(first.shot.ne[0] + first.shot.sw[0]) / 2, (first.shot.ne[1] + first.shot.sw[1]) / 2];
        created = new gl.Map({ container: host.current as unknown as HTMLElement, style: MAP_STYLE, interactive: false, config: { basemap: basemapConfig(light) }, center, zoom: 12 });
        // The first view is set without a move; the constructor's own bounds would ignore the tilt.
        apply(created, first.shot, 0);
        applied.current = first;
      } catch {
        return onFail();
      }
      created.on('error', () => {
        if (live && !created?.isStyleLoaded()) onFail();
      });
      created.on('style.load', () => {
        if (!live || !created) return;
        clearTimeout(timeout);
        const m = created;
        m.addSource('course', { type: 'geojson', data: courseLine(track), lineMetrics: true });
        m.addLayer({ id: 'course-casing', type: 'line', source: 'course', slot: 'middle', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colours.casing.color, 'line-width': colours.casing.width, 'line-opacity': colours.casing.opacity } });
        m.addLayer({ id: 'course-rest', type: 'line', source: 'course', slot: 'middle', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colours.rest.color, 'line-width': colours.rest.width, 'line-opacity': colours.rest.opacity, 'line-emissive-strength': 1, 'line-occlusion-opacity': 0.35, 'line-trim-offset': [0, 0] } });
        m.addLayer({ id: 'course-run', type: 'line', source: 'course', slot: 'middle', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colours.run.color, 'line-width': colours.run.width, 'line-emissive-strength': 1, 'line-occlusion-opacity': 0.35, 'line-trim-offset': [0, 1] } });
        m.addSource('marks', { type: 'geojson', data: marks });
        m.addLayer({
          id: 'marks-circles',
          type: 'circle',
          source: 'marks',
          slot: 'top',
          paint: {
            'circle-radius': ['match', ['get', 'kind'], 'finish', colours.finish.radius, colours.place.radius],
            'circle-color': ['match', ['get', 'kind'], 'finish', colours.finish.color, colours.place.color],
            'circle-stroke-color': ['case', ['==', ['get', 'kind'], 'finish'], colours.finish.stroke, ['get', 'passed'], colours.place.passedStroke, colours.place.stroke],
            'circle-stroke-width': colours.place.strokeWidth,
            'circle-pitch-alignment': 'map',
            'circle-emissive-strength': 1,
          },
        });
        m.addSource('runner', { type: 'geojson', data: runnerPoint(here.center) });
        m.addLayer({ id: 'runner-halo', type: 'circle', source: 'runner', slot: 'top', paint: { 'circle-radius': colours.runner.halo, 'circle-color': colours.runner.stroke, 'circle-opacity': colours.runner.haloOpacity, 'circle-pitch-alignment': 'viewport', 'circle-emissive-strength': 1 } });
        m.addLayer({
          id: 'runner-dot',
          type: 'circle',
          source: 'runner',
          slot: 'top',
          paint: { 'circle-radius': colours.runner.radius, 'circle-color': colours.runner.color, 'circle-stroke-color': colours.runner.stroke, 'circle-stroke-width': colours.runner.strokeWidth, 'circle-pitch-alignment': 'viewport', 'circle-emissive-strength': 1 },
        });
        map.current = m;
        setLoaded(true);
      });
    });
    return () => {
      live = false;
      clearTimeout(timeout);
      created?.remove();
      map.current = null;
    };
    // The map is made once per course and token; everything else is applied below as it changes.
  }, [token, track]);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    m.setPaintProperty('course-rest', 'line-trim-offset', [0, here.fraction]);
    m.setPaintProperty('course-run', 'line-trim-offset', [here.fraction, 1]);
    m.getSource('runner')?.setData(runnerPoint(here.center));
    if (plan.current && plan.current !== applied.current) {
      applied.current = plan.current;
      apply(m, plan.current.shot);
    }
  });

  useEffect(() => {
    if (loaded) map.current?.getSource('marks')?.setData(marks);
  }, [marks, loaded]);

  useEffect(() => {
    if (loaded) map.current?.setConfigProperty('basemap', 'lightPreset', light);
  }, [light, loaded]);

  // The stage changes height between the phases (the panel under it grows): the canvas follows.
  return <View ref={host} style={styles.fill} testID="run-map" onLayout={() => map.current?.resize()} />;
});

const styles = StyleSheet.create({ fill: { flex: 1 } });
