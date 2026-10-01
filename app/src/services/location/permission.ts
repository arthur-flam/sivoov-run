/** What the phone lets the run read, as the pre-flight and the location source see it. */
export type LocationPermission = 'undetermined' | 'denied' | 'foreground' | 'always' | 'web';

export type DevicePlatform = 'ios' | 'android' | 'web';

/**
 * Whether the fixes keep coming once the screen locks. Android needs « Toujours ». iOS does
 * not: a run started on screen with « Lorsque l'app est active » keeps its updates in the
 * background (the blue location pill), because the app has the `location` background mode and
 * the task sets `allowsBackgroundLocationUpdates`. iOS never offers « Toujours » in its first
 * prompt, so asking for it would stop almost every runner at the pre-flight.
 */
export const keepsTrackingLocked = (permission: LocationPermission | null, platform: DevicePlatform): boolean =>
  permission === 'always' || (platform === 'ios' && permission === 'foreground');

/**
 * Step two is due: the runner allowed « while using », and this phone (Android) stops the fixes
 * once the screen locks unless they also allow « Toujours ». The pre-flight says why, then asks.
 */
export const needsAlways = (permission: LocationPermission | null, platform: DevicePlatform): boolean =>
  permission === 'foreground' && !keepsTrackingLocked(permission, platform);
