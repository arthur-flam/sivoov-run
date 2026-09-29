import { Circle, G, Rect, Text as SvgText } from 'react-native-svg';
import type { PlaceMark } from '@sivoov/shared';
import { colors, fonts } from '@/theme';

type At = { x: number; y: number };

/** A ring around the start or the finish while its row is chosen. */
const Halo = ({ x, y, accent }: At & { accent: string }) => <Circle cx={x} cy={y} r={13} fill={accent} fillOpacity={0.25} stroke={accent} strokeWidth={2} />;

export const StartMark = ({ x, y, accent }: At & { accent: string }) => <Circle cx={x} cy={y} r={6} fill={accent} stroke={colors.snow} strokeWidth={2.5} />;

export const FinishMark = ({ x, y }: At) => (
  <Rect x={x - 5.5} y={y - 5.5} width={11} height={11} fill={colors.ink} stroke={colors.snow} strokeWidth={2} transform={`rotate(45 ${x} ${y})`} />
);

/** A place: its letter in a white disc ringed with the race colour, filled with it when chosen. */
export const LetterMark = ({ x, y, letter, accent, onAccent, chosen }: At & { letter: string; accent: string; onAccent: string; chosen: boolean }) => (
  <G>
    <Circle cx={x} cy={y} r={chosen ? 12 : 9} fill={chosen ? accent : colors.card} stroke={chosen ? colors.snow : accent} strokeWidth={chosen ? 3 : 2} />
    <SvgText x={x} y={y + (chosen ? 4.6 : 3.8)} fontSize={chosen ? 13 : 11} fontFamily={fonts.numBold} fontWeight="700" fill={chosen ? onAccent : colors.ink} textAnchor="middle">
      {letter}
    </SvgText>
  </G>
);

/** A kilometre post: a small dark tab with the number, quieter than the places. */
export const KmMark = ({ x, y, km }: At & { km: number }) => {
  const w = km >= 10 ? 15 : 11;
  return (
    <G>
      <Rect x={x - w / 2} y={y - 6.5} width={w} height={13} rx={3} fill={colors.ink} fillOpacity={0.82} stroke={colors.snow} strokeWidth={1} />
      <SvgText x={x} y={y + 3.2} fontSize={9.5} fontFamily={fonts.numBold} fontWeight="700" fill={colors.snow} textAnchor="middle">
        {String(km)}
      </SvgText>
    </G>
  );
};

/** Any place mark, at a spot. Taps are caught by views laid over the map, not by the drawing. */
export const PlaceMarkAt = ({ mark, at, accent, onAccent, chosen }: { mark: PlaceMark; at: At; accent: string; onAccent: string; chosen: boolean }) => (
  <G>
    {chosen && (mark === 'start' || mark === 'finish') ? <Halo {...at} accent={accent} /> : null}
    {mark === 'start' ? <StartMark {...at} accent={accent} /> : mark === 'finish' ? <FinishMark {...at} /> : <LetterMark {...at} letter={mark} accent={accent} onAccent={onAccent} chosen={chosen} />}
  </G>
);
