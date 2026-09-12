import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { positionForRun, toDiagram } from '@sivoov/shared';
import type { CourseTrack, Landmark } from '@sivoov/shared';
import { colors } from '@/theme';

type Props = { track: CourseTrack; officialM: number; runM: number; landmarks: Landmark[]; accent: string; width: number; height: number; dark?: boolean };

/** The course as a stylized polyline, the runner's dot moving along it. No map tiles. */
export const CourseDiagram = ({ track, officialM, runM, landmarks, accent, width, height, dark = true }: Props) => {
  const { points, project } = toDiagram(track, width, height, 14);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const covered = points.slice(0, positionForRun(track, officialM, runM).segmentIndex + 1);
  const runner = project(positionForRun(track, officialM, runM).point);
  const dCovered = [...covered.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`), `L${runner.x.toFixed(1)} ${runner.y.toFixed(1)}`].join(' ');
  const end = points[points.length - 1]!;
  const ground = dark ? colors.nightBorder : colors.border;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={d} fill="none" stroke={ground} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
      <Path d={dCovered} fill="none" stroke={accent} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {landmarks
        .filter((l) => l.meters > 0 && l.meters < officialM)
        .map((l) => {
          const p = project(positionForRun(track, officialM, l.meters).point);
          return <Circle key={l.id} cx={p.x} cy={p.y} r={3.5} fill={dark ? colors.night : colors.card} stroke={l.meters <= runM ? accent : ground} strokeWidth={2} />;
        })}
      <Rect x={end.x - 5} y={end.y - 5} width={10} height={10} fill={dark ? colors.snow : colors.ink} transform={`rotate(45 ${end.x} ${end.y})`} />
      <Circle cx={runner.x} cy={runner.y} r={9} fill={accent} opacity={0.35} />
      <Circle cx={runner.x} cy={runner.y} r={5} fill={colors.snow} stroke={accent} strokeWidth={2.5} />
    </Svg>
  );
};
