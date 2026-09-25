/**
 * Design tokens: the only place colors, type and shapes are decided. Every stylesheet (public
 * pages, the organizer admin, the studio) reads these variables and hard-codes nothing, so a
 * new visual identity is an edit to this file. The race layer (`--race-primary`,
 * `--race-on-primary`) is set per page from `race.theme` on <body>. See docs/DESIGN.md.
 */
export const tokens = `
:root {
  /* Surfaces and ink */
  --bg: #faf9f7; --surface: #ffffff; --surface-2: #f3f1ee; --ink: #1a1a1a; --ink-2: #52525b; --muted: #8b8b93;
  --border: #e8e6e3; --border-strong: #d6d3cf;
  /* Brand */
  --accent: #e8786f; --accent-ink: #b8443b; --accent-bg: #fef2f1;
  /* Status */
  --good: #1f6b34; --good-bg: #eef8f0; --good-border: #cfe9d5;
  --warn: #8a5a00; --warn-bg: #fdf6e3; --warn-border: #f1e0b0;
  --bad: #b3261e; --bad-bg: #fdecea; --bad-border: #f6cdc9;
  --info: #0f4c81; --info-bg: #eef4fb; --info-border: #cddff0;
  /* Type */
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-num: 'Barlow Condensed', 'DM Sans', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  /* Shape */
  --radius-sm: 8px; --radius: 12px; --radius-lg: 16px; --radius-xl: 32px; --radius-pill: 999px;
  --shadow: 0 1px 2px rgba(20, 20, 20, 0.04), 0 4px 16px rgba(20, 20, 20, 0.05);
  --gutter: 16px; --max: 1040px;
  /* Race layer defaults, overridden on <body> by the race theme */
  --race-primary: #1a1a1a; --race-on-primary: #ffffff;
  /* Older names, kept so existing rules keep working */
  --card: var(--surface); --accent-name: var(--accent-ink);
}
`;

/** The browser's own chrome (`<meta name="theme-color">`) on pages without a race: the --bg above. */
export const THEME_COLOR = '#faf9f7';

/** Google Fonts for the three faces above. Change it together with the --font-* tokens. */
export const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400;1,9..144,500&family=DM+Sans:wght@400;500;600&family=Barlow+Condensed:wght@600;700&display=swap';
