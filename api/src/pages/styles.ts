/** One stylesheet, the Sivoov layer. The race layer arrives as CSS variables on <body>. */
export const styles = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #faf9f7; --card: #ffffff; --ink: #1a1a1a; --ink-2: #52525b; --muted: #a1a1aa;
  --border: #e8e6e3; --accent: #e8786f; --accent-bg: #fef2f1; --accent-name: #b8443b;
  --font-display: 'Fraunces', Georgia, serif; --font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-num: 'Barlow Condensed', 'DM Sans', sans-serif;
  --race-primary: #1a1a1a; --race-on-primary: #ffffff;
  --gutter: 16px; --max: 1040px;
}
html { -webkit-text-size-adjust: 100%; }
body { font-family: var(--font-body); background: var(--bg); color: var(--ink); line-height: 1.55; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img, svg { max-width: 100%; display: block; }
.wrap { max-width: var(--max); margin: 0 auto; padding: 0 var(--gutter); }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; }
.brand { font-family: var(--font-display); font-weight: 500; font-size: 20px; letter-spacing: -0.01em; text-decoration: none; }
.brand span { color: var(--accent); }
.lang { font-size: 13px; color: var(--ink-2); text-decoration: none; }

.hero { padding: 40px 0 36px; border-bottom: 1px solid var(--border); }
.eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-name); margin-bottom: 14px; }
.hero h1 { font-family: var(--font-display); font-weight: 500; font-size: clamp(34px, 6vw, 60px); line-height: 1.04; letter-spacing: -0.02em; max-width: 14ch; }
.hero h1 em { font-style: italic; color: var(--race-primary); }
.lede { font-size: 18px; color: var(--ink-2); max-width: 56ch; margin-top: 18px; }
.cta-row { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; margin-top: 28px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 26px; border-radius: 999px; font-weight: 600; font-size: 16px; text-decoration: none; border: 1px solid transparent; cursor: pointer; font-family: inherit; }
.btn-race { background: var(--race-primary); color: var(--race-on-primary); }
.btn-ghost { background: transparent; border-color: var(--border); color: var(--ink); }
.btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.window { font-size: 14px; color: var(--ink-2); }

.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; padding: 26px 0; border-bottom: 1px solid var(--border); }
.fact { border: 1px solid var(--border); background: var(--card); border-radius: 14px; padding: 16px; }
.fact .k { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
.fact .v { font-family: var(--font-num); font-size: 34px; font-weight: 600; line-height: 1.1; margin-top: 4px; font-variant-numeric: tabular-nums; }
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

.course { display: grid; grid-template-columns: 1fr; gap: 24px; align-items: center; }
@media (min-width: 720px) { .course { grid-template-columns: 1.1fr 1fr; } }
.diagram { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
.diagram svg { width: 100%; height: auto; }
.landmarks { list-style: none; display: grid; gap: 8px; }
.landmarks li { display: grid; grid-template-columns: 64px 1fr; gap: 12px; font-size: 15px; align-items: baseline; }
.landmarks .km { font-family: var(--font-num); font-weight: 600; font-size: 18px; color: var(--race-primary); font-variant-numeric: tabular-nums; }
.landmarks .d { color: var(--ink-2); font-size: 14px; }

footer { padding: 30px 0 50px; font-size: 13px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; }

.form-page { max-width: 440px; margin: 0 auto; padding: 40px 0; }
.form-page h1 { font-family: var(--font-display); font-weight: 500; font-size: 34px; letter-spacing: -0.02em; margin-bottom: 8px; }
.form-page p { color: var(--ink-2); margin-bottom: 22px; }
.field { display: grid; gap: 6px; margin-bottom: 16px; }
.field label { font-size: 14px; font-weight: 600; }
.field input { font: inherit; font-size: 18px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: var(--ink); width: 100%; }
.field input.code { font-family: var(--font-num); font-size: 34px; letter-spacing: 0.3em; text-align: center; }
.field input:focus { outline: 3px solid var(--accent); outline-offset: 1px; border-color: transparent; }
.error { background: var(--accent-bg); border: 1px solid #fcd9d6; color: var(--accent-name); padding: 12px 14px; border-radius: 12px; margin-bottom: 16px; font-size: 15px; }
.hint { font-size: 13px; color: var(--muted); margin-top: 12px; }
.race-chip { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); margin-bottom: 26px; }
.race-chip i { width: 10px; height: 10px; border-radius: 50%; background: var(--race-primary); }

.welcome { text-align: center; padding: 50px 0; }
.welcome .bib { display: inline-block; border: 2px solid var(--ink); border-radius: 10px; padding: 10px 26px; font-family: var(--font-num); font-size: 56px; font-weight: 700; line-height: 1; margin: 18px 0; font-variant-numeric: tabular-nums; }
.stores { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 22px; }

table.results { width: 100%; border-collapse: collapse; font-size: 15px; }
.results th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); padding: 8px 6px; border-bottom: 1px solid var(--border); }
.results td { padding: 12px 6px; border-bottom: 1px solid var(--border); }
.results .num { font-family: var(--font-num); font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.results .tag { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.empty { color: var(--ink-2); padding: 30px 0; }
`;
