import { Linking, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { daysUntilWindow, distanceLabel, formatDistanceLine, formatOfficialTime, lastFinishedRun, windowPhase } from '@sivoov/shared';
import { AccountActions } from '@/components/AccountActions';
import { CourseMap } from '@/components/CourseMap';
import { DemoRun } from '@/components/DemoRun';
import { FinisherShare } from '@/components/FinisherShare';
import { RacePhotos } from '@/components/RacePhotos';
import { Body, Button, Card, Display, Eyebrow, Num, Screen } from '@/components/ui';
import { useMyResult } from '@/hooks/useMyResult';
import { useMapDownload } from '@/hooks/useMapDownload';
import { usePackDownload } from '@/hooks/usePackDownload';
import { useTrack } from '@/hooks/useTrack';
import { useRunRecovery } from '@/hooks/useRunRecovery';
import { useUploadFlush } from '@/hooks/useUploadFlush';
import { currentLocale, t, useLocale } from '@/i18n';
import { openResults, shareBib } from '@/share';
import { useSession } from '@/stores/session';
import { useUploads } from '@/stores/uploads';
import { colors, fonts, space } from '@/theme';

/** "9 novembre", or "27 septembre 2026" when the window spans more than one year (a demo race's). */
const fmt = (iso: string, tz: string, year: boolean) =>
  new Intl.DateTimeFormat(currentLocale() === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: tz }).format(new Date(iso));

