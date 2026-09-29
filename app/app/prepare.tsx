import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Battery from 'expo-battery';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { Preflight } from '@/components/Preflight';
import { Body, Button, Display, Eyebrow, Screen } from '@/components/ui';
import { usePackDownload } from '@/hooks/usePackDownload';
import { t, useLocale } from '@/i18n';
import { platform, requestLocationPermission } from '@/services/location/device';
import type { LocationPermission } from '@/services/location/device';
import { batteryCheck, canStart, gpsCheck, headphonesCheck, packCheck, permissionCheck } from '@/services/preflight';
import { useSession } from '@/stores/session';
import { space } from '@/theme';

/** Pack downloads that failed are tried again this often while the pre-flight is open. */
const PACK_RETRY_MS = 15_000;

/**
 * Asks for the permissions, then watches the GPS for as long as the screen is open: after 30 s
 * without a lock the row says to move to open sky, and turns green when the lock comes.
 */
const useChecks = () => {
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [bestAccuracy, setBestAccuracy] = useState<number | null>(null);
  /** Where the phone is, to a kilometre or so: only for the weather in the runner's own lines. */
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [waitedMs, setWaitedMs] = useState(0);
  const [battery, setBattery] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    const startedAt = Date.now();
    const clock = setInterval(() => setWaitedMs(Date.now() - startedAt), 1000);
    const watch = async () => {
      const granted = await requestLocationPermission().catch(() => 'denied' as const);
      if (cancelled) return;
      setPermission(granted);
      if (granted === 'denied') return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (loc) => {
        const accuracy = loc.coords.accuracy;
        if (accuracy !== null && accuracy !== undefined) setBestAccuracy((best) => (best === null ? accuracy : Math.min(best, accuracy)));
        const rounded = { lat: Math.round(loc.coords.latitude * 100) / 100, lng: Math.round(loc.coords.longitude * 100) / 100 };
        setHere((known) => known ?? rounded);
      });
    };
    void watch();
    return () => {
      cancelled = true;
      clearInterval(clock);
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return setBattery(null);
    Battery.getBatteryLevelAsync()
      .then((level) => setBattery(level))
      .catch(() => setBattery(null));
  }, []);

  return {
    checks: { permission: permissionCheck(permission, platform), gps: gpsCheck(bestAccuracy, waitedMs), battery: batteryCheck(battery), headphones: headphonesCheck() },
    here,
  };
};

export default function Prepare() {
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const { checks, here } = useChecks();
  // The pack comes down here too, so it is on the phone before the start line, with the runner's
  // own lines; a pack published since the race home loaded replaces the one on the phone.
  const audio = usePackDownload(me?.course ?? null, here, { update: true });
  const race = me?.race ?? null;
  const ready = canStart(checks);
  // The screen redraws every second (the GPS clock): the retry is read from a ref so the wait is not restarted.
  const retryPack = useRef(audio.retry);
  retryPack.current = audio.retry;
  useEffect(() => {
    if (audio.status !== 'error') return;
    const again = setTimeout(() => retryPack.current(), PACK_RETRY_MS);
    return () => clearTimeout(again);
  }, [audio.status]);

  return (
    <Screen style={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg, gap: space.md }}>
      <ScrollView style={styles.checks} contentContainerStyle={{ gap: space.md }}>
        {race ? <Eyebrow>{race.theme.displayName}</Eyebrow> : null}
        <Display>{t('prepare.title')}</Display>
        <Body muted>{t('prepare.intro')}</Body>
        <Preflight checks={{ ...checks, pack: packCheck(audio, locale) }} />
        {checks.permission.status === 'warn' && Platform.OS !== 'web' ? (
          <Button testID="open-settings" label={t('prepare.settings')} ghost onPress={() => void Linking.openSettings()} />
        ) : null}
      </ScrollView>
      <View style={{ gap: space.sm }}>
        <Button testID="go-start" label={t('prepare.go')} color={race?.theme.primary} onColor={race?.theme.onPrimary} disabled={!ready} onPress={() => router.push('/run')} />
        <Button testID="prepare-back" label={t('common.back')} ghost onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  checks: { flex: 1 },
});
