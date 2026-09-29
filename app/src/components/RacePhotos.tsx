import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Race } from '@sivoov/shared';
import { AuthedImage } from '@/components/AuthedImage';
import { Body, Button, Card } from '@/components/ui';
import { t } from '@/i18n';
import { pickPhotos, picker } from '@/photos/picker';
import { openPhotos } from '@/share';
import { usePhotos } from '@/stores/photos';
import type { PhotoRun } from '@/stores/photos';
import { colors, fonts, radius, space } from '@/theme';

type Props = {
  race: Race;
  token: string | null;
  /** The run the photos were taken on, to match each to its moment by time. */
  run: PhotoRun | null;
  officialM: number;
  /** Once the run is over, the photos sent get their pictures without a tap. */
  finished: boolean;
  dark?: boolean;
};

/**
 * « Vos photos de course »: the runner picks the selfies they took during the race (several at
 * once, each matched to its moment by the time it was taken), the pictures are made after the
 * run, and shown here. Nothing is asked during the race but to take the photos. A shell without
 * the picker opens the web page, which does the same.
 */
export const RacePhotos = ({ race, token, run, officialM, finished, dark = false }: Props) => {
  const { enabled, moments, photos, busy, error, load, send, make } = usePhotos();
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);
  const waiting = photos.some((p) => p.status === 'waiting');
  // Once per screen: offline it would fail and ask again at once, forever. « Choisir mes photos » asks again.
  const asked = useRef(false);
  useEffect(() => {
    if (!token || !finished || !enabled || !waiting || busy !== null || asked.current) return;
    asked.current = true;
    void make(token);
  }, [token, finished, enabled, waiting, busy, make]);
  if (!token || moments.length === 0) return null;

  const choose = async () => {
    const picked = await pickPhotos(moments.length);
    if (!picked || picked.length === 0) return;
    const { sent, unmatched } = await send(token, picked, run, officialM);
    setNote(unmatched > 0 ? t(unmatched === 1 ? 'racePhotos.unmatched.one' : 'racePhotos.unmatched', { count: unmatched }) : sent > 0 ? t(sent === 1 ? 'racePhotos.sent.one' : 'racePhotos.sent', { count: sent }) : null);
    if (finished) void make(token);
  };
  const byMoment = new Map(photos.map((p) => [p.momentId, p]));
  const status = busy === 'sending' ? t('racePhotos.sending') : busy === 'making' ? t('racePhotos.making') : error ? t('racePhotos.error') : note;

  return (
    <Card dark={dark} style={{ gap: space.sm }}>
      <Body dark={dark} style={styles.title}>
        {t('finish.photos.title')}
      </Body>
      <Body dark={dark} muted>
        {picker ? t('racePhotos.body') : t('finish.photos.body')}
      </Body>
      <View style={styles.grid}>
        {moments.map((m) => {
          const photo = byMoment.get(m.id);
          return (
            <View key={m.id} style={styles.tile} testID={`race-photo-${m.id}`}>
              {photo?.picture ? (
                <AuthedImage path={photo.picture} token={token} style={styles.picture} label={m.title} />
              ) : (
                <View style={[styles.picture, styles.empty, dark && styles.emptyDark]}>
                  <Body dark={dark} muted style={styles.state}>
                    {photo ? t(`racePhotos.state.${photo.status}`) : t('racePhotos.state.none')}
                  </Body>
                </View>
              )}
              <Body dark={dark} style={styles.caption}>
                {m.title}
              </Body>
            </View>
          );
        })}
      </View>
      {status ? (
        <Body dark={dark} muted testID="race-photos-status">
          {status}
        </Body>
      ) : null}
      {picker && enabled ? (
        <Button testID="pick-photos" label={t('racePhotos.pick')} color={race.theme.primary} onColor={race.theme.onPrimary} loading={busy === 'sending'} onPress={() => void choose()} />
      ) : null}
      <Button testID="open-photos" label={photos.some((p) => p.picture) ? t('racePhotos.open') : t('photos.cta')} ghost dark={dark} onPress={() => void openPhotos(race, token)} />
      {picker && enabled ? (
        <Body dark={dark} muted style={styles.small}>
          {t('racePhotos.consent')}
        </Body>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  title: { fontFamily: fonts.bodyBold, fontSize: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31%', minWidth: 96, gap: 4 },
  picture: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.sm },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 6 },
  emptyDark: { borderColor: colors.nightBorder },
  state: { fontSize: 13, textAlign: 'center' },
  caption: { fontSize: 13, lineHeight: 17 },
  small: { fontSize: 13, lineHeight: 18 },
});
