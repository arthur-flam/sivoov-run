import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Course, Race } from '@sivoov/shared';
import { DEMO_PACE_S_PER_KM, DEMO_RUN_MINUTES, demoSpeedFor, formatPace } from '@sivoov/shared';
import { Body, Button } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme';

/**
 * A demo race only (`race.demoOf`): the whole course heard in about ten minutes, simulated,
 * without GPS. For an organizer at a desk, and for App Review, which cannot run 10 km. The run
 * is stored as a simulation and never ranked.
 */
export const DemoRun = ({ race, course }: { race: Race; course: Course }) => {
  const router = useRouter();
  if (!race.demoOf) return null;
  const params = { sim: '1', pace: formatPace(DEMO_PACE_S_PER_KM), speed: String(demoSpeedFor(course.distanceM)) };
  return (
    <View style={styles.demo}>
      <Button testID="demo-run" label={t('home.demo', { minutes: DEMO_RUN_MINUTES })} ghost onPress={() => router.push({ pathname: '/run', params })} />
      <Body muted style={styles.note}>
        {t('home.demo.note')}
      </Body>
    </View>
  );
};

const styles = StyleSheet.create({
  demo: { gap: space.sm },
  note: { fontSize: 14, textAlign: 'center' },
});
