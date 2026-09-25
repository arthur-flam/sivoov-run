/** Sivoov layer tokens (docs/DESIGN.md). The race layer arrives through `race.theme`. */
export const colors = {
  paper: '#faf9f7',
  card: '#ffffff',
  ink: '#1a1a1a',
  ink2: '#52525b',
  muted: '#a1a1aa',
  border: '#e8e6e3',
  coral: '#e8786f',
  coralBg: '#fef2f1',
  coralName: '#b8443b',
  // Run screen: dark ground, white numerals, one accent line.
  night: '#0c0c0c',
  nightCard: '#181818',
  nightBorder: '#2a2a2a',
  /** The course not yet run, on the night ground: visible, but quieter than the accent. */
  nightLine: '#3f3f46',
  snow: '#ffffff',
  fog: '#a1a1aa',
} as const;

export const fonts = {
  display: 'Fraunces_500Medium',
  displayItalic: 'Fraunces_500Medium_Italic',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_600SemiBold',
  num: 'BarlowCondensed_600SemiBold',
  numBold: 'BarlowCondensed_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
