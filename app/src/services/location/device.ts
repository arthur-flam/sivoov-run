import * as Location from 'expo-location';
import type { LocationSample } from '@sivoov/shared';
import type { LocationSource } from './types';

/**
 * Real GPS, foreground for now. Background tracking with expo-task-manager arrives with the
 * device slice (M2); the interface does not change.
 */
export const deviceSource = (): LocationSource => {
  let subscription: Location.LocationSubscription | null = null;
  return {
    kind: 'device',
    now: () => Date.now(),
    async start(onSample) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('location_denied');
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const sample: LocationSample = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? undefined,
            altitude: loc.coords.altitude ?? undefined,
            speed: loc.coords.speed !== null && loc.coords.speed >= 0 ? loc.coords.speed : undefined,
            timestamp: loc.timestamp,
          };
          onSample(sample);
        },
      );
    },
    async stop() {
      subscription?.remove();
      subscription = null;
    },
  };
};
