import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { courseKmMarks, coursePlaces, fitView, formatOfficialKm, formatPlaceKm, positionForRun, projectOnView, thinPoints } from '@sivoov/shared';
import type { CourseTrack, DistanceKey, Landmark, Place } from '@sivoov/shared';
import { API_URL } from '@/api';
import { KmMark, PlaceMarkAt } from '@/components/CourseMarks';
import { Body, Card } from '@/components/ui';
import { currentLocale, t } from '@/i18n';
import { colors, fonts, space } from '@/theme';

type Props = {
  courseId: string;
  track: CourseTrack;
  landmarks: Landmark[];
  officialM: number;
  distanceKey: DistanceKey;
  accent: string;
  onAccent: string;
  width: number;
};

type At = { x: number; y: number };

/** The side of the square a thumb can hit around a mark on the map. */
const HIT = 32;

/** Marks closer than this to one already drawn are left off the map (they stay in the list): near a start they would pile up. */
const MARK_GAP = 20;

/** The marks, in order, that do not land on one already taken. */
const clearOf = <M extends At>(taken: At[], marks: M[]): M[] =>
  marks.reduce<{ drawn: M[]; taken: At[] }>(
    (acc, m) => (acc.taken.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < MARK_GAP) ? acc : { drawn: [...acc.drawn, m], taken: [...acc.taken, m] }),
    { drawn: [], taken },
  ).drawn;

/**
 * The race home's course card: the course drawn over a Mapbox map framed on it (the Worker
 * renders the ground with `fitView`, the app projects the same geometry the same way), start,
 * finish, the kilometres, and the places the voice announces lettered A, B, C; then those
 * places with their distance. A place touched in the list lights up on the map, and the other
 * way round. Without the map (no token, offline) the same drawing stands on the card.
 */
export const CourseMap = ({ courseId, track, landmarks, officialM, distanceKey, accent, onAccent, width }: Props) => {
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const locale = currentLocale();
  const w = Math.round(width);
  const h = Math.round(width * 0.8);
  const view = useMemo(() => fitView(track.points, w, h), [track, w, h]);
  const places = useMemo(() => coursePlaces(landmarks, officialM), [landmarks, officialM]);
  const at = (m: number) => projectOnView(view, positionForRun(track, officialM, m).point);
  const d = thinPoints(track.points, 500)
    .map((p, i) => {
      const { x, y } = projectOnView(view, p);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const start = projectOnView(view, track.points[0]!);
  const finish = at(officialM);
  const pointOf = (p: Place): At => (p.mark === 'start' ? start : p.mark === 'finish' ? finish : at(p.landmark.meters));
  const lettered = clearOf(
    [start, finish],
    places.filter((p) => p.mark !== 'start' && p.mark !== 'finish').map((p) => ({ place: p, ...pointOf(p) })),
  );
  const kms = clearOf([start, finish, ...lettered], courseKmMarks(officialM).map((km) => ({ km, ...at(km * 1000) })));
  const toggle = (id: string) => setChosen((c) => (c === id ? null : id));
  const onMap = (mark: Place['mark']) => places.find((p) => p.mark === mark);
  const chosenPlace = places.find((p) => p.landmark.id === chosen);
  const ends = (['start', 'finish'] as const).map((mark) => ({ mark, place: onMap(mark), at: mark === 'start' ? start : finish }));
  // Every place drawn on the map (the chosen one always is) takes a tap.
  const tappable = [
    ...ends.flatMap((e) => (e.place ? [{ id: e.place.landmark.id, name: e.place.landmark.name, ...e.at }] : [])),
    ...lettered.map((l) => ({ id: l.place.landmark.id, name: l.place.landmark.name, x: l.x, y: l.y })),
    ...(chosenPlace && !lettered.some((l) => l.place === chosenPlace) && chosenPlace.mark !== 'start' && chosenPlace.mark !== 'finish'
      ? [{ id: chosenPlace.landmark.id, name: chosenPlace.landmark.name, ...pointOf(chosenPlace) }]
      : []),
  ];

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
          {kms.map((k) => (
            <KmMark key={k.km} x={k.x} y={k.y} km={k.km} />
          ))}
          {lettered
            .filter((l) => l.place.landmark.id !== chosen)
            .map((l) => (
              <PlaceMarkAt key={l.place.landmark.id} mark={l.place.mark} at={l} accent={accent} onAccent={onAccent} chosen={false} />
            ))}
          {ends.map((e) => (
            <PlaceMarkAt key={e.mark} mark={e.mark} at={e.at} accent={accent} onAccent={onAccent} chosen={e.place !== undefined && e.place.landmark.id === chosen} />
          ))}
          {chosenPlace && chosenPlace.mark !== 'start' && chosenPlace.mark !== 'finish' ? (
            <PlaceMarkAt mark={chosenPlace.mark} at={pointOf(chosenPlace)} accent={accent} onAccent={onAccent} chosen />
          ) : null}
        </Svg>
        {tappable.map((m) => (
          <Pressable
            key={m.id}
            testID={`mark-${m.id}`}
            accessibilityRole="button"
            accessibilityLabel={m.name}
            onPress={() => toggle(m.id)}
            style={[styles.hit, { left: m.x - HIT / 2, top: m.y - HIT / 2 }]}
          />
        ))}
      </View>
      <View style={styles.body}>
        <Body muted>{t('home.course')}</Body>
        <Body style={styles.note}>{t('home.course.note')}</Body>
        <View style={styles.list}>
          {places.map((p) => {
            const on = p.landmark.id === chosen;
            return (
              <Pressable
                key={p.landmark.id}
                testID={`place-${p.landmark.id}`}
                accessibilityRole="button"
                aria-selected={on}
                onPress={() => toggle(p.landmark.id)}
                style={[styles.row, on && { backgroundColor: colors.paper }]}
              >
                <Svg width={26} height={26} viewBox="0 0 26 26">
                  <PlaceMarkAt mark={p.mark} at={{ x: 13, y: 13 }} accent={accent} onAccent={onAccent} chosen={on} />
                </Svg>
                <Body style={[styles.name, on && styles.nameOn]}>{p.landmark.name}</Body>
                <Body muted style={styles.km}>
                  {p.mark === 'finish' ? formatOfficialKm(officialM, distanceKey, locale) : formatPlaceKm(p.landmark.meters, locale)}
                </Body>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  hit: { position: 'absolute', width: HIT, height: HIT, borderRadius: HIT / 2 },
  card: { padding: 0, overflow: 'hidden' },
  body: { padding: space.md, gap: space.xs },
  note: { fontSize: 15, lineHeight: 21 },
  list: { marginTop: space.sm, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 5, paddingHorizontal: space.xs, marginHorizontal: -space.xs, borderRadius: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { flex: 1, fontSize: 15 },
  nameOn: { fontFamily: fonts.bodyBold },
  km: { fontFamily: fonts.num, fontSize: 17, fontVariant: ['tabular-nums'] },
});
