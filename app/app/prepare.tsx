import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Battery from 'expo-battery';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { Preflight } from '@/components/Preflight';
import { Body, Button, Display, Eyebrow, Screen } from '@/components/ui';
import { usePackDownload } from '@/hooks/usePackDownload';
import { locale, t } from '@/i18n';
import { requestLocationPermission } from '@/services/location/device';
import type { LocationPermission } from '@/services/location/device';
import { GPS_LOCK_TIMEOUT_MS, batteryCheck, canStart, gpsCheck, headphonesCheck, packCheck, permissionCheck } from '@/services/preflight';
import { useSession } from '@/stores/session';
import { space } from '@/theme';

/** Asks for the permissions, then watches the GPS until it locks or 30 s pass. */
const useChecks = () => {
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [bestAccuracy, setBestAccuracy] = useState<number | null>(null);
  const [waitedMs, setWaitedMs] = useState(0);
  const [battery, setBattery] = useState<number | null | undefined>(undefined);
  const [round, setRound] = useState(0);
  const retry = useCallback(() => {
    setPermission(null);
    setBestAccuracy(null);
    setWaitedMs(0);
    setRound((r) => r + 1);
  }, []);

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
      });
    };
    void watch();
    const stopAt = setTimeout(() => sub?.remove(), GPS_LOCK_TIMEOUT_MS + 1000);
    return () => {
      cancelled = true;
      clearInterval(clock);
      clearTimeout(stopAt);
      sub?.remove();
    };
  }, [round]);

  useEffect(() => {
    if (Platform.OS === 'web') return setBattery(null);
    Battery.getBatteryLevelAsync()
      .then((level) => setBattery(level))
      .catch(() => setBattery(null));
  }, [round]);

  return {
    checks: { permission: permissionCheck(permission), gps: gpsCheck(bestAccuracy, waitedMs), battery: batteryCheck(battery), headphones: headphonesCheck() },
    retry,
  };
};

export default function Prepare() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const { checks, retry } = useChecks();
  // The pack comes down here too, so it is on the phone before the start line.
  const audio = usePackDownload(me?.course ?? null);
  const race = me?.race ?? null;
  const ready = canStart(checks);

  return (
    <Screen style={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg, gap: space.md }}>
      {race ? <Eyebrow>{race.theme.displayName}</Eyebrow> : null}
      <Display>{t('prepare.title')}</Display>
      <Body muted>{t('prepare.intro')}</Body>
      <Preflight checks={{ ...checks, pack: packCheck(audio, locale) }} />
      {checks.permission.status === 'warn' && Platform.OS !== 'web' ? (
        <Button testID="open-settings" label={t('prepare.settings')} ghost onPress={() => void Linking.openSettings()} />
      ) : null}
      <View style={{ flex: 1 }} />
      <Button testID="go-start" label={t('prepare.go')} color={race?.theme.primary} onColor={race?.theme.onPrimary} disabled={!ready} onPress={() => router.push('/run')} />
      <Button
        label={t('prepare.retry')}
        ghost
        onPress={() => {
          retry();
          audio.retry();
        }}
      />
      <Button label={t('common.back')} ghost onPress={() => router.back()} />
    </Screen>
  );
}
