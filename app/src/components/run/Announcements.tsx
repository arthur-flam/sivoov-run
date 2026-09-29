import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { VOICE_LEVELS, formatClock } from '@sivoov/shared';
import type { VoiceLevel } from '@sivoov/shared';
import { replay } from '@/audio/usePlayback';
import type { SaidLine } from '@/audio/said';
import { currentLocale, t } from '@/i18n';
import { colors, fonts, radius, space } from '@/theme';
import { ReplayIcon } from './icons';
import { Sheet } from './Sheet';
import { SpeakingBars } from './SpeakingBars';

const km = (m: number) => (m / 1000).toFixed(1).replace('.', currentLocale() === 'fr' ? ',' : '.');

/** « Moins de voix »: three levels, each saying what it keeps. */
const VoiceLevels = ({ level, onLevel }: { level: VoiceLevel; onLevel: (level: VoiceLevel) => void }) => (
  <View style={styles.levels} accessibilityRole="radiogroup" accessibilityLabel={t('run.voice.title')}>
    {VOICE_LEVELS.map((l) => {
      const on = l === level;
      return (
        <Pressable key={l} testID={`voice-${l}`} onPress={() => onLevel(l)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.level, on && styles.levelOn]}>
          <Text style={[styles.levelName, on && styles.levelNameOn]}>{t(`run.voice.${l}`)}</Text>
          <Text style={[styles.levelHelp, on && styles.levelHelpOn]} numberOfLines={4}>
            {t(`run.voice.${l}.help`)}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const Line = ({ line, speaking }: { line: SaidLine; speaking: boolean }) => (
  <View style={[styles.line, line.sound === 'silenced' && styles.lineMuted]}>
    <View style={styles.lineHead}>
      <Text style={styles.lineAt}>{t('run.said.at', { km: km(line.distanceM), time: formatClock(line.elapsedMs) })}</Text>
      {speaking ? <SpeakingBars active color={colors.snow} /> : null}
      {line.sound === 'silenced' ? <Text style={styles.tag}>{t('run.said.silenced')}</Text> : null}
    </View>
    {line.event.title ? <Text style={styles.lineTitle}>{line.event.title}</Text> : null}
    {line.text ? <Text style={styles.lineText}>{line.text}</Text> : null}
    {line.uri && line.sound !== 'silent' ? (
      <Pressable onPress={() => replay(line)} accessibilityRole="button" accessibilityLabel={`${t('run.said.replay')} · ${line.event.title ?? ''}`} style={styles.replay} hitSlop={8}>
        <ReplayIcon color={colors.snow} size={16} />
        <Text style={styles.replayText}>{t('run.said.replay')}</Text>
      </Pressable>
    ) : null}
  </View>
);

type Props = { lines: SaidLine[]; speaking: string | null; level: VoiceLevel; onLevel: (level: VoiceLevel) => void; onClose: () => void };

/** The race voice: how much of it to hear, and everything it has said so far, newest first. */
export const Announcements = ({ lines, speaking, level, onLevel, onClose }: Props) => {
  const newest = [...lines].reverse();
  const speakingKey = speaking ? newest.find((l) => l.event.id === speaking)?.key : undefined;
  return (
  <Sheet title={t('run.said.title')} onClose={onClose} closeLabel={t('run.said.close')} testID="announcements">
    <VoiceLevels level={level} onLevel={onLevel} />
    <ScrollView style={styles.list} contentContainerStyle={{ gap: space.sm }}>
      {lines.length === 0 ? <Text style={styles.empty}>{t('run.said.empty')}</Text> : null}
      {newest.map((l) => (
        <Line key={l.key} line={l} speaking={l.key === speakingKey} />
      ))}
    </ScrollView>
  </Sheet>
  );
};

const styles = StyleSheet.create({
  levels: { flexDirection: 'row', gap: space.sm },
  level: { flex: 1, minHeight: 84, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.nightBorder, padding: 10, gap: 4 },
  levelOn: { backgroundColor: colors.snow, borderColor: colors.snow },
  levelName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.snow },
  levelNameOn: { color: colors.ink },
  levelHelp: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.fog },
  levelHelpOn: { color: colors.ink2 },
  list: { flexGrow: 0 },
  empty: { fontFamily: fonts.body, fontSize: 15, color: colors.fog, paddingVertical: space.md },
  line: { borderTopWidth: 1, borderColor: colors.nightBorder, paddingTop: space.sm, gap: 4 },
  lineMuted: { opacity: 0.55 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  lineAt: { fontFamily: fonts.num, fontSize: 15, color: colors.fog, fontVariant: ['tabular-nums'] },
  tag: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.fog, borderWidth: 1, borderColor: colors.nightBorder, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  lineTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.snow },
  lineText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.snow },
  replay: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36 },
  replayText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.snow },
});
