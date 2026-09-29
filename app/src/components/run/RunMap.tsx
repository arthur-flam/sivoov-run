import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { followCamera } from '@sivoov/shared';
import { MAP_STYLE, MAX_FPS, basemapConfig, courseLine, courseMarks, nextCameraPlan, overviewBounds, paint, runnerPoint } from './mapConfig';
import type { CameraPlan, RunMapProps } from './mapConfig';
import { sdk } from './mapboxSdk';

/** Whether this build can draw the map at all. */
export const mapAvailable = sdk !== null;

/** The course in 3D, the camera behind the runner or over the whole course (mapConfig.ts). */
export const RunMap = memo(function RunMap({ token, track, officialM, runM, landmarks, accent, view, light, onFail }: RunMapProps) {
  const [ready, setReady] = useState(false);
  const plan = useRef<CameraPlan | null>(null);
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
  const bounds = useMemo(() => overviewBounds(track), [track]);
  const colours = useMemo(() => paint(accent), [accent]);
  // The marks only change when a place is passed: recomputed every 50 m, not every frame.
  const markStep = Math.floor(runM / 50);
  const marks = useMemo(() => courseMarks(track, officialM, landmarks, markStep * 50), [track, officialM, landmarks, markStep]);
  const here = followCamera(track, officialM, runM);
  plan.current = nextCameraPlan(plan.current, view, here, bounds, Date.now());
  const shot = plan.current.shot;

  if (!sdk || !ready) return <View style={styles.fill} />;
  const { MapView, Camera, StyleImport, ShapeSource, LineLayer, CircleLayer } = sdk;
  const cameraProps =
    shot.kind === 'follow'
      ? { centerCoordinate: shot.center, heading: shot.bearing, pitch: shot.pitch, zoomLevel: shot.zoom }
      : { bounds: { ne: shot.ne, sw: shot.sw }, heading: 0, pitch: shot.pitch };

  return (
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
    >
      <StyleImport id="basemap" existing config={basemapConfig(light)} />
      <Camera
        defaultSettings={cameraProps}
        {...cameraProps}
        padding={{ paddingTop: shot.padding.top, paddingBottom: shot.padding.bottom, paddingLeft: shot.padding.left, paddingRight: shot.padding.right }}
        animationMode={shot.mode === 'linear' ? 'linearTo' : 'easeTo'}
        animationDuration={shot.durationMs}
      />
      <ShapeSource id="course" shape={line} lineMetrics>
        <LineLayer id="course-casing" slot="middle" style={{ lineColor: colours.casing.color, lineWidth: colours.casing.width, lineOpacity: colours.casing.opacity, lineCap: 'round', lineJoin: 'round' }} />
        <LineLayer
          id="course-rest"
          slot="middle"
          style={{ lineColor: colours.rest.color, lineWidth: colours.rest.width, lineOpacity: colours.rest.opacity, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1, lineOcclusionOpacity: 0.35, lineTrimOffset: [0, here.fraction] }}
        />
        <LineLayer
          id="course-run"
          slot="middle"
          style={{ lineColor: colours.run.color, lineWidth: colours.run.width, lineCap: 'round', lineJoin: 'round', lineEmissiveStrength: 1, lineOcclusionOpacity: 0.35, lineTrimOffset: [here.fraction, 1] }}
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
      <ShapeSource id="runner" shape={runnerPoint(here.center)}>
        <CircleLayer id="runner-halo" slot="top" style={{ circleRadius: colours.runner.halo, circleColor: colours.runner.stroke, circleOpacity: colours.runner.haloOpacity, circlePitchAlignment: 'viewport', circleEmissiveStrength: 1 }} />
        <CircleLayer
          id="runner-dot"
          slot="top"
          style={{ circleRadius: colours.runner.radius, circleColor: colours.runner.color, circleStrokeColor: colours.runner.stroke, circleStrokeWidth: colours.runner.strokeWidth, circlePitchAlignment: 'viewport', circleEmissiveStrength: 1 }}
        />
      </ShapeSource>
    </MapView>
  );
});

const styles = StyleSheet.create({ fill: { flex: 1 } });
