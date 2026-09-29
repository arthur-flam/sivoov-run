import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Course, Race } from '@sivoov/shared';
import { DEMO_PACE_S_PER_KM, DEMO_RUN_MINUTES, demoSpeedFor, formatPace } from '@sivoov/shared';
import { Body, Button } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme';

/**
 * The whole course heard in about ten minutes, simulated, without GPS. In a demo race
 * (`race.demoOf`), for an organizer at a desk and for App Review, which cannot run 10 km; and
 * wherever the rehearsal is offered (`rehearsal`: preview, local, test accounts), to test the
 * course without running it. The run is stored as a simulation and never ranked.
 */
export const DemoRun = ({ race, course, rehearsal }: { race: Race; course: Course; rehearsal: boolean }) => {
  const router = useRouter();
  if (!race.demoOf && !rehearsal) return null;
  // The start ceremony too: a race heard without its start would open in silence.
  const params = { sim: '1', ceremony: '1', pace: formatPace(DEMO_PACE_S_PER_KM), speed: String(demoSpeedFor(course.distanceM)) };
  return (
    <View style={styles.demo}>
      <Button testID="demo-run" label={t('home.demo', { minutes: DEMO_RUN_MINUTES })} ghost onPress={() => router.push({ pathname: '/run', params })} />
      <Body muted style={styles.note}>
        {race.demoOf ? t('home.demo.note') : t('home.simulate.note')}
      </Body>
    </View>
  );
};

const styles = StyleSheet.create({
  demo: { gap: space.sm },
  note: { fontSize: 14, textAlign: 'center' },
});
