import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { fixTime, orphanFixes } from '@sivoov/shared';
import type { LocationSample } from '@sivoov/shared';
import { diag, diagCount } from '@/diag';
import { createBatteryLog, isLow } from '@/services/batteryLog';
import type { PowerReading } from '@/services/batteryLog';
import { t } from '@/i18n';
import { journalFiles } from '@/stores/journalFiles';
import { usePower } from '@/stores/power';
import { keepsTrackingLocked } from './permission';
import type { DevicePlatform, LocationPermission } from './permission';
import type { LocationSource } from './types';

export type { LocationPermission } from './permission';

/**
 * Real GPS. On iOS and Android the fixes come from a background task (expo-task-manager) so
 * they keep flowing with the phone in a pocket and the screen locked; on the web target the
 * foreground watch is the only option. The LocationSource interface does not change.
 */
export const LOCATION_TASK = 'sivoov-run-location';

/** The platform as the permission rules see it. */
export const platform: DevicePlatform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';

/** The background task runs outside React: it fans out to whichever source is active. */
let activeListener: ((sample: LocationSample) => void) | null = null;

const readPower = async (): Promise<PowerReading> => {
  const [power, optimized] = await Promise.all([
    Battery.getPowerStateAsync(),
    Platform.OS === 'android' ? Battery.isBatteryOptimizationEnabledAsync().catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const charging = power.batteryState === Battery.BatteryState.CHARGING || power.batteryState === Battery.BatteryState.FULL;
  return { level: power.batteryLevel, charging, lowPower: power.lowPowerMode, optimized };
};

/** Battery lines in the logbook for the whole run (the web target has no battery to read); each reading also says whether the phone is short. */
const battery =
  Platform.OS === 'web'
    ? null
    : createBatteryLog({ read: readPower, log: (m) => diag('battery', m), onReading: (r) => usePower.setState({ low: isLow(r) }), now: () => Date.now() });

export const toSample = (loc: Location.LocationObject): LocationSample => ({
  lat: loc.coords.latitude,
  lng: loc.coords.longitude,
  accuracy: loc.coords.accuracy ?? undefined,
  altitude: loc.coords.altitude ?? undefined,
  speed: loc.coords.speed !== null && loc.coords.speed >= 0 ? loc.coords.speed : undefined,
  // Whole milliseconds (iOS reports fractions), and the arrival time when the receiver's clock is absurd.
  timestamp: fixTime(loc.timestamp, Date.now()),
});

/**
 * Fixes with no run listening: the app was killed or crashed and Android kept (or restarted) the
 * location service, so the task runs on its own. A run still going gets them in its journal and
 * finds them when the app comes back; otherwise the GPS nobody reads is switched off.
 */
const keepOrphans = async (samples: LocationSample[]): Promise<void> => {
  const journal = await journalFiles.readMeta().catch(() => null);
  if (orphanFixes(journal, Date.now()) === 'keep') {
    diagCount('task.orphans', samples.length);
    await journalFiles.append(samples).catch(() => diagCount('task.dropped', samples.length));
    return;
  }
  diagCount('task.dropped', samples.length);
  diag('location', `dropped ${samples.length} fixes: no run is listening, updates stopped`);
  await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
};

// Must be defined at module top level, before any screen starts updates (expo-task-manager).
if (Platform.OS !== 'web') {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    const { locations = [] } = (data ?? {}) as { locations?: Location.LocationObject[] };
    diagCount('task.batches');
    if (error) {
      diagCount('task.errors');
      diag('location', `task error: ${error.message}`);
      return;
    }
    // The three ways a batch produces nothing, told apart. Getting this wrong cost two
    // blank runs (docs/MEMORY.md): an empty batch is Android throttling a stationary
    // phone, a null listener is the run not being wired to the task at all.
    if (locations.length === 0) {
      diagCount('task.empty');
      return;
    }
    if (!activeListener) return keepOrphans(locations.map(toSample));
    diagCount('task.fixes', locations.length);
    locations.map(toSample).forEach((sample) => activeListener?.(sample));
    battery?.due();
  });
  diag('location', `background task ${LOCATION_TASK} defined`);
}

const FOREGROUND_OPTIONS: Location.LocationOptions = { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 };

const BACKGROUND_OPTIONS: Location.LocationTaskOptions = {
  ...FOREGROUND_OPTIONS,
  activityType: Location.ActivityType.Fitness,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  deferredUpdatesInterval: 1000,
  deferredUpdatesDistance: 0,
  foregroundService: {
    notificationTitle: t('location.notification.title'),
    notificationBody: t('location.notification.body'),
    notificationColor: '#1d1c1a',
    // Swiping the app away must not end the race: the service and its fixes carry on, into the
    // run if the app's JavaScript survived, into the run's journal otherwise (`keepOrphans`).
    killServiceOnDestroy: false,
  },
};

