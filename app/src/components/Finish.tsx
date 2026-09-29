import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { averagePace, formatClock, formatKm, formatOfficialKm, formatPace, raceReport } from '@sivoov/shared';
import type { Course, EntrantPublic, FinishOutcome, Race, RunState } from '@sivoov/shared';
import { Body, Button, Card, Display, Eyebrow, Num } from '@/components/ui';
import { currentLocale, t } from '@/i18n';
import { openCertificate, reportImageUrl, shareFinish } from '@/share';
import type { UploadStatus } from '@/stores/uploads';
import { fonts, space } from '@/theme';

type Props = {
  race: Race;
  course: Course;
  entrant: EntrantPublic;
  state: RunState;
  outcome: FinishOutcome;
  simulation: boolean;
  uploadStatus: UploadStatus;
  onHome: () => void;
  onDiagnostics: () => void;
};

const dateOf = (iso: string, race: Race) => new Intl.DateTimeFormat(currentLocale() === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', timeZone: race.timezone }).format(new Date(iso));

/**
 * The finish line: the time, what it counts for, and for an official finish what the runner
 * can be proud of (a negative split) and the race report they share, once it has reached the
 * results. Built from the existing components; the organizer's medal photo shows when the race
 * theme has one.
 */
export const Finish = ({ race, course, entrant, state, outcome, simulation, uploadStatus, onHome, onDiagnostics }: Props) => {
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
  // The halves need no network: they come from the run's own splits.
  const halves = outcome === 'official' ? raceReport({ id: 'local', elapsedMs: state.elapsedMs, splits: state.splits }, course.distanceM, [], null).halves : null;
  // The report is drawn by the Worker from the result: it exists once the run is uploaded.
  const [reportShown, setReportShown] = useState(true);
  const facts = finished
    ? [formatOfficialKm(course.distanceM, course.distanceKey, currentLocale()), `${formatPace(averagePace(state.elapsedMs, course.distanceM))} /km`, `${t('result.bib')} ${entrant.bib}`]
    : [formatClock(state.elapsedMs), `${formatPace(averagePace(state.elapsedMs, state.distanceM))} /km`, `${t('result.bib')} ${entrant.bib}`];

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
      {outcome === 'official' && race.theme.medal ? <Image source={{ uri: race.theme.medal }} style={styles.medal} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
      <Display dark>{title}</Display>
      {finished ? (
        <Num dark size={96} testID="final-time">
          {formatClock(state.elapsedMs)}
        </Num>
      ) : (
        <Num dark size={96} testID="final-distance">
          {formatKm(state.distanceM, currentLocale())}
        </Num>
      )}
      <Body dark muted testID="finish-verdict">
        {body}
      </Body>
      <Body dark>{facts.join(' · ')}</Body>
      {halves?.negative ? (
        <Body dark testID="finish-negative">
          {t('report.negative', { time: formatClock(halves.firstMs - halves.secondMs) })}
        </Body>
      ) : null}

      {outcome === 'official' && uploadStatus === 'sent' && reportShown ? (
        <Image
          testID="finish-report"
          source={{ uri: reportImageUrl(race, entrant.bib, 'post') }}
          style={styles.report}
          resizeMode="contain"
          accessibilityLabel={t('report.title')}
          onError={() => setReportShown(false)}
        />
      ) : null}
      {outcome === 'official' ? (
        <>
          <Button testID="share-finish" label={t('finish.share')} color={race.theme.primary} onColor={race.theme.onPrimary} onPress={() => void shareFinish(race, entrant, state.elapsedMs)} />
          <Button testID="open-certificate" label={t('finish.images')} ghost dark onPress={() => openCertificate(race, entrant.bib)} />
          <Body dark muted>
            {t('finish.images.hint')}
          </Body>
        </>
      ) : null}
      <Body dark muted testID="upload-status">
        {uploadStatus === 'sent' ? t('upload.sent') : t('upload.pending')}
      </Body>

      {state.splits.length > 0 ? (
        <Card dark>
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
      <Body dark muted>
        {t('run.gpsCounts', { accepted: state.accepted, rejected: state.rejected })}
      </Body>
      <Button label={t('debug.open')} ghost dark testID="open-debug" onPress={onDiagnostics} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { gap: space.md, paddingBottom: space.xl },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  badge: { fontSize: 12 },
  medal: { width: '100%', height: 200 },
  report: { width: '100%', aspectRatio: 1080 / 1350, borderRadius: 8 },
  splitRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4 },
  splitKm: { width: 64 },
  splitNum: { flex: 1, textAlign: 'right', fontFamily: fonts.num, fontSize: 20, fontVariant: ['tabular-nums'] },
});
