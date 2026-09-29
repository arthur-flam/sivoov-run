import type { ComponentType } from 'react';
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import type * as SentrySdk from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';
import { useDiag } from '@/diag';
import { useSession } from '@/stores/session';

/**
 * Crash and error reports (ARCHITECTURE.md, Stack: Sentry). Off unless the bundle was built with
 * `EXPO_PUBLIC_SENTRY_DSN` (docs/WORKFLOW.md, Secrets): local, the web target, the screenshots
 * and the tests never load the package at all.
 *
 * JavaScript reaches phones over the air, so this file also runs in shells built before Sentry's
 * native half existed. There the SDK reports from JavaScript alone (fetch transport, no native
 * crash handler): `enableNative` is set from the native module's presence, as `mapboxSdk.ts` does
 * for the map, and the SDK itself falls back the same way when it finds no `RNSentry`.
 *
 * Kept light for a multi-hour run (ARCHITECTURE.md, Battery): no tracing (no sample rate, so no
 * tracing integrations at all), no session replay, no personal data. The runner is known by
 * their entrant id only.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/** The logbook lines sent with an error, newest last: what the phone saw just before. */
const LOGBOOK_LINES = 60;

const native = (): boolean => NativeModules.RNSentry != null || TurboModuleRegistry.get('RNSentry') != null;

const load = (): typeof SentrySdk | null => {
  if (DSN === '' || Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@sentry/react-native') as typeof SentrySdk;
  } catch {
    return null;
  }
};

/** development in Metro, else the shell's update channel (preview, production). */
const environment = (): string => (__DEV__ ? 'development' : Updates.channel || (Constants.expoConfig?.extra?.channel as string | undefined) || 'production');

/** The logbook (`diag.ts`) as breadcrumbs: read only when an error is sent, never during the run. */
const logbook = (): Breadcrumb[] => {
  const { lines, startedAtMs } = useDiag.getState();
  return lines.slice(-LOGBOOK_LINES).map((l) => ({ category: `logbook.${l.tag}`, message: l.message, timestamp: (startedAtMs + l.atMs) / 1000, level: 'info' }));
};

const withLogbook = (event: ErrorEvent): ErrorEvent => ({
  ...event,
  breadcrumbs: [...(event.breadcrumbs ?? []), ...logbook()].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
});

const start = (sdk: typeof SentrySdk): typeof SentrySdk | null => {
  try {
    sdk.init({
      dsn: DSN,
      environment: environment(),
      release: `sivoov@${Constants.expoConfig?.version ?? '0'}`,
      enableNative: native(),
      enableNativeNagger: false,
      sendDefaultPii: false,
      beforeSend: withLogbook,
    });
    sdk.setTag('update', Updates.updateId ?? 'embedded');
    // The entrant id, nothing else about the runner: set on sign-in, cleared on sign-out.
    const identify = (id: string | null) => sdk.setUser(id ? { id } : null);
    identify(useSession.getState().me?.entrant.id ?? null);
    useSession.subscribe((s, prev) => {
      const id = s.me?.entrant.id ?? null;
      if (id !== (prev.me?.entrant.id ?? null)) identify(id);
    });
    return sdk;
  } catch {
    return null;
  }
};

const loaded = load();
export const sentry = loaded ? start(loaded) : null;

/** The root layout, wrapped for touch breadcrumbs when reports are on; as is otherwise. */
export const wrapRoot = <P extends Record<string, unknown>>(root: ComponentType<P>): ComponentType<P> => (sentry ? sentry.wrap(root) : root);
