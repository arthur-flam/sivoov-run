import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { averagePace, formatClock, formatKm, formatPace } from '@sivoov/shared';
import type { Course, CourseTrack, EntrantPublic, FinishOutcome, Race, RunState } from '@sivoov/shared';
import { Body, Button, Card, Display, Eyebrow, Num } from '@/components/ui';
import { Medal } from '@/components/Medal';
import { locale, t } from '@/i18n';
import { openCertificate, shareFinish } from '@/share';
import type { UploadStatus } from '@/stores/uploads';
import { colors, fonts, radius, space } from '@/theme';

type Props = {
  race: Race;
  course: Course;
  entrant: EntrantPublic;
  track: CourseTrack;
  state: RunState;
  outcome: FinishOutcome;
  /** The race colour, lifted to read on the night ground. */
  accent: string;
  simulation: boolean;
  uploadStatus: UploadStatus;
  onHome: () => void;
  onDiagnostics: () => void;
};

const dateOf = (iso: string, race: Race) => new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', timeZone: race.timezone }).format(new Date(iso));

/**
 * The finish line. An official finish gets the medal, the time, and two ways to tell people;
 * a rehearsal, a late run or a stop gets the truth about what it counts for and the way back.
 */
export const Finish = ({ race, course, entrant, track, state, outcome, accent, simulation, uploadStatus, onHome, onDiagnostics }: Props) => {
  const finished = outcome !== 'incomplete';
  useEffect(() => {
    if (Platform.OS !== 'web') void Haptics.notificationAsync(finished ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }, [finished]);

  const title = {
    official: t('finish.official.title'),
    rehearsal: t('finish.rehearsal.title'),
    closed: t('finish.closed.title'),
    incomplete: t('finish.incomplete.title'),
  }[outcome];
  const body = {
    official: t('finish.official.body'),
    rehearsal: t('finish.rehearsal.body', { date: dateOf(race.windowStart, race) }),
    closed: t('finish.closed.body', { date: dateOf(race.windowEnd, race) }),
    incomplete: t('finish.incomplete.body'),
  }[outcome];
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="finish">
      <View style={styles.head}>
        <Eyebrow dark>{race.theme.displayName}</Eyebrow>
        {simulation ? (
          <Body dark muted style={styles.badge} testID="sim-badge-finish">
            {t('run.sim.badge')}
          </Body>
        ) : null}
      </View>

      {outcome === 'official' ? <Medal track={track} ribbon={accent} stripe={race.theme.onPrimary} image={race.theme.medal} /> : null}

      <View style={outcome === 'official' ? styles.centered : undefined}>
        <Display dark style={outcome === 'official' ? styles.titleCentered : undefined}>
          {title}
        </Display>
        {finished ? (
          <Num dark size={outcome === 'official' ? 104 : 88} testID="final-time" style={outcome === 'official' ? styles.timeCentered : undefined}>
            {formatClock(state.elapsedMs)}
          </Num>
        ) : (
          <Num dark size={88} testID="final-distance">
            {formatKm(state.distanceM, locale)}
          </Num>
        )}
        <Body dark muted style={outcome === 'official' ? styles.bodyCentered : undefined} testID="finish-verdict">
          {body}
        </Body>
      </View>

      <View style={styles.stats}>
        {finished ? <Stat label={t('common.distance')} value={formatKm(course.distanceM, locale, course.distanceKey === 'marathon' ? 3 : 1)} /> : <Stat label={t('run.elapsed')} value={formatClock(state.elapsedMs)} />}
        <Stat label={t('common.pace')} value={`${formatPace(averagePace(state.elapsedMs, finished ? course.distanceM : state.distanceM))} /km`} />
        <Stat label={t('result.bib')} value={entrant.bib} />
      </View>

      {outcome === 'official' ? (
        <View style={styles.actions}>
          <Button testID="share-finish" label={t('finish.share')} color={race.theme.primary} onColor={race.theme.onPrimary} onPress={() => void shareFinish(race, entrant, state.elapsedMs)} />
          <Button testID="open-certificate" label={t('finish.certificate')} ghost dark onPress={() => openCertificate(race, entrant.bib)} />
        </View>
      ) : null}

      <Body dark muted style={styles.upload} testID="upload-status">
        {uploadStatus === 'sent' ? `✓ ${t('upload.sent')}` : t('upload.pending')}
      </Body>

      {state.splits.length > 0 ? (
        <Card dark style={styles.splits}>
          <Body dark muted>
            {t('run.finished.splits')}
          </Body>
          {state.splits.map((s) => (
            <View key={s.km} style={styles.splitRow}>
              <Body dark muted style={styles.splitKm}>
                km {s.km}
              </Body>
              <Body dark style={styles.splitNum}>
                {formatClock(s.splitMs)}
              </Body>
              <Body dark muted style={styles.splitNum}>
                {formatClock(s.elapsedMs)}
              </Body>
            </View>
          ))}
        </Card>
      ) : null}

      <Button label={t('finish.home')} ghost dark onPress={onHome} testID="finish-home" />
      {/* The walk test is read here, outdoors, with no cable (docs/WORKFLOW.md, loop 2b). */}
      <Pressable onPress={onDiagnostics} testID="open-debug" style={styles.diag} accessibilityRole="button">
        <Body dark muted style={styles.diagText}>
          {t('debug.open')} · {t('run.gpsCounts', { accepted: state.accepted, rejected: state.rejected })}
        </Body>
      </Pressable>
    </ScrollView>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Body dark muted style={styles.statLabel}>
      {label}
    </Body>
    <Body dark style={styles.statValue}>
      {value}
    </Body>
  </View>
);

const styles = StyleSheet.create({
  scroll: { gap: space.md, paddingBottom: space.xl },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  badge: { fontSize: 12 },
  centered: { alignItems: 'center' },
  titleCentered: { textAlign: 'center' },
  timeCentered: { textAlign: 'center', marginTop: space.xs },
  bodyCentered: { textAlign: 'center', maxWidth: 320 },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.nightBorder, paddingVertical: space.md },
  stat: { flex: 1, gap: 2 },
  statLabel: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  statValue: { fontFamily: fonts.num, fontSize: 24, lineHeight: 28 },
  actions: { gap: space.sm },
  upload: { fontSize: 14, textAlign: 'center' },
  splits: { gap: 0 },
  splitRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.nightBorder },
  splitKm: { width: 64, fontSize: 15 },
  splitNum: { flex: 1, textAlign: 'right', fontFamily: fonts.num, fontSize: 20, fontVariant: ['tabular-nums'] },
  diag: { alignSelf: 'center', padding: space.sm, borderRadius: radius.sm },
  diagText: { fontSize: 13 },
});
