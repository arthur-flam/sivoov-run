import { Pressable, StyleSheet, View } from 'react-native';
import { t } from '@/i18n';
import { colors } from '@/theme';
import { NeedleIcon } from './icons';

/**
 * Shown once the runner turned the map: its needle shows by how much, a tap turns it back to
 * the course's way (north over the whole course).
 */
export const TurnReset = ({ turn, onReset }: { turn: number; onReset: () => void }) => (
  <Pressable testID="map-turn-reset" onPress={onReset} accessibilityRole="button" accessibilityLabel={t('run.view.reset')} hitSlop={8} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
    <View style={{ transform: [{ rotate: `${-turn}deg` }] }}>
      <NeedleIcon color={colors.snow} />
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,12,12,0.78)' },
  pressed: { opacity: 0.7 },
});
