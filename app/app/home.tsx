import { ScrollView, StyleSheet, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { distanceLabel } from '@sivoov/shared';
import { CourseMap } from '@/components/CourseMap';
import { Body, Button, Card, Display, Eyebrow, Num, Screen } from '@/components/ui';
import { locale, t } from '@/i18n';
import { useSession } from '@/stores/session';
import { useUploadFlush } from '@/hooks/useUploadFlush';
import { useUploads } from '@/stores/uploads';
import { colors, space } from '@/theme';

const fmt = (iso: string, tz: string) => new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', timeZone: tz }).format(new Date(iso));

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const error = useSession((s) => s.error);
  const signOut = useSession((s) => s.signOut);
  const refresh = useSession((s) => s.refresh);
  const token = useSession((s) => s.token);
  const pendingUploads = useUploadFlush(token);

  if (!me) {
    return (
      <Screen style={{ paddingTop: insets.top + space.xl, gap: space.md }}>
        <Display>{error === 'offline' ? 'Hors ligne' : t('common.loading')}</Display>
        {error ? <Button label={t('common.retry')} onPress={() => void refresh()} /> : null}
        <Button label={t('home.signout')} ghost onPress={() => void signOut().then(() => router.replace('/signin'))} />
      </Screen>
    );
  }

  const { entrant, race, course } = me;
  const accent = race.theme.primary;
  return (
    <Screen style={{ paddingTop: insets.top + space.lg }}>
      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        <Eyebrow>{race.theme.displayName}</Eyebrow>
        <Display>{t('signin.welcome', { firstName: entrant.firstName })}</Display>
        <Card style={styles.bibCard}>
          <View style={{ flex: 1 }}>
            <Body muted>{t('home.yourEntry')}</Body>
            <Num size={72} testID="bib-number">{entrant.bib}</Num>
          </View>
          <View style={[styles.stripe, { backgroundColor: accent }]} />
        </Card>
        <Card>
          <Body muted>{t('home.yourDistance')}</Body>
          <Body style={styles.big}>{distanceLabel(locale, entrant.distanceKey)}</Body>
          <Body muted>{course ? `${(course.distanceM / 1000).toFixed(course.distanceKey === 'marathon' ? 3 : 1).replace('.', locale === 'fr' ? ',' : '.')} km · ${course.landmarks.length} ${locale === 'fr' ? 'lieux racontés' : 'landmarks'}` : ''}</Body>
        </Card>
        {course ? <CourseMap courseId={course.id} caption={t('home.mapCaption')} /> : null}
        <Card>
          <Body muted>{t('home.window')}</Body>
          <Body style={styles.big}>
            {fmt(race.windowStart, race.timezone)} → {fmt(race.windowEnd, race.timezone)}
          </Body>
        </Card>
        {pendingUploads > 0 ? (
          <Card>
            <Body testID="pending-uploads">{t('upload.pendingCount', { count: pendingUploads })}</Body>
            <Button label={t('upload.retry')} ghost onPress={() => token && void useUploads.getState().flush(token).catch(() => undefined)} />
          </Card>
        ) : null}
        {course ? <Button testID="go-run" label={t('home.run')} color={accent} onColor={race.theme.onPrimary} onPress={() => router.push('/prepare')} /> : null}
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
  bibCard: { flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  stripe: { width: 10, borderRadius: 5, marginLeft: space.md },
  big: { fontSize: 22, lineHeight: 28 },
  devLink: { color: colors.muted, textAlign: 'center', fontSize: 13, padding: space.sm },
});
