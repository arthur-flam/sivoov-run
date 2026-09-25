# Design

## Identity direction (proposed, to confirm)

**Sivoov is the broadcaster, the race is the event.** Like a sports broadcaster, Sivoov has
a constant voice, typography and layout that make every race feel produced, and the race
brings its identity: logo, colors, hero photo, medal, course. Runners trust the broadcaster;
organizers see their race, not ours.

This is not white-labeling. The organizer cannot restyle the app, and does not need to: the
event surfaces carry their brand loud enough.

### The Sivoov layer (constant)
- Palette from the existing site: warm paper `#faf9f7`, ink `#1a1a1a`, secondary `#52525b`,
  muted `#a1a1aa`, border `#e8e6e3`, Sivoov coral `#e8786f` (accent-name `#b8443b`).
- Type: Fraunces (display, editorial serif) + DM Sans (body). Add a condensed numeric face
  for times, bibs, and pace on the run screen (candidate: a tabular-figures sans such as
  "Barlow Condensed" or a variable of DM Sans). Numbers are the hero of a race.
- Tone: official, warm, a little ceremonial. Results look like results, not a dashboard.
- Motifs: the bib, the timing mat, the finish tape, the certificate. Use sparingly and well.
- Run screen: dark ground (near-black), white numerals, one accent line for progress. Dark
  reads better through sweat and glare and saves battery on OLED.

### The race layer (per race, from `race.theme`)
```
theme: {
  primary: "#hex",        // buttons on the race landing, progress accent in the run
  onPrimary: "#hex",
  logo: url, hero: url, medal: url,
  partnerLogos: url[],
  displayName: "Marathon International de Deauville"
}
```
The race layer appears on: landing hero, race card in the app, the run's progress accent,
the finish screen, results header, certificate, share image. Everywhere else is Sivoov.

### Open decisions
- Confirm the "broadcaster" direction against an alternative: full white-label per race
  (cheaper for sales, weaker product) or pure Sivoov brand (stronger, harder to sell).
- Whether the race layer also picks the announcer voice, or Sivoov has one voice.
- Dark run screen vs light: prototype both under sunlight before deciding.

## Until the identity is decided (owner's instruction, 2026-09-25)
Nothing here is committed to: the direction above is a proposal. Until it is decided, new
surfaces are built from the existing tokens and components only — `app/src/theme.ts` and
`app/src/components/ui.tsx` in the app, the `tokens` and existing classes in
`api/src/pages/styles.ts` on the web — with no decoration of their own (no new colours,
gradients, shadows, frames, ornamental SVG or motion). Function and hierarchy only, so the
identity can be applied later without undoing anything.

Surfaces waiting for the identity, all deliberately plain today:
- the share cards (`api/src/pages/card.tsx`): link previews and the image a runner posts;
- the certificate and the bib page (`api/src/pages/result.tsx`, `.cert-*` in `styles.ts`);
- the finish screen (`app/src/components/Finish.tsx`): a medal or ceremony moment belongs here
  once there is a look for it; the organizer's medal photo (`theme.medal`) shows if provided;
- the finisher card on the app's home.

Kept because they are legibility, not identity: the race colour lifted to 3:1 on the night run
screen (`readableOn`) and the untrodden course line (`colors.nightLine`).

## Conventions
- Web pages: server-rendered, one CSS file with the tokens above, no framework. Mobile
  first, gutter 16px minimum, works at 360px wide.
- App: `StyleSheet.create` with tokens from `app/src/theme.ts`. No utility-class layer.
- Run screen: font sizes for distance and time at least 64pt; controls at the bottom
  under the thumb; stop requires a long press; nothing swipeable.
- Every screen has a loading, empty and error state, and a French and English string set.
- Motion: Reanimated only for the run screen (progress, countdown). Elsewhere, none.
- Assets: SVG for icons and the course diagram, no icon font.
