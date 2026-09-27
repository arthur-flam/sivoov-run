import { tokens } from './tokens';

/**
 * The public pages' stylesheet, the Sivoov layer. Every color, face and radius is a variable from
 * ./tokens.ts (nothing is hard-coded here); the race layer arrives as CSS variables on <body>.
 */
export const styles = `${tokens}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body { font-family: var(--font-body); background: var(--bg); color: var(--ink); line-height: 1.55; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }
img, svg { max-width: 100%; display: block; }
h1, h2, h3 { text-wrap: balance; }
p { text-wrap: pretty; }
.wrap { max-width: var(--max); margin: 0 auto; padding: 0 var(--gutter); }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; }
.brand { font-family: var(--font-display); font-weight: 500; font-size: 20px; letter-spacing: -0.01em; text-decoration: none; white-space: nowrap; }
.brand span { color: var(--accent); }
.topnav { display: flex; align-items: center; gap: 18px; font-size: 14px; }
.topnav a { color: var(--ink-2); text-decoration: none; white-space: nowrap; }
.topnav a:hover, .topnav a[aria-current=page] { color: var(--ink); }
.topnav a[aria-current=page] { font-weight: 600; }
.lang { font-size: 13px; color: var(--ink-2); text-decoration: none; }

.hero { padding: 40px 0 36px; border-bottom: 1px solid var(--border); }
.course-map { width: 100%; height: auto; border-radius: var(--radius); border: 1px solid var(--border); }
.eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-name); margin-bottom: 14px; }
.hero h1 { font-family: var(--font-display); font-weight: 500; font-size: clamp(34px, 6vw, 60px); line-height: 1.04; letter-spacing: -0.02em; max-width: 18ch; }
.hero h1 em { font-style: italic; color: var(--race-primary); }
.lede { font-size: 18px; color: var(--ink-2); max-width: 56ch; margin-top: 18px; }
.cta-row { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; margin-top: 28px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 26px; border-radius: var(--radius-pill); font-weight: 600; font-size: 16px; text-decoration: none; border: 1px solid transparent; cursor: pointer; font-family: inherit; }
.btn-race { background: var(--race-primary); color: var(--race-on-primary); }
.btn-ink { background: var(--ink); color: var(--bg); }
.btn-light { background: var(--bg); color: var(--ink); }
.btn-ghost { background: transparent; border-color: var(--border-strong); color: var(--ink); }
.btn-ghost:hover { background: var(--surface); }
.btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.window { font-size: 14px; color: var(--ink-2); }

.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; padding: 26px 0; border-bottom: 1px solid var(--border); }
.fact { border: 1px solid var(--border); background: var(--card); border-radius: var(--radius); padding: 16px; }
.fact .k { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
.fact .v { font-family: var(--font-num); font-size: clamp(28px, 7.5vw, 34px); font-weight: 600; line-height: 1.1; margin-top: 4px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.fact .s { font-size: 13px; color: var(--ink-2); }

.section { padding: 40px 0; border-bottom: 1px solid var(--border); }
.section h2 { font-family: var(--font-display); font-weight: 500; font-size: 28px; letter-spacing: -0.01em; margin-bottom: 20px; }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 18px; counter-reset: step; }
.step { position: relative; padding-top: 42px; }
.step::before { counter-increment: step; content: counter(step, decimal-leading-zero); position: absolute; top: 0; left: 0; font-family: var(--font-num); font-size: 30px; font-weight: 600; color: var(--accent); }
.step h3 { font-size: 17px; margin-bottom: 6px; }
.step p { color: var(--ink-2); font-size: 15px; }
.what { list-style: none; display: grid; gap: 10px; }
.what li { display: flex; gap: 12px; align-items: flex-start; font-size: 16px; }
.what li::before { content: ''; flex: none; width: 10px; height: 10px; margin-top: 8px; border-radius: 50%; background: var(--race-primary); }
.hero .what { margin-top: 22px; }
/* The race's own pictures, from its settings: a header photo and a logo. */
.race-banner { width: 100%; height: clamp(160px, 32vw, 360px); object-fit: cover; border-radius: var(--radius-lg); margin-top: 4px; }
.race-logo { height: 56px; width: auto; max-width: 220px; object-fit: contain; margin-bottom: 18px; }

.course { display: grid; grid-template-columns: 1fr; gap: 24px; align-items: center; }
@media (min-width: 720px) { .course { grid-template-columns: 1.1fr 1fr; } }
.diagram { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; }
.diagram svg { width: 100%; height: auto; }
.landmarks { list-style: none; display: grid; gap: 8px; }
.landmarks li { display: grid; grid-template-columns: 76px 1fr; gap: 12px; font-size: 15px; align-items: baseline; }
.landmarks .km { font-family: var(--font-num); font-weight: 600; font-size: 18px; color: var(--race-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.landmarks .d { color: var(--ink-2); font-size: 14px; }
.landing-end { border-bottom: 0; }
.landing-end .cta-row { margin-top: 0; }
.support { margin-top: 18px; font-size: 14px; color: var(--ink-2); }

/* Race landing (pages/landing.tsx, raceRadio.tsx): the race's own colours lead, from the race
   layer only (--race-primary, --race-on-primary, --race-accent). Hero and « Écoutez la course »
   are one full-width band in the race's colour; the rest sits on the page. */
.rl { --rl-ink: var(--race-on-primary); --rl-soft: color-mix(in srgb, var(--race-on-primary) 72%, transparent); --rl-faint: color-mix(in srgb, var(--race-on-primary) 22%, transparent); }
.rl-hero, .radio { margin-inline: calc(50% - 50vw); padding-inline: max(var(--gutter), calc(50vw - var(--max) / 2 + var(--gutter))); background: var(--race-primary); color: var(--rl-ink); }
.rl-hero { display: flex; align-items: flex-end; min-height: clamp(560px, 86vh, 820px); padding-top: 32px; padding-bottom: 44px; }
.rl-hero.has-photo { background:
  linear-gradient(180deg, color-mix(in srgb, var(--race-primary) 10%, transparent) 0%, color-mix(in srgb, var(--race-primary) 55%, transparent) 42%, color-mix(in srgb, var(--race-primary) 94%, transparent) 78%, var(--race-primary) 100%),
  var(--hero) center 30% / cover no-repeat, var(--race-primary); }
.rl-hero-in { max-width: 760px; }
.rl-logo { height: clamp(76px, 12vw, 104px); width: auto; margin-bottom: 26px; }
.rl-hero h1 { font-family: var(--font-num); font-weight: 700; font-size: clamp(46px, 9vw, 94px); line-height: 0.93; letter-spacing: -0.01em; max-width: 13ch; }
.rl-lede { margin-top: 20px; font-size: clamp(17px, 2.2vw, 20px); line-height: 1.5; color: var(--rl-soft); max-width: 50ch; }
.rl-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.rl-hero .btn-race { background: var(--race-on-primary); color: var(--race-primary); }
.rl-listen { gap: 10px; background: transparent; color: var(--rl-ink); border-color: var(--rl-soft); }
.rl-listen:hover { border-color: var(--rl-ink); }
.rl-listen-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--race-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--race-accent) 30%, transparent); }
.rl-window { margin-top: 18px; font-size: 15px; color: var(--rl-soft); }
.rl-hero .btn:focus-visible, .radio button:focus-visible, .radio summary:focus-visible { outline: 3px solid var(--race-accent); outline-offset: 3px; }

.radio { padding-top: 8px; padding-bottom: 48px; scroll-margin-top: 0; }
.radio-head { max-width: 640px; padding-top: 36px; border-top: 1px solid var(--rl-faint); }
.radio-head h2 { font-family: var(--font-num); font-weight: 700; font-size: clamp(34px, 5vw, 48px); line-height: 1; }
.radio-head p { margin-top: 10px; color: var(--rl-soft); font-size: 17px; }
.radio-body { display: grid; gap: 22px; margin-top: 26px; align-items: center; }
@media (min-width: 820px) { .radio-body { grid-template-columns: 1.05fr 1fr; gap: 40px; } }
.radio-map svg { width: 100%; height: auto; overflow: visible; }
.radio-line, .radio-trodden { fill: none; stroke-width: 6; stroke-linejoin: round; stroke-linecap: round; }
.radio-line { stroke: var(--rl-faint); }
.radio-trodden { stroke: var(--race-accent); stroke-dasharray: 1000; stroke-dashoffset: 1000; }
.radio-start { fill: var(--race-accent); }
.radio-finish { fill: var(--race-primary); stroke: var(--rl-ink); stroke-width: 3; }
.radio-runner { fill: var(--rl-ink); }
.radio-halo { fill: color-mix(in srgb, var(--race-accent) 35%, transparent); }
.radio.is-playing .radio-halo { animation: radio-pulse 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes radio-pulse { from { transform: scale(0.6); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .radio.is-playing .radio-halo { animation: none; } }
.radio-numbers { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.radio-k { display: block; font-size: 14px; color: var(--rl-soft); }
.radio-v { display: block; font-family: var(--font-num); font-weight: 700; font-size: clamp(44px, 7vw, 64px); line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
.radio-v.is-count { color: var(--race-accent); }
.radio-chapter { margin-top: 24px; font-family: var(--font-num); font-weight: 700; font-size: 24px; line-height: 1.15; }
.radio-caption { margin-top: 8px; min-height: 5.6em; padding-left: 14px; border-left: 3px solid var(--race-accent); font-size: 17px; line-height: 1.55; color: var(--rl-soft); }
.radio-controls { display: none; align-items: center; gap: 16px; margin-top: 22px; }
.radio.is-live .radio-controls { display: flex; }
.radio.is-live audio { display: none; }
.radio audio { width: 100%; margin-top: 18px; }
.radio-play { display: inline-flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 24px 0 18px; border: 0; border-radius: var(--radius-pill); background: var(--race-accent); color: var(--rl-ink); font: 600 17px var(--font-body); cursor: pointer; }
.radio-play svg { width: 24px; height: 24px; fill: currentColor; }
.radio-icon-pause, .radio.is-playing .radio-icon-play { display: none; }
.radio.is-playing .radio-icon-pause { display: block; }
.radio-progress { position: relative; flex: 1; height: 28px; cursor: pointer; }
.radio-progress::before, .radio-progress i { content: ''; position: absolute; left: 0; top: 12px; height: 4px; border-radius: var(--radius-pill); }
.radio-progress::before { right: 0; background: var(--rl-faint); }
.radio-progress i { width: 0; background: var(--race-accent); }
.radio-progress b { position: absolute; top: 9px; width: 2px; height: 10px; background: var(--rl-soft); }
.radio-list { margin-top: 26px; border-top: 1px solid var(--rl-faint); padding-top: 14px; }
.radio-list summary { cursor: pointer; font-weight: 600; color: var(--rl-ink); }
.radio-list ol { list-style: none; display: grid; gap: 2px; margin-top: 12px; }
@media (min-width: 820px) { .radio-list ol { grid-template-columns: 1fr 1fr; column-gap: 32px; } }
.radio-list button { display: grid; grid-template-columns: 44px 64px 1fr; gap: 10px; width: 100%; padding: 8px 6px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--rl-soft); font: 15px var(--font-body); text-align: left; cursor: pointer; }
.radio-list button:hover, .radio-list button[aria-current=true] { background: var(--rl-faint); color: var(--rl-ink); }
.radio-t, .radio-km { font-family: var(--font-num); font-weight: 600; font-variant-numeric: tabular-nums; }
.radio-note { margin-top: 20px; font-size: 14px; color: var(--rl-soft); max-width: 62ch; }

.rl .section h2, .rl-final h2 { font-family: var(--font-num); font-weight: 700; font-size: clamp(30px, 4vw, 40px); line-height: 1.05; letter-spacing: 0; }
.rl-gets { list-style: none; display: grid; gap: 22px 28px; }
@media (min-width: 560px) { .rl-gets { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 900px) { .rl-gets { grid-template-columns: repeat(4, 1fr); } }
.rl-gets li { padding-top: 14px; border-top: 3px solid var(--race-primary); }
.rl-gets h3 { font-size: 18px; margin-bottom: 6px; }
.rl-gets p, .rl-muted { color: var(--ink-2); font-size: 15px; }

.series-head { max-width: 60ch; }
.series-stage { margin: -10px 0 8px; font-weight: 600; color: var(--race-primary); }
.series-head p:last-child { color: var(--ink-2); }
.series-route { list-style: none; display: grid; gap: 22px; margin-top: 26px; position: relative; }
.series-route li { position: relative; display: grid; gap: 2px; padding-left: 34px; }
.series-route li::before { content: ''; position: absolute; left: 8px; top: 22px; bottom: -26px; width: 3px; background: var(--border-strong); }
.series-route li:last-child::before { display: none; }
.series-dot { position: absolute; left: 0; top: 3px; width: 19px; height: 19px; border-radius: 50%; background: var(--surface); border: 3px solid var(--race-primary); }
.series-route li.is-current .series-dot { background: var(--race-accent); border-color: var(--race-accent); box-shadow: 0 0 0 5px color-mix(in srgb, var(--race-accent) 22%, transparent); }
.series-date { font-family: var(--font-num); font-weight: 600; font-size: 17px; color: var(--race-primary); }
.series-route strong { font-size: 18px; }
.series-place { font-size: 14px; color: var(--ink-2); }
.series-route li.is-current .series-place { color: var(--race-accent); font-weight: 600; }
@media (min-width: 760px) {
  .series-route { grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 24px; }
  .series-route li { padding: 34px 0 0; }
  .series-route li::before { left: 19px; right: -24px; top: 8px; bottom: auto; width: auto; height: 3px; }
  .series-dot { top: 0; }
}
.series-reward { margin-top: 26px; display: inline-block; padding: 10px 16px; border-radius: var(--radius-pill); background: var(--surface-2); font-weight: 600; }
.series-link { display: inline-block; margin-top: 14px; font-weight: 600; color: var(--race-primary); }

.rl-distances { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: -6px 0 20px; color: var(--ink-2); }
.rl-dist { font-family: var(--font-num); font-weight: 700; font-size: 26px; color: var(--race-primary); font-variant-numeric: tabular-nums; }
.rl .landmarks .km { color: var(--race-primary); }

.rl-final { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px 32px; margin: 40px 0 16px; padding: 30px 26px; border-radius: var(--radius-lg); background: var(--race-primary); color: var(--race-on-primary); }
.rl-final p { margin-top: 6px; color: var(--rl-soft); max-width: 48ch; }
.rl-final .btn-race { background: var(--race-on-primary); color: var(--race-primary); }
.rl-final-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.rl-final-link { font-size: 14px; color: var(--rl-soft); }

footer { padding: 30px 0 50px; font-size: 13px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; }
.footer-links { display: flex; flex-wrap: wrap; gap: 8px 20px; }

/* Home: the open races */
.home-hero { padding: 32px 0 30px; }
.home-hero h1 { font-family: var(--font-display); font-weight: 500; font-size: clamp(38px, 7vw, 68px); line-height: 1.02; letter-spacing: -0.025em; max-width: 16ch; }
.kicker { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
.home-races { padding-bottom: 40px; border-bottom: 1px solid var(--border); }
.race-cards { display: grid; gap: 18px; }
.race-card { display: grid; grid-template-columns: 1fr; background: var(--surface); border: 1px solid var(--border); border-top: 6px solid var(--race-primary); border-radius: var(--radius-lg); overflow: hidden; text-decoration: none; box-shadow: var(--shadow); }
.race-card:hover { border-color: var(--border-strong); border-top-color: var(--race-primary); }
.race-card:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.race-card-body { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 22px 20px 24px; }
.race-card-kicker { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-2); }
.race-card h3 { font-family: var(--font-display); font-weight: 500; font-size: clamp(28px, 4vw, 40px); line-height: 1.06; letter-spacing: -0.02em; }
.race-card-window { font-size: 15px; color: var(--ink-2); }
.race-card .btn { margin-top: 6px; }
.race-card-visual { order: -1; display: flex; align-items: center; justify-content: center; padding: 18px; background: var(--surface-2); border-bottom: 1px solid var(--border); }
.race-card-visual svg { width: 100%; max-width: 320px; max-height: 220px; height: auto; }
.race-card-visual.is-map { padding: 0; }
.race-card-visual img { width: 100%; height: 100%; object-fit: cover; }
@media (min-width: 760px) {
  .race-card { grid-template-columns: 1.2fr 1fr; }
  .race-card-body { justify-content: center; padding: 32px; }
  .race-card-visual { order: 0; border-bottom: 0; border-left: 1px solid var(--border); }
  .race-card-visual svg { max-height: 320px; }
}
.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
.chips li { font-size: 14px; font-weight: 600; padding: 5px 12px; border-radius: var(--radius-pill); background: var(--surface-2); border: 1px solid var(--border); }
.numbered { list-style: none; counter-reset: num; display: grid; gap: 16px; }
.numbered li { counter-increment: num; display: grid; grid-template-columns: 36px 1fr; gap: 12px; align-items: baseline; font-size: 17px; }
.numbered li::before { content: counter(num); font-family: var(--font-num); font-weight: 700; font-size: 30px; line-height: 1; color: var(--accent); }
.numbered.cards li { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; font-size: 16px; }
@media (min-width: 760px) {
  .numbered { grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .numbered li { grid-template-columns: 1fr; gap: 10px; }
}
.band { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px 28px; margin: 40px 0 10px; padding: 28px 24px; border-radius: var(--radius-lg); background: var(--ink); color: var(--bg); }
.band h2 { font-family: var(--font-display); font-weight: 500; font-size: 28px; letter-spacing: -0.01em; }
.band p { margin-top: 6px; max-width: 46ch; opacity: 0.78; }

/* Organizers: the page for race directors */
.pitch-hero { display: grid; gap: 36px; align-items: center; padding: 32px 0 48px; border-bottom: 1px solid var(--border); }
.pitch-hero h1 { font-family: var(--font-display); font-weight: 500; font-size: clamp(36px, 5.4vw, 58px); line-height: 1.04; letter-spacing: -0.02em; max-width: 15ch; }
.pitch-hero h1 em { display: block; font-style: italic; color: var(--accent-ink); }
@media (min-width: 860px) { .pitch-hero { grid-template-columns: 1.3fr 1fr; gap: 48px; padding: 48px 0 64px; } }
.hero-visual { display: flex; justify-content: center; padding: 32px 16px; border-radius: var(--radius-lg); background: var(--surface-2); }
.hero-visual img { width: 100%; height: auto; border-radius: var(--radius); }
.phone { width: 260px; max-width: 100%; aspect-ratio: 9 / 17; padding: 9px; border-radius: calc(var(--radius-xl) + 9px); background: var(--ink); border: 2px solid var(--ink-2); box-shadow: var(--shadow); }
.phone-screen { height: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 30px 16px 16px; border-radius: var(--radius-xl); background: var(--ink); color: var(--bg); }
.phone-race { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.6; }
.phone-status { margin-top: 22px; font-family: var(--font-num); font-weight: 700; font-size: 18px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }
.phone-distance { margin-top: 6px; font-family: var(--font-num); font-weight: 700; font-size: 64px; line-height: 1; font-variant-numeric: tabular-nums; }
.phone-distance small { margin-left: 4px; font-size: 22px; opacity: 0.6; }
.phone-time { margin-top: 10px; font-family: var(--font-num); font-weight: 700; font-size: 52px; line-height: 1; font-variant-numeric: tabular-nums; }
.phone-pace { margin-top: 6px; font-size: 14px; opacity: 0.6; }
.phone-progress { width: 100%; height: 6px; margin-top: 22px; border-radius: var(--radius-pill); background: var(--ink-2); overflow: hidden; }
.phone-progress i { display: block; height: 100%; background: var(--accent); }
.phone-official { margin-top: 14px; padding: 4px 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; border: 1px solid var(--ink-2); border-radius: var(--radius-pill); }
.phone-caption { margin-top: auto; padding: 10px 12px; font-family: var(--font-display); font-style: italic; font-size: 14px; line-height: 1.35; border-radius: var(--radius); background: var(--ink-2); }
.pitch-grid { display: grid; gap: 24px 28px; }
@media (min-width: 560px) { .pitch-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 860px) { .pitch-grid { grid-template-columns: repeat(3, 1fr); } }
.pitch-item { padding-top: 12px; border-top: 2px solid var(--ink); }
.pitch-item h3, .faq h3 { font-size: 17px; margin-bottom: 4px; }
.pitch-item p, .faq p { color: var(--ink-2); font-size: 15px; }
.pitch-rows { list-style: none; border-top: 1px solid var(--border); }
.pitch-rows li { display: grid; gap: 2px 24px; padding: 14px 0; border-bottom: 1px solid var(--border); }
.pitch-rows span { color: var(--ink-2); }
@media (min-width: 560px) { .pitch-rows li { grid-template-columns: minmax(12em, 1fr) 1.6fr; } }
@media (min-width: 860px) {
  .pitch-split { display: grid; grid-template-columns: 1fr 2fr; gap: 28px; align-items: start; }
  .pitch-split h2 { margin-bottom: 0; }
}
.pitch-note { display: inline-block; margin-top: 18px; padding: 8px 14px; font-size: 15px; font-weight: 600; border-radius: var(--radius-pill); background: var(--accent-bg); color: var(--accent-ink); }
.price { display: grid; gap: 8px; padding: 24px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow); color: var(--ink-2); }
.price-amount { font-family: var(--font-display); font-weight: 500; font-size: 32px; letter-spacing: -0.01em; color: var(--ink); }
.price-soon { margin-top: 6px; padding-top: 14px; border-top: 1px solid var(--border); font-size: 15px; }
.faq { display: grid; gap: 24px 40px; }
@media (min-width: 760px) { .faq { grid-template-columns: repeat(2, 1fr); } }
.contact { display: grid; gap: 8px; border-bottom: 0; scroll-margin-top: 16px; }
.contact .lede { margin-top: 0; }
@media (min-width: 860px) { .contact { grid-template-columns: 1fr 1.4fr; gap: 48px; align-items: start; } }
.lead-form, .lead-sent { padding: 22px 18px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow); }
@media (min-width: 560px) { .lead-form, .lead-sent { padding: 28px; } }
.field-row { display: grid; gap: 0 16px; }
@media (min-width: 560px) { .field-row { grid-template-columns: 1fr 1fr; } }
.lead-form .field input, .lead-form .field textarea { font-family: var(--font-body); font-size: 16px; padding: 12px 14px; }
.lead-form .field textarea { min-height: 120px; resize: vertical; }
.field.invalid input, .field.invalid textarea { border-color: var(--bad); }
.field-error { font-size: 14px; color: var(--bad); }
.lead-form .btn { width: 100%; }
@media (min-width: 560px) { .lead-form .btn { width: auto; } }
.hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
.lead-sent h3 { font-family: var(--font-display); font-weight: 500; font-size: 28px; letter-spacing: -0.01em; margin-bottom: 8px; }
.lead-sent p { color: var(--ink-2); }
.lead-sent p + p { margin-top: 12px; }
.lead-sent a { color: var(--ink); }

.form-page { max-width: 440px; margin: 0 auto; padding: 40px 0; }
.form-page h1 { font-family: var(--font-display); font-weight: 500; font-size: 34px; letter-spacing: -0.02em; margin-bottom: 8px; }
.form-page p { color: var(--ink-2); margin-bottom: 22px; }
.field { display: grid; gap: 6px; margin-bottom: 16px; }
.field label { font-size: 14px; font-weight: 600; }
.field input { font: inherit; font-size: 18px; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--ink); width: 100%; }
.field input.code { font-family: var(--font-num); font-size: 34px; letter-spacing: 0.3em; text-align: center; }
.field input:focus, .field textarea:focus { outline: 3px solid var(--accent); outline-offset: 1px; border-color: transparent; }
.error { background: var(--bad-bg); border: 1px solid var(--bad-border); color: var(--bad); padding: 12px 14px; border-radius: var(--radius); margin-bottom: 16px; font-size: 15px; }
.hint { font-size: 13px; color: var(--muted); margin-top: 12px; }
.race-chip { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); margin-bottom: 26px; }
.race-chip i { width: 10px; height: 10px; border-radius: 50%; background: var(--race-primary); }

.welcome { text-align: center; padding: 50px 0; }
.welcome .bib, .result-pending .bib { display: inline-block; border: 2px solid var(--ink); border-radius: var(--radius-sm); padding: 10px 26px; font-family: var(--font-num); font-size: 56px; font-weight: 700; line-height: 1; margin: 18px 0; font-variant-numeric: tabular-nums; }
.stores { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 22px; }

table.results { width: 100%; border-collapse: collapse; font-size: 15px; }
.results th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); padding: 8px 6px; border-bottom: 1px solid var(--border); }
.results td { padding: 12px 6px; border-bottom: 1px solid var(--border); }
.results .num { font-family: var(--font-num); font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.results .tag { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.empty { color: var(--ink-2); padding: 30px 0; }

.org-nav { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; font-size: 14px; margin: 6px 0 22px; }
.org-nav a { color: var(--ink-2); }
.org-nav .current { color: var(--ink); font-weight: 600; text-decoration: none; }
.org-search { display: flex; gap: 8px; margin: 18px 0; max-width: 480px; }
.org-search input { flex: 1; font: inherit; font-size: 16px; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--ink); min-width: 0; }
.org-search .btn { min-height: 44px; padding: 0 18px; }
.results td.email { color: var(--ink-2); font-size: 14px; word-break: break-all; }
.results .bib { font-size: 20px; }
.table-scroll { overflow-x: auto; }
.field textarea { font: inherit; font-family: var(--font-mono); font-size: 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--ink); width: 100%; min-height: 180px; }
.field input[type=file] { font-size: 15px; padding: 10px; }
.report { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 18px 0; }
.rejects { list-style: none; display: grid; gap: 6px; font-size: 14px; color: var(--ink-2); margin-bottom: 22px; }
.rejects li b { font-family: var(--font-num); font-size: 16px; color: var(--ink); margin-right: 8px; }
.ok { background: var(--good-bg); border: 1px solid var(--good-border); color: var(--good); padding: 12px 14px; border-radius: var(--radius); margin-bottom: 16px; font-size: 15px; }
.hero-links { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 18px; font-size: 14px; }
.hero-links a { color: var(--ink-2); }
.results a.runner { text-decoration: none; }
.results a.runner:hover { text-decoration: underline; }

/* A runner's result: the certificate, printable, then the ways to share it. Plain on purpose:
   it uses the tokens and patterns above and nothing of its own until the identity is decided. */
.certificate { margin: 20px 0 22px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 32px 20px 20px; text-align: center; }
.cert-name { font-family: var(--font-display); font-weight: 500; font-size: clamp(32px, 7vw, 52px); line-height: 1.05; }
.cert-crossed { color: var(--ink-2); margin-top: 12px; }
.cert-race { font-family: var(--font-display); font-size: clamp(22px, 5vw, 30px); line-height: 1.15; }
.cert-distance { color: var(--ink-2); margin-top: 6px; }
.cert-time { font-family: var(--font-num); font-weight: 700; font-size: clamp(72px, 22vw, 140px); line-height: 1; margin: 18px 0 4px; font-variant-numeric: tabular-nums; }
.cert-facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 12px; max-width: 620px; margin: 20px auto 0; }
@media (min-width: 640px) { .cert-facts { grid-template-columns: repeat(4, 1fr); } }
.cert-facts dt { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
.cert-facts dd { font-family: var(--font-num); font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cert-course { width: 150px; margin: 20px auto 0; }
.cert-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.result-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 26px; }
.result-actions .btn { flex: 1 1 auto; }
@media (min-width: 640px) { .result-actions .btn { flex: 0 0 auto; } }
.result-splits { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 14px 18px; margin-bottom: 30px; }
.result-splits summary { cursor: pointer; font-weight: 600; }
.result-splits ol { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 2px 28px; margin-top: 12px; }
.result-splits li { display: grid; grid-template-columns: 56px 1fr 1fr; align-items: baseline; padding: 3px 0; border-bottom: 1px solid var(--border); }
.result-splits .km { font-size: 14px; color: var(--ink-2); }
.result-splits .num { font-family: var(--font-num); font-size: 18px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.result-splits .muted { color: var(--muted); }
.result-pending { text-align: center; padding: 56px 0 40px; }
.result-pending h1 { font-family: var(--font-display); font-weight: 500; font-size: clamp(28px, 6vw, 40px); line-height: 1.1; letter-spacing: -0.01em; max-width: 18ch; margin: 0 auto 14px; }
.result-pending p { color: var(--ink-2); max-width: 48ch; margin: 0 auto; }
.result-pending .hint { margin-top: 14px; }
.result-pending .result-actions { margin-top: 26px; margin-bottom: 0; }
.result-cta { border-top: 1px solid var(--border); padding: 36px 0 8px; }
.result-cta h2 { font-family: var(--font-display); font-weight: 500; font-size: 28px; line-height: 1.15; letter-spacing: -0.01em; max-width: 20ch; }
.result-cta p { color: var(--ink-2); max-width: 56ch; margin-top: 10px; }
.result-cta .cta-row { margin-top: 20px; }
.result-cta .cta-row a:not(.btn) { color: var(--ink-2); font-size: 15px; }
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body { background: var(--surface); }
  .topbar, footer, .result-actions, .result-splits, .result-cta { display: none !important; }
  .certificate { margin: 0; padding: 48px 40px 24px; }
}

/* Upload fallback: the file input is the drop target itself, so a file dropped anywhere on it lands, with no script. */
.field input.upload-file { font-size: 15px; color: var(--ink-2); padding: 28px 16px; border: 1.5px dashed var(--border-strong); border-radius: var(--radius-lg); background: var(--surface); cursor: pointer; }
.field input.upload-file:hover { border-color: var(--race-primary); }
.upload-file::file-selector-button { font: inherit; font-weight: 600; margin-right: 14px; padding: 10px 18px; border-radius: var(--radius-pill); border: 1px solid var(--race-primary); background: transparent; color: var(--race-primary); cursor: pointer; }
.upload-hint { font-size: 13px; color: var(--muted); }
.form-page .upload-contact { margin: 10px 0 0; color: inherit; font-weight: 600; }
.upload-accepted { font-family: var(--font-display); font-weight: 500; font-size: 22px; letter-spacing: -0.01em; margin: 38px 0 14px; }
.upload-accepted + .what li { font-size: 15px; color: var(--ink-2); }
`;
