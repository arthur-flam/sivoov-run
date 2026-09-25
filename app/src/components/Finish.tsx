import { useEffect } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { averagePace, formatClock, formatKm, formatPace } from '@sivoov/shared';
import type { Course, EntrantPublic, FinishOutcome, Race, RunState } from '@sivoov/shared';
import { Body, Button, Card, Display, Eyebrow, Num } from '@/components/ui';
import { locale, t } from '@/i18n';
import { openCertificate, shareFinish } from '@/share';
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

const dateOf = (iso: string, race: Race) => new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', timeZone: race.timezone }).format(new Date(iso));

/**
 * The finish line: the time, what it counts for, and for an official finish two ways to tell
 * people. Built from the existing components only: the visual identity is not decided yet
 * (docs/DESIGN.md), so this screen carries no decoration of its own. The organizer's medal
 * photo shows when the race theme has one.
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
  const km = course.distanceKey === 'marathon' ? 3 : 1;
  const facts = finished
    ? [formatKm(course.distanceM, locale, km), `${formatPace(averagePace(state.elapsedMs, course.distanceM))} /km`, `${t('result.bib')} ${entrant.bib}`]
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
          {formatKm(state.distanceM, locale)}
        </Num>
      )}
      <Body dark muted testID="finish-verdict">
        {body}
      </Body>
      <Body dark>{facts.join(' · ')}</Body>

      {outcome === 'official' ? (
        <>
          <Button testID="share-finish" label={t('finish.share')} color={race.theme.primary} onColor={race.theme.onPrimary} onPress={() => void shareFinish(race, entrant, state.elapsedMs)} />
          <Button testID="open-certificate" label={t('finish.certificate')} ghost dark onPress={() => openCertificate(race, entrant.bib)} />
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
  splitRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4 },
  splitKm: { width: 64 },
  splitNum: { flex: 1, textAlign: 'right', fontFamily: fonts.num, fontSize: 20, fontVariant: ['tabular-nums'] },
});