export default function Home() {
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const me = useSession((s) => s.me);
  const error = useSession((s) => s.error);
  const signOut = useSession((s) => s.signOut);
  const refresh = useSession((s) => s.refresh);
  const token = useSession((s) => s.token);
  const pendingUploads = useUploadFlush(token);
  // Back in a run the app lost (killed, crashed, phone restarted), or its upload queued if it is over.
  useRunRecovery(me?.entrant.id ?? null, token);
  const best = useMyResult();
  const track = useTrack(me?.course ?? null);
  usePackDownload(me?.course ?? null);
  // The run screen's map, kept on the phone while the runner is likely on Wi-Fi.
  useMapDownload(me?.course?.id ?? null, track, me?.map?.token ?? null);
  // Back from a run, the server may know something new: ask again whenever the screen returns.
  useFocusEffect(useCallback(() => void useSession.getState().refresh().catch(() => undefined), []));

  if (!me) {
    return (
      <Screen style={{ paddingTop: insets.top + space.xl, gap: space.md }}>
        <Display>{error === 'offline' ? t('home.offline') : t('common.loading')}</Display>
        {error ? <Button label={t('common.retry')} onPress={() => void refresh().catch(() => undefined)} /> : null}
        <Button label={t('home.signout')} ghost onPress={() => void signOut().then(() => router.replace('/signin'))} />
      </Screen>
    );
  }

  const { entrant, race, course } = me;
  const lastFinished = best ?? (course ? lastFinishedRun(me.runs, course.distanceM) : null);
  const now = Date.now();
  const phase = windowPhase(race, now);
  const days = daysUntilWindow(race, now);
  const windowLine = phase === 'open' ? t('home.openNow') : phase === 'after' ? t('home.closed') : days <= 1 ? t('home.opensTomorrow') : t('home.opensIn', { count: days });
  const spansYears = new Date(race.windowStart).getUTCFullYear() !== new Date(race.windowEnd).getUTCFullYear();

  return (
    <Screen style={{ paddingTop: insets.top + space.lg }}>
      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        <Eyebrow>{race.theme.displayName}</Eyebrow>
        {error === 'offline' ? (
          <Card>
            <Body testID="offline-banner">{t('home.offlineCached')}</Body>
            <Button label={t('common.retry')} ghost onPress={() => void refresh().catch(() => undefined)} />
          </Card>
        ) : null}
        <Display>{best ? t('home.finisher.title', { firstName: entrant.firstName }) : t('signin.welcome', { firstName: entrant.firstName })}</Display>

        {/* After an official finish the home is the finish: the report, the share, the photos; running again comes after. */}
        {best ? (
          <Card style={styles.cardActions}>
            <Body muted>{t('home.finisher.body', { distance: distanceLabel(locale, entrant.distanceKey) })}</Body>
            <Num size={72} testID="finisher-time">
              {formatOfficialTime(best.elapsedMs)}
            </Num>
            <FinisherShare race={race} entrant={entrant} elapsedMs={best.elapsedMs} showReport={me.runs.some((r) => r.id === best.id)} />
          </Card>
        ) : null}
        {/* The photos of the last run that reached the line, race or rehearsal alike. */}
        {lastFinished && course ? (
          <RacePhotos
            race={race}
            token={token}
            run={lastFinished.startedAt ? { startedAtMs: Date.parse(lastFinished.startedAt), elapsedMs: lastFinished.elapsedMs, splits: lastFinished.splits } : null}
            officialM={course.distanceM}
            finished
          />
        ) : null}

        <Card style={styles.bibCard}>
          <View style={{ flex: 1 }}>
            <Body muted>{t('home.yourEntry')}</Body>
            <Num size={72} testID="bib-number">
              {entrant.bib}
            </Num>
            <Body style={styles.distance} testID="distance-line">
              {course ? formatDistanceLine(course.distanceM, course.distanceKey, locale) : distanceLabel(locale, entrant.distanceKey)}
            </Body>
            {!best && phase !== 'after' ? (
              <View style={styles.cardActions}>
                <Button testID="share-bib" label={t('home.shareBib')} ghost onPress={() => void shareBib(race, entrant)} />
              </View>
            ) : null}
          </View>
          <View style={[styles.stripe, { backgroundColor: race.theme.primary }]} />
        </Card>
        <Card>
          <Body muted>{t('home.window')}</Body>
          <Body style={styles.big}>{windowLine}</Body>
          <Body muted>
            {fmt(race.windowStart, race.timezone, spansYears)} → {fmt(race.windowEnd, race.timezone, spansYears)}
          </Body>
        </Card>
        {pendingUploads > 0 ? (
          <Card>
            <Body testID="pending-uploads">{t('upload.pendingCount', { count: pendingUploads })}</Body>
            <Button label={t('upload.retry')} ghost onPress={() => token && void useUploads.getState().flush(token).catch(() => undefined)} />
          </Card>
        ) : null}

        {course && phase === 'open' ? (
          <View style={styles.cta}>
            <Button
              testID="go-run"
              label={best ? t('home.runAgain') : t('home.run')}
              color={race.theme.primary}
              onColor={race.theme.onPrimary}
              ghost={best !== null}
              onPress={() => router.push('/prepare')}
            />
            {best ? (
              <Body muted style={styles.note}>
                {t('home.runAgain.note')}
              </Body>
            ) : null}
          </View>
        ) : null}
        {course && phase === 'before' && me.rehearsal ? (
          <View style={styles.cta}>
            <Button testID="go-rehearse" label={t('home.rehearse')} color={race.theme.primary} onColor={race.theme.onPrimary} onPress={() => router.push('/prepare')} />
            <Body muted style={styles.note}>
              {t('home.rehearse.note')}
            </Body>
            <Body muted style={styles.note} testID="rehearse-who">
              {t('home.rehearse.who')}
            </Body>
          </View>
        ) : null}
        {course ? <DemoRun race={race} course={course} rehearsal={me.rehearsal} /> : null}
        {phase === 'after' ? <Button testID="open-results" label={t('home.results')} color={race.theme.primary} onColor={race.theme.onPrimary} onPress={() => openResults(race)} /> : null}
        {course && track ? <CourseMap courseId={course.id} track={track} landmarks={course.landmarks} officialM={course.distanceM} distanceKey={course.distanceKey} accent={race.theme.primary} onAccent={race.theme.onPrimary} width={width - 2 * space.md - 2} /> : null}
        {race.supportEmail ? (
          <Card>
            <Body muted>{t('home.help')}</Body>
            <Button testID="write-organizer" label={t('home.helpWrite')} ghost onPress={() => void Linking.openURL(`mailto:${race.supportEmail}`)} />
          </Card>
        ) : null}

        {__DEV__ ? (
          <Link testID="dev-sim-link" href={{ pathname: '/run', params: { sim: '1', pace: '5:00', speed: '30' } }} style={styles.devLink}>
            {t('run.sim.badge')} · 5:00/km · ×30
          </Link>
        ) : null}
        <AccountActions />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardActions: { gap: space.sm, marginTop: space.sm },
  bibCard: { flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  stripe: { width: 10, borderRadius: 5, marginLeft: space.md },
  big: { fontSize: 22, lineHeight: 28 },
  distance: { fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 24 },
  cta: { gap: space.sm },
  note: { fontSize: 14, textAlign: 'center' },
  devLink: { color: colors.muted, textAlign: 'center', fontSize: 13, padding: space.sm },
});
