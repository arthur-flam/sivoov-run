import { StyleSheet, View } from 'react-native';
import type { SaidLine, SpeechTiming } from '@/audio/said';
import { Body, Display, Eyebrow } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme';
import { Caption } from './Caption';

const countdownLine = (line: SaidLine | null) => line?.event.trigger.kind === 'cue' && line.event.trigger.at === 'countdown';

/**
 * The panel's height on the line, whatever is said: the map above never changes size (it would
 * shift the view at every line), and about the running panel's, so the gun does not move it either.
 */
export const START_PANEL_H = 350;

type Props = { cue: 'armed' | 'digits'; who: string; line: SaidLine | null; speaking: boolean; timing: SpeechTiming | null };

/**
 * On the line, before the gun: the runner listens, and the screen follows the ceremony's own
 * sound (its opening lines, then its countdown file, whose seconds the digits are). What the
 * speaker says is written out large, so a runner who missed a word can read it, and scrolls as
 * it is said; the countdown line is not, its digits are over the map.
 */
export const StartPanel = ({ cue, who, line, speaking, timing }: Props) => (
  <View style={styles.panel}>
    {cue === 'armed' ? (
      <>
        <Display dark>{t('run.armed.title')}</Display>
        <Body dark muted testID="on-the-line">
          {t('run.armed.body')}
        </Body>
      </>
    ) : (
      <>
        <Eyebrow dark>{t('run.countdown')}</Eyebrow>
        <Body dark muted>
          {who}
        </Body>
      </>
    )}
    <Caption line={countdownLine(line) ? null : line} speaking={speaking} timing={timing} large testID="ceremony-caption" />
  </View>
);

const styles = StyleSheet.create({ panel: { gap: space.sm, height: START_PANEL_H } });
