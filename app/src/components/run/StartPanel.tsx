import { View } from 'react-native';
import type { SaidLine } from '@/audio/said';
import { Body, Display, Eyebrow } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme';
import { Caption } from './Caption';

const countdownLine = (line: SaidLine | null) => line?.event.trigger.kind === 'cue' && line.event.trigger.at === 'countdown';

type Props = { cue: 'armed' | 'digits'; who: string; line: SaidLine | null; speaking: boolean };

/**
 * On the line, before the gun: the runner listens, and the screen follows the ceremony's own
 * sound (its opening lines, then its countdown file, whose seconds the digits are). What the
 * speaker says is written out large, so a runner who missed a word can read it; the countdown
 * line is not, its digits are over the map.
 */
export const StartPanel = ({ cue, who, line, speaking }: Props) => (
  <View style={{ gap: space.sm, minHeight: 180 }}>
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
    <Caption line={countdownLine(line) ? null : line} speaking={speaking} large testID="ceremony-caption" />
  </View>
);
