import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { API_URL } from '@/api';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Body, Button, Card, ErrorBox } from '@/components/ui';
import { currentLocale, t } from '@/i18n';
import { useSession } from '@/stores/session';
import { colors, space } from '@/theme';

/** The privacy page on the Worker, in the app's language. */
const privacyUrl = () => `${API_URL}/confidentialite${currentLocale() === 'en' ? '?lang=en' : ''}`;

/**
 * The bottom of the race home: the language, the privacy page, « Supprimer mes données » (the App Store
 * asks for it inside the app) behind a confirmation card, and signing out. A card rather than a
 * system alert: React Native's Alert does nothing on the web target, where the rig drives it.
 */
export const AccountActions = () => {
  const router = useRouter();
  const signOut = useSession((s) => s.signOut);
  const deleteData = useSession((s) => s.deleteData);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const erase = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await deleteData();
      router.replace({ pathname: '/signin', params: { deleted: '1' } });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.actions}>
      <LanguagePicker />
      {confirming ? (
        <Card>
          <Body style={styles.title}>{t('home.deleteData.title')}</Body>
          <Body muted>{t('home.deleteData.body')}</Body>
          {failed ? <ErrorBox>{t('common.error')}</ErrorBox> : null}
          <View style={styles.buttons}>
            <Button testID="delete-data-confirm" label={t('home.deleteData.confirm')} onPress={() => void erase()} loading={busy} />
            <Button label={t('common.cancel')} ghost onPress={() => setConfirming(false)} />
          </View>
        </Card>
      ) : null}
      <Button label={t('home.signout')} ghost onPress={() => void signOut().then(() => router.replace('/signin'))} />
      <View style={styles.links}>
        <Pressable testID="privacy" accessibilityRole="link" onPress={() => void Linking.openURL(privacyUrl())} hitSlop={8}>
          <Body style={styles.link}>{t('home.privacy')}</Body>
        </Pressable>
        {!confirming ? (
          <Pressable testID="delete-data" accessibilityRole="button" onPress={() => setConfirming(true)} hitSlop={8}>
            <Body style={styles.link}>{t('home.deleteData')}</Body>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  actions: { gap: space.sm },
  title: { fontSize: 20, lineHeight: 26 },
  buttons: { gap: space.sm, marginTop: space.sm },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.lg, paddingVertical: space.sm },
  link: { color: colors.ink2, fontSize: 14, textDecorationLine: 'underline' },
});
