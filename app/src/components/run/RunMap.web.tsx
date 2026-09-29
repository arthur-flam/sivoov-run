import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAP_CREDITS_H, MAP_STYLE, basemapConfig, courseLine, courseMarks, paint, runnerPoint } from './mapConfig';
import type { CameraShot, RunMapProps } from './mapConfig';
import { RunnerDot } from './RunnerDot';
import { TurnSurface } from './TurnSurface';
import { useRunCamera } from './useRunCamera';

/** No runner on the map: the followed one is drawn over it (RunnerDot). */
const NOBODY = { type: 'FeatureCollection', features: [] };

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
  flyTo: (options: Record<string, unknown>) => void;
  cameraForBounds: (bounds: [[number, number], [number, number]], options: Record<string, unknown>) => { center: [number, number]; zoom: number } | undefined;
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
 * Headless (the screenshot rig, e2e) the map draws in software on the page's own thread: a
 * camera always moving would redraw without pause and starve the page, a simulated run
 * included. There the followed camera jumps from step to step instead of moving between them.
 */
const headless = typeof navigator !== 'undefined' && navigator.webdriver === true;

/** Applies a shot: a change of view eases or flies, the followed camera moves evenly (mapConfig.ts). */
const apply = (map: GlMap, shot: CameraShot, durationMs = shot.durationMs) => {
  if (shot.kind === 'overview') {
    const fit = { pitch: shot.pitch, bearing: shot.bearing, padding: shot.padding };
    const cam = map.cameraForBounds([shot.sw, shot.ne], fit);
    if (!cam || durationMs === 0) return map.fitBounds([shot.sw, shot.ne], { ...fit, duration: durationMs });
    const move = { ...fit, center: cam.center, zoom: cam.zoom, duration: durationMs, essential: true };
    if (shot.mode === 'ease') map.easeTo(move);
    else map.flyTo(move);
    return;
  }
  const camera = { center: shot.center, bearing: shot.bearing, pitch: shot.pitch, zoom: shot.zoom, padding: shot.padding };
  if (durationMs === 0 || (shot.mode === 'linear' && headless)) map.jumpTo(camera);
  else if (shot.mode === 'linear') map.easeTo({ ...camera, duration: durationMs, easing: (t: number) => t, essential: true });
  else if (shot.mode === 'ease') map.easeTo({ ...camera, duration: durationMs, essential: true });
  else map.flyTo({ ...camera, duration: durationMs, essential: true });
};

export const RunMap = memo(function RunMap({ token, track, officialM, runM, speedMps, landmarks, accent, view, turn, onTurn, light, onFail }: RunMapProps) {
  const host = useRef<View>(null);
  const map = useRef<GlMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const applied = useRef<CameraShot | null>(null);
  const colours = useMemo(() => paint(accent), [accent]);
  const markStep = Math.floor(runM / 50);
  const marks = useMemo(() => courseMarks(track, officialM, landmarks, markStep * 50), [track, officialM, landmarks, markStep]);
  const jump = useCallback((to: CameraShot) => {
    if (map.current) apply(map.current, to, 0);
  }, []);
  const { shot, here, following, focus, pivot, surface, onLayout } = useRunCamera({ track, officialM, runM, speedMps, view, turn, onTurn, jump });
  const first = useRef(shot);

  useEffect(() => {
    let live = true;
    let created: GlMap | null = null;
    const timeout = setTimeout(() => live && onFail(), STYLE_TIMEOUT_MS);
    void loadGl().then((gl) => {
      if (!live) return;
      if (!gl || !host.current) return onFail();
      try {
        gl.accessToken = token;
        const opening = first.current;
        const center = opening.kind === 'follow' ? opening.center : [(opening.ne[0] + opening.sw[0]) / 2, (opening.ne[1] + opening.sw[1]) / 2];
        created = new gl.Map({ container: host.current as unknown as HTMLElement, style: MAP_STYLE, interactive: false, config: { basemap: basemapConfig(light, view) }, center, zoom: 12 });
        // The first view is set without a move; the constructor's own bounds would ignore the tilt.
        apply(created, opening, 0);
        applied.current = opening;
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
        // Development only: the camera can be measured from the browser console.
        if (__DEV__) (globalThis as { __runMap?: GlMap }).__runMap = m;
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
    m.getSource('runner')?.setData(following ? NOBODY : runnerPoint(here.center));
    if (shot !== applied.current) {
      applied.current = shot;
      apply(m, shot);
    }
  });

  useEffect(() => {
    if (loaded) map.current?.getSource('marks')?.setData(marks);
  }, [marks, loaded]);

  useEffect(() => {
    if (loaded) map.current?.setConfigProperty('basemap', 'lightPreset', light);
  }, [light, loaded]);

  useEffect(() => {
    if (loaded) map.current?.setConfigProperty('basemap', 'showPlaceLabels', basemapConfig(light, view).showPlaceLabels);
  }, [view, loaded]);

  // The stage changes height between the phases (the panel under it grows): the canvas follows.
  return (
    <View style={styles.fill} onLayout={onLayout}>
      <View ref={host} style={styles.fill} testID="run-map" onLayout={() => map.current?.resize()} />
      {following ? <RunnerDot x={focus.x} y={focus.y} accent={accent} /> : null}
      <TurnSurface pivot={pivot} {...surface} bottom={MAP_CREDITS_H} />
    </View>
  );
});

const styles = StyleSheet.create({ fill: { flex: 1 } });
