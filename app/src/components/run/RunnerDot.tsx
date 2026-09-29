import { StyleSheet, View } from 'react-native';
import { paint } from './mapConfig';

/**
 * The runner, drawn over the map at the followed camera's focus: the camera moves smoothly and
 * the runner is always there. Drawn by the map, a dot moved a few times a second would shake
 * against it. The same look as the map's own dot (paint.runner).
 */
export const RunnerDot = ({ x, y, accent }: { x: number; y: number; accent: string }) => {
  const { runner } = paint(accent);
  const halo = runner.halo * 2;
  const dot = (runner.radius + runner.strokeWidth) * 2;
  return (
    <View pointerEvents="none" style={[styles.at, { left: x - runner.halo, top: y - runner.halo, width: halo, height: halo }]} testID="runner-dot">
      <View style={[StyleSheet.absoluteFill, { borderRadius: runner.halo, backgroundColor: runner.stroke, opacity: runner.haloOpacity }]} />
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: runner.color, borderWidth: runner.strokeWidth, borderColor: runner.stroke }} />
    </View>
  );
};

const styles = StyleSheet.create({ at: { position: 'absolute', alignItems: 'center', justifyContent: 'center' } });
