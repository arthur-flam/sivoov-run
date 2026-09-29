import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Camera as CameraRef } from '@rnmapbox/maps';
import { MAP_CREDITS_H, MAP_STYLE, MAX_FPS, basemapConfig, courseLine, courseMarks, paint, runnerPoint } from './mapConfig';
import type { CameraShot, RunMapProps } from './mapConfig';
import { sdk } from './mapboxSdk';
import { RunnerDot } from './RunnerDot';
import { TurnSurface } from './TurnSurface';
import { useRunCamera } from './useRunCamera';

/** No runner on the map: the followed one is drawn over it (RunnerDot). */
const NOBODY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Whether this build can draw the map at all. */
export const mapAvailable = sdk !== null;

/**
 * A style that has not loaded by then is taken as failed: offline with nothing kept, the SDK
 * may never report an error, and the runner would look at a blank map. The course is drawn.
 */
const STYLE_TIMEOUT_MS = 6000;

/** The course in 3D, the camera behind the runner or over the whole course (mapConfig.ts). */
export const RunMap = memo(function RunMap({ token, track, officialM, runM, speedMps, landmarks, accent, view, turn, onTurn, light, onFail }: RunMapProps) {
  const [ready, setReady] = useState(false);
  const cameraRef = useRef<CameraRef>(null);
  const styled = useRef(false);
  const fail = useRef(onFail);
  fail.current = onFail;
  useEffect(() => {
    const id = setTimeout(() => styled.current || fail.current(), STYLE_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!sdk) return onFail();
    let live = true;
    void sdk
      .setAccessToken(token)
      .then(() => live && setReady(true))
      .catch(() => live && onFail());
    return () => {
      live = false;
    };
  }, [token, onFail]);

  const line = useMemo(() => courseLine(track), [track]);
  const colours = useMemo(() => paint(accent), [accent]);
  // The marks only change when a place is passed: recomputed every 50 m, not every frame.
  const markStep = Math.floor(runM / 50);
  const marks = useMemo(() => courseMarks(track, officialM, landmarks, markStep * 50), [track, officialM, landmarks, markStep]);
  const jump = useCallback((to: CameraShot) => {
    const { stop, padding } = cameraFor(to);
    cameraRef.current?.setCamera({ ...stop, padding, animationMode: 'none', animationDuration: 0 });
  }, []);
  const { shot, here, following, focus, pivot, surface, onLayout } = useRunCamera({ track, officialM, runM, speedMps, view, turn, onTurn, jump });
  // One set of props per planned shot: the Camera sends the map a move whenever an object in its
  // props is new, and a move sent again starts over (a fly restarted on every frame never lands).
  const camera = useMemo(() => cameraFor(shot), [shot]);

  if (!sdk || !ready) return <View style={styles.fill} />;
  const { MapView, Camera, StyleImport, ShapeSource, LineLayer, CircleLayer } = sdk;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <MapView
        style={styles.fill}
        styleURL={MAP_STYLE}
        scaleBarEnabled={false}
        compassEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        preferredFramesPerSecond={MAX_FPS}
        logoPosition={{ bottom: 8, left: 8 }}
        attributionPosition={{ bottom: 8, right: 8 }}
        onMapLoadingError={onFail}
        onDidFinishLoadingStyle={() => {
          styled.current = true;
        }}
      >
        <StyleImport id="basemap" existing config={basemapConfig(light, view)} />
        <Camera ref={cameraRef} defaultSettings={camera.stop} {...camera.stop} padding={camera.padding} animationMode={camera.mode} animationDuration={shot.durationMs} />
        <ShapeSource id="course" shape={line} lineMetrics>
          <LineLayer
            id="course-casing"
            slot="middle"
            style={{ lineColor: colours.casing.color, lineWidth: colours.casing.width, lineOpacity: colours.casing.opacity, lineCap: 'round', lineJoin: 'round' }}
          />
          <LineLayer
            id="course-rest"
            slot="middle"
            style={{
              lineColor: colours.rest.color,
              lineWidth: colours.rest.width,
              lineOpacity: colours.rest.opacity,
              lineCap: 'round',
              lineJoin: 'round',
              lineEmissiveStrength: 1,
              lineOcclusionOpacity: 0.35,
              lineTrimOffset: [0, here.fraction],
            }}
          />
          <LineLayer
            id="course-run"
            slot="middle"
            style={{
              lineColor: colours.run.color,
              lineWidth: colours.run.width,
              lineCap: 'round',
              lineJoin: 'round',
              lineEmissiveStrength: 1,
              lineOcclusionOpacity: 0.35,
              lineTrimOffset: [here.fraction, 1],
            }}
          />
        </ShapeSource>
        <ShapeSource id="marks" shape={marks}>
          <CircleLayer
            id="marks-circles"
            slot="top"
            style={{
              circleRadius: ['match', ['get', 'kind'], 'finish', colours.finish.radius, colours.place.radius],
              circleColor: ['match', ['get', 'kind'], 'finish', colours.finish.color, colours.place.color],
              circleStrokeColor: ['case', ['==', ['get', 'kind'], 'finish'], colours.finish.stroke, ['get', 'passed'], colours.place.passedStroke, colours.place.stroke],
              circleStrokeWidth: colours.place.strokeWidth,
              circlePitchAlignment: 'map',
              circleEmissiveStrength: 1,
            }}
          />
        </ShapeSource>
        <ShapeSource id="runner" shape={following ? NOBODY : runnerPoint(here.center)}>
          <CircleLayer
            id="runner-halo"
            slot="top"
            style={{ circleRadius: colours.runner.halo, circleColor: colours.runner.stroke, circleOpacity: colours.runner.haloOpacity, circlePitchAlignment: 'viewport', circleEmissiveStrength: 1 }}
          />
          <CircleLayer
            id="runner-dot"
            slot="top"
            style={{
              circleRadius: colours.runner.radius,
              circleColor: colours.runner.color,
              circleStrokeColor: colours.runner.stroke,
              circleStrokeWidth: colours.runner.strokeWidth,
              circlePitchAlignment: 'viewport',
              circleEmissiveStrength: 1,
            }}
          />
        </ShapeSource>
      </MapView>
      {following ? <RunnerDot x={focus.x} y={focus.y} accent={accent} /> : null}
      <TurnSurface pivot={pivot} {...surface} bottom={MAP_CREDITS_H} />
    </View>
  );
});

const cameraFor = (shot: CameraShot) => ({
  stop:
    shot.kind === 'follow'
      ? { centerCoordinate: shot.center, heading: shot.bearing, pitch: shot.pitch, zoomLevel: shot.zoom }
      : { bounds: { ne: shot.ne, sw: shot.sw }, heading: shot.bearing, pitch: shot.pitch },
  padding: { paddingTop: shot.padding.top, paddingBottom: shot.padding.bottom, paddingLeft: shot.padding.left, paddingRight: shot.padding.right },
  mode: shot.mode === 'linear' ? ('linearTo' as const) : shot.mode === 'ease' ? ('easeTo' as const) : ('flyTo' as const),
});

const styles = StyleSheet.create({ fill: { flex: 1 } });
