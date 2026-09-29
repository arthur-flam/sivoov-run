import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** The run screen's few icons: plain strokes, sized by the control that holds them. */
type IconProps = { size?: number; color: string };

/** A speaker with its waves: the race voice. */
export const VoiceIcon = ({ size = 22, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <Path d="M15.5 9a4 4 0 0 1 0 6" />
    <Path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
);

/** A map folded in three: how the run is seen. */
export const ViewIcon = ({ size = 22, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z" />
    <Path d="M9 4v13.5M15 6.5V20" />
  </Svg>
);

/** A camera: the photo moment's selfie. */
export const CameraIcon = ({ size = 22, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 8.5a2 2 0 0 1 2-2h2.5L9 4.5h6l1.5 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <Circle cx={12} cy={13} r={3.5} />
  </Svg>
);

/** The stop square. */
export const StopIcon = ({ size = 22, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={6} y={6} width={12} height={12} rx={2.5} fill={color} />
  </Svg>
);

/** Play again: an arrow coming round. */
export const ReplayIcon = ({ size = 20, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 12a8 8 0 1 0 2.5-5.8" />
    <Path d="M4 4v4.5h4.5" />
  </Svg>
);

export const CloseIcon = ({ size = 20, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

/** A compass needle, pointing up: which way the map faces. */
export const NeedleIcon = ({ size = 22, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 3l4 9h-8z" fill={color} />
    <Path d="M12 21l-4-9h8z" fill={color} opacity={0.4} />
  </Svg>
);

/** The next place on the course: the diamond the course drawing uses for the finish. */
export const PlaceIcon = ({ size = 14, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 14 14">
    <Rect x={3} y={3} width={8} height={8} fill={color} transform="rotate(45 7 7)" />
  </Svg>
);

/** A dot, for a status. */
export const Dot = ({ size = 8, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 8 8">
    <Circle cx={4} cy={4} r={4} fill={color} />
  </Svg>
);
