import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { CodeRequest, SignInAmbiguity } from '@sivoov/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, ambiguityOf } from '@/api';
import { Body, Button, Card, Display, ErrorBox, Eyebrow, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { useSession } from '@/stores/session';
import { colors, fonts, radius, space } from '@/theme';

/**
 * The email of the entry, then the code. The race and the bib are asked only when the server
 * says the email holds more than one entry (`SignInAmbiguity`): another race, or a family
 * sharing one address in the same race.
 */
export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Back from « Supprimer mes données »: say it is done.
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();
  const requestCode = useSession((s) => s.requestCode);
  const verifyCode = useSession((s) => s.verifyCode);
  const [step, setStep] = useState<'identify' | 'code'>('identify');
  const [email, setEmail] = useState('');
  const [slug, setSlug] = useState<string | null>(null);
  const [bib, setBib] = useState('');
  const [asked, setAsked] = useState<SignInAmbiguity | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const who = (): CodeRequest => ({ email: email.trim(), ...(slug ? { raceSlug: slug } : {}), ...(bib.trim() ? { bib: bib.trim() } : {}) });

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { devCode } = await requestCode(who());
      if (devCode) setCode(devCode);
      setStep('code');
    } catch (e) {
      const ambiguity = ambiguityOf(e);
      if (ambiguity) {
        // A second race list replaces the first; asking for the bib keeps the race chosen.
        setAsked(ambiguity);
        if (ambiguity.races.length > 0) setSlug(null);
      } else setError(e instanceof ApiError && e.status === 404 ? t('signin.unknown') : e instanceof ApiError && e.status === 429 ? t('signin.tooMany') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(who(), code.trim());
      router.replace('/home');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? t('signin.badCode') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    setAsked(null);
    setSlug(null);
    setBib('');
  };

  const races = asked?.races ?? [];
  const ready = email.includes('@') && (races.length === 0 || slug !== null) && (!asked?.bib || bib.trim() !== '');

  return (
    <Screen style={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
          <Eyebrow>Sivoov Run</Eyebrow>
          {step === 'identify' ? (
            <>
              <Display>{t('signin.title')}</Display>
              <Body muted>{t('signin.lede')}</Body>
              {deleted ? (
                <Card>
                  <Body testID="data-deleted">{t('home.deleteData.done')}</Body>
                </Card>
              ) : null}
              {error ? <ErrorBox>{error}</ErrorBox> : null}
              <View style={styles.field}>
                <Body style={styles.label}>{t('signin.email')}</Body>
                <TextInput testID="email" style={styles.input} value={email} onChangeText={changeEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
              </View>
              {races.length > 0 ? (
                <View style={styles.field}>
                  <Body style={styles.label}>{t('signin.chooseRace')}</Body>
                  {races.map((race) => (
                    <Pressable
                      key={race.slug}
                      testID={`race-${race.slug}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: race.slug === slug }}
                      onPress={() => setSlug(race.slug)}
                      style={[styles.input, styles.race, race.slug === slug ? styles.raceOn : null]}
                    >
                      <Body style={race.slug === slug ? styles.raceNameOn : undefined}>{race.name}</Body>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {asked?.bib ? (
                <View style={styles.field}>
                  <Body style={styles.label}>{t('signin.needBib')}</Body>
                  <TextInput testID="bib" style={styles.input} value={bib} onChangeText={setBib} keyboardType="number-pad" autoCapitalize="none" autoCorrect={false} autoFocus />
                </View>
              ) : null}
              <Button testID="send" label={t('signin.send')} onPress={() => void send()} loading={busy} disabled={!ready} />
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
  race: { justifyContent: 'center' },
  raceOn: { borderColor: colors.ink, borderWidth: 2 },
  raceNameOn: { fontFamily: fonts.bodyBold },
});
