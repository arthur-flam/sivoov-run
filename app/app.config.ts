import type { ExpoConfig } from 'expo/config';

/**
 * Same Expo project, bundle ids and EAS project as the previous app (ARCHITECTURE.md,
 * "Identity and stores"). APP_VARIANT picks the dev / preview / production shell.
 */
const variant = process.env.APP_VARIANT ?? 'production';
const suffix = variant === 'development' ? '.dev' : variant === 'preview' ? '.preview' : '';
const name = variant === 'development' ? 'Sivoov (Dev)' : variant === 'preview' ? 'Sivoov (Preview)' : 'Sivoov';
// A dev or preview shell must never talk to production, even if Metro was started without
// EXPO_PUBLIC_API_URL (docs/DEVICE.md).
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? (variant === 'production' ? 'https://run.sivoov.app' : 'https://preview.run.sivoov.app');
// EAS Build stamps the channel from eas.json into the binary; a shell compiled on the laptop
// (`npm run device:preview`) is not built by EAS and would ask for no channel at all, so it is
// named here too. Same mapping either way — this is what lets a cloud session ship JS to a
// phone with no cable (docs/WORKFLOW.md, loop 2b).
const channel = variant === 'development' ? 'development' : variant === 'preview' ? 'preview' : 'production';

const config: ExpoConfig = {
  name,
  slug: 'sivoov',
  owner: 'arthur.flam',
  version: '2.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: `sivoov${suffix.replace('.', '-')}`,
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: `com.arthur.flam.sivoov${suffix}`,
    infoPlist: {
      UIBackgroundModes: ['audio', 'location'],
      NSLocationWhenInUseUsageDescription: 'Sivoov mesure la distance de votre course.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'Sivoov mesure votre course même écran verrouillé.',
    },
  },
  android: {
    package: `com.arthur.flam.sivoov${suffix}`,
    adaptiveIcon: {
      backgroundColor: '#faf9f7',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // RECEIVE_BOOT_COMPLETED: expo-task-manager schedules its location job with
    // setPersisted(true), which Android refuses without it — the app crashed on the first
    // background batch. Neither expo-task-manager nor expo-location declares it (docs/MEMORY.md).
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'RECEIVE_BOOT_COMPLETED'],
    predictiveBackGestureEnabled: false,
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    [
      'expo-location',
      {
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        locationWhenInUsePermission: 'Sivoov mesure la distance de votre course.',
        locationAlwaysAndWhenInUsePermission: 'Sivoov mesure votre course même écran verrouillé.',
        locationAlwaysPermission: 'Sivoov mesure votre course même écran verrouillé.',
      },
    ],
    'expo-audio',
    'expo-secure-store',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, resizeMode: 'contain', backgroundColor: '#faf9f7' }],
  ],
  updates: {
    url: 'https://u.expo.dev/f63919b9-08f2-49be-81f0-832c74c4884d',
    requestHeaders: { 'expo-channel-name': channel },
    // The runner opens the app at the start line: never block the screen on a network check.
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: { policy: 'appVersion' },
  extra: { router: {}, eas: { projectId: 'f63919b9-08f2-49be-81f0-832c74c4884d' }, apiUrl, channel },
};

export default config;
