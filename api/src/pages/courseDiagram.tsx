import type { CourseTrack, Landmark } from '@sivoov/shared';
import { positionForRun, toDiagram } from '@sivoov/shared';

/** An extra dot on the diagram: the organizer studio puts one audio event per marker. */
export type DiagramMarker = { id: string; lat: number; lng: number; category?: string; occurrence?: number; faint?: boolean };

/** Marker colors are the audio category tokens (`--cat-*` in tokens.ts). */
const CATEGORIES: readonly string[] = ['ceremony', 'course', 'coaching', 'personal', 'safety'];
const categoryFill = (category: string | undefined): string => (category && CATEGORIES.includes(category) ? `var(--cat-${category})` : 'var(--accent-ink)');

type Props = {
  track: CourseTrack;
  officialM: number;
  landmarks: Landmark[];
  width?: number;
  height?: number;
  markers?: DiagramMarker[];
};

/** The course as a stylized polyline with landmark dots. Same projection as in the app. */
export const CourseDiagram = ({ track, officialM, landmarks, width = 480, height = 360, markers = [] }: Props) => {
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
      {markers.map((m) => {
        const p = project({ lat: m.lat, lng: m.lng });
        return (
          <circle
            data-event={m.id}
            data-occurrence={String(m.occurrence ?? 0)}
            class="ev-dot"
            cx={p.x}
            cy={p.y}
            r={m.faint ? '3' : '6'}
            fill={categoryFill(m.category)}
            opacity={m.faint ? '0.45' : '1'}
            stroke="var(--card)"
            stroke-width={m.faint ? '0.5' : '1.5'}
          />
        );
      })}
      <circle cx={start.x} cy={start.y} r="7" fill="var(--race-primary)" />
      <rect x={end.x - 7} y={end.y - 7} width="14" height="14" fill="var(--ink)" transform={`rotate(45 ${end.x} ${end.y})`} />
    </svg>
  );
};
