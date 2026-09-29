import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fitView, formatKm, positionForRun, projectOnView, thinPoints } from '@sivoov/shared';
import type { CourseTrack, Landmark } from '@sivoov/shared';
import { API_URL } from '@/api';
import { Body, Card } from '@/components/ui';
import { currentLocale, t } from '@/i18n';
import { colors, fonts, space } from '@/theme';

type Props = { courseId: string; track: CourseTrack; landmarks: Landmark[]; officialM: number; accent: string; width: number };

type Place = { landmark: Landmark; mark: 'start' | 'finish' | number };

/** Start and finish carry their own marks; the places between are numbered in course order, as listed under the map. */
const placesOf = (landmarks: Landmark[], officialM: number): Place[] => {
  const sorted = [...landmarks].sort((a, b) => a.meters - b.meters);
  const between = sorted.filter((l) => l.meters > 0 && l.meters < officialM);
  return sorted.map((landmark) => ({
    landmark,
    mark: landmark.meters <= 0 ? 'start' : landmark.meters >= officialM ? 'finish' : between.indexOf(landmark) + 1,
  }));
};

/** Marks closer than this to one already drawn are left off the map (they stay in the list): near a start they would pile up. */
const MARK_GAP = 20;

/** The marks, in course order, that do not land on the start, the finish or an earlier mark. */
const clearOf = <M extends { x: number; y: number }>(taken: { x: number; y: number }[], marks: M[]): M[] =>
  marks.reduce<{ drawn: M[]; taken: { x: number; y: number }[] }>(
    (acc, m) => (acc.taken.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < MARK_GAP) ? acc : { drawn: [...acc.drawn, m], taken: [...acc.taken, m] }),
    { drawn: [], taken },
  ).drawn;

const StartMark = ({ x, y, accent }: { x: number; y: number; accent: string }) => <Circle cx={x} cy={y} r={6} fill={accent} stroke={colors.snow} strokeWidth={2.5} />;
const FinishMark = ({ x, y }: { x: number; y: number }) => <Rect x={x - 5.5} y={y - 5.5} width={11} height={11} fill={colors.ink} stroke={colors.snow} strokeWidth={2} transform={`rotate(45 ${x} ${y})`} />;
const NumberMark = ({ x, y, n, accent }: { x: number; y: number; n: number; accent: string }) => (
  <G>
    <Circle cx={x} cy={y} r={9} fill={colors.card} stroke={accent} strokeWidth={2} />
    <SvgText x={x} y={y + 3.8} fontSize={11} fontFamily={fonts.numBold} fontWeight="700" fill={colors.ink} textAnchor="middle">
      {String(n)}
    </SvgText>
  </G>
);

/** The same marks, small, at the head of each row of the list. */
const RowMark = ({ mark, accent }: { mark: Place['mark']; accent: string }) => (
  <Svg width={22} height={22} viewBox="0 0 22 22">
    {mark === 'start' ? <StartMark x={11} y={11} accent={accent} /> : mark === 'finish' ? <FinishMark x={11} y={11} /> : <NumberMark x={11} y={11} n={mark} accent={accent} />}
  </Svg>
);

/**
 * The race home's course card: the course drawn over a Mapbox map framed on it (the Worker
 * renders the ground with `fitView`, the app projects the same geometry the same way), start,
 * finish and the places the voice announces, then those places with their distance. Without
 * the map (no token, offline) the same drawing stands on the card.
 */
export const CourseMap = ({ courseId, track, landmarks, officialM, accent, width }: Props) => {
  const [failed, setFailed] = useState(false);
  const w = Math.round(width);
  const h = Math.round(width * 0.8);
  const view = useMemo(() => fitView(track.points, w, h), [track, w, h]);
  const places = useMemo(() => placesOf(landmarks, officialM), [landmarks, officialM]);
  const at = (m: number) => projectOnView(view, positionForRun(track, officialM, m).point);
  const d = thinPoints(track.points, 500)
    .map((p, i) => {
      const { x, y } = projectOnView(view, p);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const start = projectOnView(view, track.points[0]!);
  const finish = at(officialM);
  const numbered = clearOf(
    [start, finish],
    places.flatMap((p) => (typeof p.mark === 'number' ? [{ n: p.mark, ...at(p.landmark.meters) }] : [])),
  );

  return (
    <Card style={styles.card}>
      <View style={{ width: w, height: h, backgroundColor: colors.paper }} testID="course-map">
        {failed ? null : (
          <Image
            source={{ uri: `${API_URL}/api/courses/${courseId}/map.png?base=1&w=${w}&h=${h}` }}
            style={StyleSheet.absoluteFill}
            accessibilityLabel={t('home.course')}
            onError={() => setFailed(true)}
          />
        )}
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={d} fill="none" stroke={failed ? colors.border : colors.snow} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
          <Path d={d} fill="none" stroke={accent} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          {numbered.map((p) => (
            <NumberMark key={p.n} x={p.x} y={p.y} n={p.n} accent={accent} />
          ))}
          <StartMark x={start.x} y={start.y} accent={accent} />
          <FinishMark x={finish.x} y={finish.y} />
        </Svg>
      </View>
      <View style={styles.body}>
        <Body muted>{t('home.course')}</Body>
        <Body style={styles.note}>{t('home.course.note')}</Body>
        <View style={styles.list}>
          {places.map((p) => (
            <View key={p.landmark.id} style={styles.row}>
              <RowMark mark={p.mark} accent={accent} />
              <Body style={styles.name}>{p.landmark.name}</Body>
              <Body muted style={styles.km}>
                {formatKm(p.landmark.meters, currentLocale(), p.mark === 'finish' ? 3 : 1)}
              </Body>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  body: { padding: space.md, gap: space.xs },
  note: { fontSize: 15, lineHeight: 21 },
  list: { marginTop: space.sm, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { flex: 1, fontSize: 15 },
  km: { fontFamily: fonts.num, fontSize: 17, fontVariant: ['tabular-nums'] },
});
