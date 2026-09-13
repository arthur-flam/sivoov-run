import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Fraunces_500Medium, Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSession } from '@/stores/session';
// Defines the background location task at startup, before any screen can start updates.
import '@/services/location/device';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium,
    Fraunces_500Medium_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });
  const status = useSession((s) => s.status);
  const restore = useSession((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (fontsLoaded && status !== 'loading') void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, status]);

  if (!fontsLoaded || status === 'loading') return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="run" options={{ contentStyle: { backgroundColor: colors.night }, gestureEnabled: false }} />
        <Stack.Screen name="debug" options={{ contentStyle: { backgroundColor: colors.night } }} />
      </Stack>
    </SafeAreaProvider>
  );
}
