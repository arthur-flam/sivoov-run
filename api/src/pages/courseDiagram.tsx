import type { CourseTrack, Landmark } from '@sivoov/shared';
import { positionForRun, toDiagram } from '@sivoov/shared';

type Props = { track: CourseTrack; officialM: number; landmarks: Landmark[]; width?: number; height?: number };

/** The course as a stylized polyline with landmark dots. Same projection as in the app. */
export const CourseDiagram = ({ track, officialM, landmarks, width = 480, height = 360 }: Props) => {
  const { points, project } = toDiagram(track, width, height, 24);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const start = points[0]!;
  const end = points[points.length - 1]!;
  const marks = landmarks
    .filter((l) => l.meters > 0 && l.meters < officialM)
    .map((l) => ({ l, p: project(positionForRun(track, officialM, l.meters).point) }));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Course diagram">
      <path d={d} fill="none" stroke="var(--border)" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" />
      <path d={d} fill="none" stroke="var(--race-primary)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      {marks.map(({ l, p }) => (
        <g key={l.id}>
          <circle cx={p.x} cy={p.y} r="5" fill="var(--card)" stroke="var(--race-primary)" stroke-width="2" />
        </g>
      ))}
      <circle cx={start.x} cy={start.y} r="7" fill="var(--race-primary)" />
      <rect x={end.x - 7} y={end.y - 7} width="14" height="14" fill="var(--ink)" transform={`rotate(45 ${end.x} ${end.y})`} />
    </svg>
  );
};
