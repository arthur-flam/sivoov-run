import { StyleSheet, View } from 'react-native';
import type { Ahead, RunState } from '@sivoov/shared';
import { t } from '@/i18n';
import type { MapView } from '@/stores/prefs';
import { colors, space } from '@/theme';
import { Control } from './Control';
import { HoldToStop } from './HoldToStop';
import { CameraIcon, ViewIcon, VoiceIcon } from './icons';
import { NextUp } from './NextUp';
import { Numbers } from './Numbers';

type Props = {
  state: RunState;
  ofLabel: string;
  ahead: Ahead;
  accent: string;
  voice: string;
  /** Null when the course can only be drawn: there is no view to choose. */
  view: MapView | null;
  onAnnouncements: () => void;
  onView: () => void;
  onStop: () => void;
  /** At a photo moment: its title, whether its photo is already taken, and the camera. */
  photo?: { title: string; taken: boolean; onPress: () => void } | null;
};

/**
 * During the run: what is next, the numbers, then the controls under the thumb, stop last and
 * apart. At a photo moment the camera takes the view's place for half a kilometre: the panel
 * keeps its height, so the map above does not move.
 */
export const LivePanel = ({ state, ofLabel, ahead, accent, voice, view, onAnnouncements, onView, onStop, photo }: Props) => (
  <View style={styles.wrap}>
    <NextUp ahead={ahead} accent={accent} />
    <Numbers state={state} ofLabel={ofLabel} />
    <View style={styles.controls}>
      <Control testID="open-announcements" icon={<VoiceIcon color={colors.snow} />} label={t('run.said.title')} value={voice} onPress={onAnnouncements} />
      {photo ? (
        <Control testID="take-photo" icon={<CameraIcon color={colors.snow} />} label={photo.taken ? t('run.photo.again') : t('run.photo')} value={photo.title} onPress={photo.onPress} />
      ) : view ? (
        <Control testID="switch-view" icon={<ViewIcon color={colors.snow} />} label={t('run.view')} value={t(`run.view.${view}`)} onPress={onView} />
      ) : null}
      <HoldToStop onHeld={onStop} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  controls: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
});