/**
 * The phone runs short (`isLow`): a fix every two seconds instead of every second on Android, and
 * on iOS the plain best accuracy instead of the navigation mode Apple meant for a plugged-in phone,
 * with a 5 m filter. The tracker counts steps of 8 m and more anyway (2-3 s of running).
 */
const SAVER_OPTIONS: Location.LocationTaskOptions = {
  ...BACKGROUND_OPTIONS,
  ...(Platform.OS === 'ios' ? { accuracy: Location.Accuracy.Highest, distanceInterval: 5 } : { timeInterval: 2000, deferredUpdatesInterval: 2000 }),
};

/** Where the permissions stand now, without prompting. */
export const currentLocationPermission = async (): Promise<LocationPermission> => {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status === 'denied') return 'denied';
  if (fg.status !== 'granted') return 'undetermined';
  if (Platform.OS === 'web') return 'web';
  const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  return bg?.status === 'granted' ? 'always' : 'foreground';
};

/**
 * Foreground first. Android then asks for "always" (its settings page: the only way the fixes
 * survive a locked screen there). iOS is not asked for it: "while using" already keeps a run
 * started on screen measuring (`keepsTrackingLocked`), and a second prompt is one more chance
 * for the runner to refuse, and for App Review to ask why.
 */
export const requestLocationPermission = async (): Promise<LocationPermission> => {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  if (Platform.OS === 'web') return 'web';
  const bg = await (Platform.OS === 'ios' ? Location.getBackgroundPermissionsAsync() : Location.requestBackgroundPermissionsAsync()).catch(() => null);
  return bg?.status === 'granted' ? 'always' : 'foreground';
};

export interface DeviceLocationSource extends LocationSource {
  /** Null until start() asked; then what the runner granted. */
  permission: () => LocationPermission | null;
}

export const deviceSource = (): DeviceLocationSource => {
  let subscription: Location.LocationSubscription | null = null;
  let background = false;
  let permission: LocationPermission | null = null;

  let saving = false;
  let unsubscribePower: () => void = () => undefined;

  /** Once, when the battery runs low mid-run: never back, a GPS switched to and fro costs more than it saves. */
  const spare = async () => {
    if (!background || saving) return;
    saving = true;
    diag('location', 'battery low: GPS saver pace');
    await Location.startLocationUpdatesAsync(LOCATION_TASK, SAVER_OPTIONS).catch((e: unknown) => diag('location', `saver pace refused: ${e instanceof Error ? e.message : String(e)}`));
  };

  const watchForeground = async (onSample: (sample: LocationSample) => void) => {
    subscription = await Location.watchPositionAsync(FOREGROUND_OPTIONS, (loc) => onSample(toSample(loc)));
  };

  return {
    kind: 'device',
    now: () => Date.now(),
    permission: () => permission,
    async start(onSample) {
      permission = await requestLocationPermission();
      diag('location', `permission: ${permission}`);
      if (permission === 'denied') throw new Error('location_denied');
      // Not awaited: the gun has fired, the GPS must not wait. A low reading switches the pace when it
      // lands; what an earlier session read no longer counts (the phone may have charged since).
      usePower.setState({ low: false });
      saving = false;
      void battery?.start();
      if (!keepsTrackingLocked(permission, platform)) {
        diag('location', 'foreground watch only: fixes stop when the screen locks');
        return watchForeground(onSample);
      }
      // Background updates: the task defined above delivers the fixes, in and out of the app.
      activeListener = onSample;
      const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
      if (alreadyRunning) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
      const registered = await TaskManager.isTaskDefined(LOCATION_TASK);
      diag('location', `starting background updates (task defined: ${registered}, was running: ${alreadyRunning})`);
      try {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, BACKGROUND_OPTIONS);
      } catch (e) {
        diag('location', `startLocationUpdatesAsync failed: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
      background = true;
      diag('location', 'background updates started');
      unsubscribePower = usePower.subscribe((power) => {
        if (power.low) void spare();
      });
      if (usePower.getState().low) void spare();
    },
    async stop() {
      unsubscribePower();
      await battery?.stop();
      subscription?.remove();
      subscription = null;
      if (background) {
        activeListener = null;
        background = false;
        await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
        diag('location', 'background updates stopped');
      }
    },
  };
};
