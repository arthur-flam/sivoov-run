import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Course, CourseTrack, LightPreset } from '@sivoov/shared';
import { CourseDiagram } from '@/components/CourseDiagram';
import type { RunMapView } from './mapConfig';
import { RunMap, mapAvailable } from './RunMap';

type Props = {
  /** Null: no Mapbox token for this race, the course is drawn. */
  token: string | null;
  track: CourseTrack;
  course: Course;
  runM: number;
  accent: string;
  /** 'numbers': the runner chose the numbers alone (and the battery): the course is drawn. */
  view: RunMapView | 'numbers';
  light: LightPreset;
  failed: boolean;
  onFail: () => void;
  /** Room the chips take at the top of the stage, kept clear of the drawing. */
  topInset: number;
};

/**
 * The upper part of the run screen: the course in 3D when the map can be had, the course
 * drawing otherwise (no token, an older build without the map, no network with nothing kept,
 * or the runner's choice). Mounted once for the whole run, so the camera moves between views.
 */
export const Stage = ({ token, track, course, runM, accent, view, light, failed, onFail, topInset }: Props) => {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const map = token !== null && mapAvailable && !failed && view !== 'numbers';
  const diagram = size ? { w: Math.min(size.w - 32, 480), h: Math.max(120, size.h - topInset - 32) } : null;
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {map ? (
        <RunMap token={token} track={track} officialM={course.distanceM} runM={runM} landmarks={course.landmarks} accent={accent} view={view} light={light} onFail={onFail} />
      ) : diagram ? (
        <View style={[styles.center, { paddingTop: topInset }]} testID="course-diagram">
          <CourseDiagram track={track} officialM={course.distanceM} runM={runM} landmarks={course.landmarks} accent={accent} width={diagram.w} height={diagram.h} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
