import { useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Body, Button, Card, Display, Eyebrow, Screen } from '@/components/ui';
import { useDiag } from '@/diag';
import { t } from '@/i18n';
import { useSession } from '@/stores/session';
import { useUploads } from '@/stores/uploads';
import { colors, space } from '@/theme';

/**
 * The logbook, on the phone. Outdoors there is no cable and no `adb logcat`: this screen is
 * how a run explains itself before the trace reaches R2, and Share hands the whole thing to
 * a Claude session by message (docs/WORKFLOW.md, loop 2b).
 */
export default function Debug() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [shared, setShared] = useState(false);
  const [update, setUpdate] = useState<string | null>(null);
  const counters = useDiag((s) => s.counters);
  const lines = useDiag((s) => s.lines);
  const dropped = useDiag((s) => s.dropped);
  const pending = useUploads((s) => s.pending);
  const me = useSession((s) => s.me);

  const header = [
    `app ${Constants.expoConfig?.version ?? '?'} (${Constants.expoConfig?.extra?.apiUrl ?? '?'})`,
    `${Platform.OS} ${String(Platform.Version ?? '')}`,
    me ? `bib ${me.entrant.bib}` : 'not signed in',
    `channel ${Constants.expoConfig?.extra?.channel ?? '?'} · update ${Updates.updateId ?? 'embedded'}`,
    `${pending.length} upload(s) pending`,
  ].join('\n');

  const asText = [header, '', ...Object.entries(counters).map(([k, v]) => `${k} = ${v}`), '', ...lines.map((l) => `${(l.atMs / 1000).toFixed(1)}s [${l.tag}] ${l.message}`), dropped > 0 ? `(${dropped} older lines dropped)` : ''].join('\n');

  return (
    <Screen dark style={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }}>
      <Eyebrow dark>diagnostics</Eyebrow>
      <Display dark>{t('debug.title')}</Display>
      <ScrollView contentContainerStyle={{ gap: space.md, paddingVertical: space.md }}>
        <Card dark>
          <Body dark muted style={styles.mono}>{header}</Body>
        </Card>
        <Card dark style={{ gap: 2 }}>
          {Object.entries(counters).length === 0 ? (
            <Body dark muted style={styles.mono}>no counters yet</Body>
          ) : (
            Object.entries(counters).map(([name, value]) => (
              <View key={name} style={styles.row}>
                <Body dark style={styles.mono}>{name}</Body>
                <Body dark style={styles.mono} testID={`counter-${name}`}>{String(value)}</Body>
              </View>
            ))
          )}
        </Card>
        <Card dark style={{ gap: 2 }}>
          {dropped > 0 ? <Body dark muted style={styles.mono}>({dropped} older lines dropped)</Body> : null}
          {lines.length === 0 ? <Body dark muted style={styles.mono}>nothing logged yet</Body> : null}
          {lines.map((l, i) => (
            <Body key={`${l.atMs}-${i}`} dark muted style={styles.mono}>
              {(l.atMs / 1000).toFixed(1)}s [{l.tag}] {l.message}
            </Body>
          ))}
        </Card>
      </ScrollView>
      <View style={{ gap: space.sm }}>
        {update ? <Body dark muted style={styles.mono}>{update}</Body> : null}
        {/* Two app launches otherwise: expo-updates downloads in the background and swaps on
            the next start. Outdoors, one tap is the difference between fixing it and going home. */}
        <Button
          label={t('debug.update')}
          ghost
          dark
          testID="check-update"
          onPress={() => {
            setUpdate(t('debug.updateChecking'));
            void (async () => {
              try {
                if (__DEV__ || !Updates.isEnabled) return setUpdate(t('debug.updateUnavailable'));
                const check = await Updates.checkForUpdateAsync();
                if (!check.isAvailable) return setUpdate(t('debug.updateNone'));
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              } catch (e) {
                setUpdate(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        />
        <Button
          label={shared ? t('debug.shared') : t('debug.share')}
          ghost
          dark
          onPress={() => {
            setShared(true);
            // react-native-web has no Share: on the web target this is a no-op, not a crash.
            try {
              void Share.share({ message: asText }).catch(() => undefined);
            } catch {
              /* ignore */
            }
          }}
        />
        <Button label={t('debug.back')} ghost dark onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: colors.fog },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
});
