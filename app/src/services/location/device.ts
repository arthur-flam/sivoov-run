import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { LocationSample } from '@sivoov/shared';
import { diag, diagCount } from '@/diag';
import { t } from '@/i18n';
import type { LocationSource } from './types';

/**
 * Real GPS. On iOS and Android the fixes come from a background task (expo-task-manager) so
 * they keep flowing with the phone in a pocket and the screen locked; on the web target the
 * foreground watch is the only option. The LocationSource interface does not change.
 */
export const LOCATION_TASK = 'sivoov-run-location';

export type LocationPermission = 'undetermined' | 'denied' | 'foreground' | 'always' | 'web';

/** The background task runs outside React: it fans out to whichever source is active. */
let activeListener: ((sample: LocationSample) => void) | null = null;

export const toSample = (loc: Location.LocationObject): LocationSample => ({
  lat: loc.coords.latitude,
  lng: loc.coords.longitude,
  accuracy: loc.coords.accuracy ?? undefined,
  altitude: loc.coords.altitude ?? undefined,
  speed: loc.coords.speed !== null && loc.coords.speed >= 0 ? loc.coords.speed : undefined,
  // iOS reports fractional milliseconds; the trace schema wants whole ones.
  timestamp: Math.round(loc.timestamp),
});

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
    if (!activeListener) {
      diagCount('task.dropped', locations.length);
      diag('location', `dropped ${locations.length} fixes: no run is listening`);
      return;
    }
    diagCount('task.fixes', locations.length);
    locations.map(toSample).forEach((sample) => activeListener?.(sample));
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
    killServiceOnDestroy: true,
  },
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

/** Foreground first, then "always": the second prompt only shows once the first is granted. */
export const requestLocationPermission = async (): Promise<LocationPermission> => {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  if (Platform.OS === 'web') return 'web';
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
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
      if (permission !== 'always') {
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
    },
    async stop() {
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
