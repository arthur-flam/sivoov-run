import type { ExpoConfig } from 'expo/config';

/**
 * Same Expo project, bundle ids and EAS project as the previous app (ARCHITECTURE.md,
 * "Identity and stores"). APP_VARIANT picks the dev / preview / production shell.
 */
const variant = process.env.APP_VARIANT ?? 'production';
const suffix = variant === 'development' ? '.dev' : variant === 'preview' ? '.preview' : '';
const name = variant === 'development' ? 'Sivoov (Dev)' : variant === 'preview' ? 'Sivoov (Preview)' : 'Sivoov';

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
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION'],
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
  updates: { url: 'https://u.expo.dev/f63919b9-08f2-49be-81f0-832c74c4884d' },
  runtimeVersion: { policy: 'appVersion' },
  extra: { router: {}, eas: { projectId: 'f63919b9-08f2-49be-81f0-832c74c4884d' }, apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://run.sivoov.app' },
};

export default config;
