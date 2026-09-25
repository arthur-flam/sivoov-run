import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { daysUntilWindow, distanceLabel, formatKm, formatOfficialTime, windowPhase } from '@sivoov/shared';
import { CourseDiagram } from '@/components/CourseDiagram';
import { CourseMap } from '@/components/CourseMap';
import { Body, Button, Card, Display, Eyebrow, Num, Screen } from '@/components/ui';
import { useMyResult } from '@/hooks/useMyResult';
import { useTrack } from '@/hooks/useTrack';
import { useUploadFlush } from '@/hooks/useUploadFlush';
import { locale, t } from '@/i18n';
import { openCertificate, openResults, shareBib, shareFinish } from '@/share';
import { useSession } from '@/stores/session';
import { useUploads } from '@/stores/uploads';
import { colors, fonts, radius, space } from '@/theme';

const fmt = (iso: string, tz: string) => new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', timeZone: tz }).format(new Date(iso));

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const me = useSession((s) => s.me);
  const error = useSession((s) => s.error);
  const signOut = useSession((s) => s.signOut);
  const refresh = useSession((s) => s.refresh);
  const token = useSession((s) => s.token);
  const pendingUploads = useUploadFlush(token);
  const best = useMyResult();
  const track = useTrack(me?.course ?? null);
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
  const now = Date.now();
  const phase = windowPhase(race, now);
  const days = daysUntilWindow(race, now);
  const windowLine = phase === 'open' ? t('home.openNow') : phase === 'after' ? t('home.closed') : days <= 1 ? t('home.opensTomorrow') : t('home.opensIn', { count: days });
  const diagramW = width - 2 * space.md - 2;

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
        <Display>{t('signin.welcome', { firstName: entrant.firstName })}</Display>

        {best ? (
          <View style={[styles.finisher, { backgroundColor: race.theme.primary }]} testID="finisher-card">
            <Body style={[styles.finisherLabel, { color: race.theme.primary, backgroundColor: race.theme.onPrimary }]}>{t('home.finisher')}</Body>
            <Num size={72} style={{ color: race.theme.onPrimary }} testID="finisher-time">
              {formatOfficialTime(best.elapsedMs)}
            </Num>
            <Body style={{ color: race.theme.onPrimary, opacity: 0.85 }}>{t('home.finisher.body', { distance: distanceLabel(locale, entrant.distanceKey) })}</Body>
            <View style={styles.finisherActions}>
              <Button label={t('finish.share')} color={race.theme.onPrimary} onColor={race.theme.primary} onPress={() => void shareFinish(race, entrant, best.elapsedMs)} />
              <Button label={t('finish.certificate')} ghost dark onPress={() => openCertificate(race, entrant.bib)} />
            </View>
          </View>
        ) : null}

        <Card style={styles.bibCard}>
          <View style={{ flex: 1 }}>
            <Body muted>{t('home.yourEntry')}</Body>
            <Num size={72} testID="bib-number">
              {entrant.bib}
            </Num>
            {!best && phase !== 'after' ? (
              <Pressable testID="share-bib" accessibilityRole="button" onPress={() => void shareBib(race, entrant)} style={styles.shareBib}>
                <Body style={[styles.shareBibLabel, { color: race.theme.primary }]}>{t('home.shareBib')} →</Body>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.stripe, { backgroundColor: race.theme.primary }]} />
        </Card>
        <Card>
          <Body muted>{t('home.yourDistance')}</Body>
          <Body style={styles.big}>{distanceLabel(locale, entrant.distanceKey)}</Body>
          <Body muted>{course ? `${formatKm(course.distanceM, locale, course.distanceKey === 'marathon' ? 3 : 1)} · ${t('home.landmarks', { count: course.landmarks.length })}` : ''}</Body>
        </Card>
        {course ? (
          <CourseMap
            courseId={course.id}
            caption={t('home.mapCaption')}
            fallback={
              track ? (
                <View style={styles.diagram}>
                  <CourseDiagram track={track} officialM={course.distanceM} runM={0} landmarks={course.landmarks} accent={race.theme.primary} width={diagramW} height={diagramW * 0.62} dark={false} />
                </View>
              ) : null
            }
          />
        ) : null}
        <Card>
          <Body muted>{t('home.window')}</Body>
          <Body style={styles.big}>{windowLine}</Body>
          <Body muted>
            {fmt(race.windowStart, race.timezone)} → {fmt(race.windowEnd, race.timezone)}
          </Body>
        </Card>
        {pendingUploads > 0 ? (
          <Card>
            <Body testID="pending-uploads">{t('upload.pendingCount', { count: pendingUploads })}</Body>
            <Button label={t('upload.retry')} ghost onPress={() => token && void useUploads.getState().flush(token).catch(() => undefined)} />
          </Card>
        ) : null}

        {course && phase !== 'after' ? (
          <View style={styles.cta}>
            <Button
              testID="go-run"
              label={phase === 'before' ? t('home.rehearse') : best ? t('home.runAgain') : t('home.run')}
              color={race.theme.primary}
              onColor={race.theme.onPrimary}
              ghost={phase === 'open' && best !== null}
              onPress={() => router.push('/prepare')}
            />
            {phase === 'before' || best ? (
              <Body muted style={styles.note}>
                {phase === 'before' ? t('home.rehearse.note') : t('home.runAgain.note')}
              </Body>
            ) : null}
          </View>
        ) : null}
        {phase === 'after' ? <Button testID="open-results" label={t('home.results')} color={race.theme.primary} onColor={race.theme.onPrimary} onPress={() => openResults(race)} /> : null}

        {__DEV__ ? (
          <Link testID="dev-sim-link" href={{ pathname: '/run', params: { sim: '1', pace: '5:00', speed: '30' } }} style={styles.devLink}>
            {t('run.sim.badge')} · 5:00/km · ×30
          </Link>
        ) : null}
        <Button label={t('home.signout')} ghost onPress={() => void signOut().then(() => router.replace('/signin'))} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  finisher: { borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  finisherLabel: { alignSelf: 'flex-start', fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  finisherActions: { gap: space.sm, marginTop: space.md },
  bibCard: { flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  stripe: { width: 10, borderRadius: 5, marginLeft: space.md },
  shareBib: { alignSelf: 'flex-start', paddingVertical: space.sm, marginTop: space.xs },
  shareBibLabel: { fontFamily: fonts.bodyBold, fontSize: 15 },
  big: { fontSize: 22, lineHeight: 28 },
  diagram: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center' },
  cta: { gap: space.sm },
  note: { fontSize: 14, textAlign: 'center' },
  devLink: { color: colors.muted, textAlign: 'center', fontSize: 13, padding: space.sm },
});
