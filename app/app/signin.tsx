import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api';
import { Body, Button, Display, ErrorBox, Eyebrow, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { useSession } from '@/stores/session';
import { colors, fonts, radius, space } from '@/theme';

export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requestCode = useSession((s) => s.requestCode);
  const verifyCode = useSession((s) => s.verifyCode);
  const [step, setStep] = useState<'identify' | 'code'>('identify');
  const [bib, setBib] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { devCode } = await requestCode(bib.trim(), email.trim());
      if (devCode) setCode(devCode);
      setStep('code');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? t('signin.unknown') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(bib.trim(), email.trim(), code.trim());
      router.replace('/home');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? t('signin.badCode') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
          <Eyebrow>Sivoov Run</Eyebrow>
          {step === 'identify' ? (
            <>
              <Display>{t('signin.title')}</Display>
              <Body muted>{t('signin.lede')}</Body>
              {error ? <ErrorBox>{error}</ErrorBox> : null}
              <View style={styles.field}>
                <Body style={styles.label}>{t('signin.bib')}</Body>
                <TextInput testID="bib" style={styles.input} value={bib} onChangeText={setBib} keyboardType="number-pad" autoCapitalize="none" autoCorrect={false} />
              </View>
              <View style={styles.field}>
                <Body style={styles.label}>{t('signin.email')}</Body>
                <TextInput testID="email" style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
              </View>
              <Button testID="send" label={t('signin.send')} onPress={() => void send()} loading={busy} disabled={!bib.trim() || !email.includes('@')} />
            </>
          ) : (
            <>
              <Display>{t('signin.code.title')}</Display>
              <Body muted>{t('signin.code.lede', { email: email.trim() })}</Body>
              {error ? <ErrorBox>{error}</ErrorBox> : null}
              <View style={styles.field}>
                <Body style={styles.label}>{t('signin.code')}</Body>
                <TextInput testID="code" style={[styles.input, styles.code]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" autoFocus />
              </View>
              <Button testID="verify" label={t('signin.verify')} onPress={() => void verify()} loading={busy} disabled={code.trim().length !== 6} />
              <Button label={t('common.back')} ghost onPress={() => setStep('identify')} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontFamily: fonts.bodyBold, fontSize: 14 },
  input: { fontFamily: fonts.body, fontSize: 18, paddingHorizontal: space.md, paddingVertical: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.card, color: colors.ink },
  code: { fontFamily: fonts.numBold, fontSize: 36, letterSpacing: 8, textAlign: 'center' },
});
