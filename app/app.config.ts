import type { ExpoConfig } from 'expo/config';

/**
 * Same Expo and EAS project as the previous app; store ids of the company's own
 * (`app.sivoov.run`, ARCHITECTURE.md "Identity and stores"). APP_VARIANT picks the dev /
 * preview / production shell.
 */
const variant = process.env.APP_VARIANT ?? 'production';
const suffix = variant === 'development' ? '.dev' : variant === 'preview' ? '.preview' : '';
const name = variant === 'development' ? 'Sivoov (Dev)' : variant === 'preview' ? 'Sivoov (Preview)' : 'Sivoov';
// A dev or preview shell must never talk to production, even if Metro was started without
// EXPO_PUBLIC_API_URL (docs/DEVICE.md). That holds only when APP_VARIANT is set: unset means
// production, so every `expo start` script and every `eas update` in CI names its variant.
// An OTA update carries this config, so an update published without it points the app at
// production whatever shell loads it.
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? (variant === 'production' ? 'https://run.sivoov.app' : 'https://preview.run.sivoov.app');
// EAS Build stamps the channel from eas.json into the binary; a shell compiled on the laptop
// (`npm run device:preview`) is not built by EAS and would ask for no channel at all, so it is
// named here too. Same mapping either way — this is what lets a cloud session ship JS to a
// phone with no cable (docs/WORKFLOW.md, loop 2b).
const channel = variant === 'development' ? 'development' : variant === 'preview' ? 'preview' : 'production';

// The location prompts, as iOS shows them: French here and in ./locales/fr.json, English in
// ./locales/en.json (iOS picks the phone's language; anything else falls back to French).
const LOCATION_WHEN_IN_USE = 'Sivoov mesure la distance et le temps de votre course, même écran verrouillé, et déclenche les annonces aux bons endroits du parcours.';
const LOCATION_ALWAYS = 'Sivoov mesure votre course même écran verrouillé, téléphone dans la poche.';
// The race photos (expo-image-picker): the start selfie, and the selfies picked after the run.
const CAMERA = 'Sivoov prend votre selfie de départ, pour vous mettre ensuite dans les photos de la course.';
const PHOTOS = 'Sivoov envoie les selfies que vous choisissez pour vous mettre dans les photos de la course.';

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
    bundleIdentifier: `app.sivoov.run${suffix}`,
    // Only HTTPS and the system's own crypto: no export compliance question on every upload.
    config: { usesNonExemptEncryption: false },
    // The required-reason APIs React Native and the Expo modules call, declared at the app level:
    // static pods do not always carry their own manifests into the build, and App Store Connect
    // refuses an upload that uses them undeclared (ITMS-91053). No tracking.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['0A2A.1', '3B52.1', 'C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'] },
      ],
    },
    infoPlist: {
      UIBackgroundModes: ['audio', 'location'],
      CFBundleDevelopmentRegion: 'fr',
      NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_ALWAYS,
      NSCameraUsageDescription: CAMERA,
      NSPhotoLibraryUsageDescription: PHOTOS,
    },
  },
  locales: { fr: './locales/fr.json', en: './locales/en.json' },
  android: {
    package: `app.sivoov.run${suffix}`,
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
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS,
        locationAlwaysPermission: LOCATION_ALWAYS,
      },
    ],
    'expo-audio',
    'expo-secure-store',
    // The run screen's 3D map (ARCHITECTURE.md, native module list). Mapbox v11: no download token.
    '@rnmapbox/maps',
    // The race photos: the system photo picker (no access to the whole library) and the front camera.
    ['expo-image-picker', { photosPermission: PHOTOS, cameraPermission: CAMERA, microphonePermission: false }],
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
