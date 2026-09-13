import type { MessageKey, Params } from '@sivoov/shared';
import type { LocationPermission } from '@/services/location/device';

/** One pre-flight check as the screen shows it: a state and a French message key. */
export type CheckStatus = 'pending' | 'ok' | 'warn';
export type Check = { status: CheckStatus; key: MessageKey; params?: Params };

export const GPS_LOCK_ACCURACY_M = 30;
export const GPS_LOCK_TIMEOUT_MS = 30_000;
export const BATTERY_WARN_LEVEL = 0.5;

export const permissionCheck = (permission: LocationPermission | null): Check => {
  if (permission === null || permission === 'undetermined') return { status: 'pending', key: 'prepare.check.permission.pending' };
  if (permission === 'always') return { status: 'ok', key: 'prepare.check.permission.ok' };
  if (permission === 'web') return { status: 'ok', key: 'prepare.check.permission.web' };
  if (permission === 'foreground') return { status: 'warn', key: 'prepare.check.permission.foreground' };
  return { status: 'warn', key: 'prepare.check.permission.denied' };
};

/**
 * GPS lock: a fix under 30 m within 30 s. The best accuracy seen so far decides, so a
 * single good fix locks even if the next one is worse.
 */
export const gpsCheck = (bestAccuracyM: number | null, waitedMs: number): Check => {
  const accuracy = bestAccuracyM === null ? null : Math.round(bestAccuracyM);
  if (accuracy !== null && accuracy <= GPS_LOCK_ACCURACY_M) return { status: 'ok', key: 'prepare.check.gps.ok', params: { accuracy } };
  if (waitedMs < GPS_LOCK_TIMEOUT_MS) return { status: 'pending', key: 'prepare.check.gps.pending' };
  return accuracy === null ? { status: 'warn', key: 'prepare.check.gps.timeout' } : { status: 'warn', key: 'prepare.check.gps.weak', params: { accuracy } };
};

/** Battery level in [0, 1]; -1 or null means the platform does not report it (web). */
export const batteryCheck = (level: number | null | undefined): Check => {
  if (level === undefined) return { status: 'pending', key: 'prepare.check.battery.pending' };
  if (level === null || level < 0) return { status: 'ok', key: 'prepare.check.battery.unknown' };
  const pct = Math.round(level * 100);
  return level < BATTERY_WARN_LEVEL ? { status: 'warn', key: 'prepare.check.battery.low', params: { level: pct } } : { status: 'ok', key: 'prepare.check.battery.ok', params: { level: pct } };
};

/** Headphones cannot be detected without a native module: it is a hint, never blocking. */
export const headphonesCheck = (): Check => ({ status: 'ok', key: 'prepare.check.headphones' });

/** The Run button: GPS lock and the permission both ok. Battery and headphones only warn. */
export const canStart = (checks: { permission: Check; gps: Check }): boolean => checks.gps.status === 'ok' && checks.permission.status === 'ok';
