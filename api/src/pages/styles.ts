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
.course-map { width: 100%; height: auto; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 16px; }
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

.org-nav { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; font-size: 14px; margin: 6px 0 22px; }
.org-nav a { color: var(--ink-2); }
.org-nav .current { color: var(--ink); font-weight: 600; text-decoration: none; }
.org-search { display: flex; gap: 8px; margin: 18px 0; max-width: 480px; }
.org-search input { flex: 1; font: inherit; font-size: 16px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: var(--ink); min-width: 0; }
.org-search .btn { min-height: 44px; padding: 0 18px; }
.results td.email { color: var(--ink-2); font-size: 14px; word-break: break-all; }
.results .bib { font-size: 20px; }
.table-scroll { overflow-x: auto; }
.field textarea { font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: var(--ink); width: 100%; min-height: 180px; }
.field input[type=file] { font-size: 15px; padding: 10px; }
.report { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 18px 0; }
.rejects { list-style: none; display: grid; gap: 6px; font-size: 14px; color: var(--ink-2); margin-bottom: 22px; }
.rejects li b { font-family: var(--font-num); font-size: 16px; color: var(--ink); margin-right: 8px; }
.ok { background: #eef8f0; border: 1px solid #cfe9d5; color: #1f6b34; padding: 12px 14px; border-radius: 12px; margin-bottom: 16px; font-size: 15px; }
.hero-links { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 18px; font-size: 14px; }
.hero-links a { color: var(--ink-2); }
.results a.runner { text-decoration: none; }
.results a.runner:hover { text-decoration: underline; }

/* A runner's result: the certificate, printable, then the ways to share it. */
.certificate { position: relative; margin: 20px 0 22px; background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 44px 24px 22px; text-align: center; overflow: hidden; box-shadow: 0 22px 44px -30px rgba(26, 26, 26, 0.35); }
.certificate::before { content: ''; position: absolute; inset: 14px 10px 10px; border: 1px solid var(--border); border-radius: 12px; pointer-events: none; }
.cert-band { position: absolute; top: 0; left: 0; right: 0; height: 6px; background: var(--race-primary); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.certificate .eyebrow { margin-bottom: 18px; }
.cert-name { font-family: var(--font-display); font-weight: 500; font-size: clamp(34px, 8vw, 58px); line-height: 1.04; letter-spacing: -0.02em; }
.cert-crossed { color: var(--ink-2); font-size: 15px; margin-top: 14px; }
.cert-race { font-family: var(--font-display); font-style: italic; font-size: clamp(22px, 5vw, 32px); line-height: 1.15; color: var(--race-primary); margin-top: 2px; }
.cert-distance { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-top: 10px; }
.cert-time { font-family: var(--font-num); font-weight: 700; font-size: clamp(80px, 24vw, 150px); line-height: 0.95; letter-spacing: -0.01em; margin: 20px 0 4px; font-variant-numeric: tabular-nums; }
.cert-facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 12px; max-width: 620px; margin: 22px auto 0; }
@media (min-width: 640px) { .cert-facts { grid-template-columns: repeat(4, 1fr); } }
.cert-facts dt { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
.cert-facts dd { font-family: var(--font-num); font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cert-course { width: 150px; margin: 22px auto 0; }
.cert-foot { position: relative; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.result-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 26px; }
.result-actions .btn { flex: 1 1 auto; }
@media (min-width: 640px) { .result-actions .btn { flex: 0 0 auto; } }
.result-splits { border: 1px solid var(--border); border-radius: 14px; background: var(--card); padding: 14px 18px; margin-bottom: 30px; }
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
.result-cta { border-top: 1px solid var(--border); padding: 36px 0 8px; }
.result-cta h2 { font-family: var(--font-display); font-weight: 500; font-size: 28px; line-height: 1.15; letter-spacing: -0.01em; max-width: 20ch; }
.result-cta p { color: var(--ink-2); max-width: 56ch; margin-top: 10px; }
.result-cta .cta-row { margin-top: 20px; }
.result-cta .cta-row a:not(.btn) { color: var(--ink-2); font-size: 15px; }
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body { background: #fff; }
  .topbar, footer, .result-actions, .result-splits, .result-cta { display: none !important; }
  .certificate { box-shadow: none; margin: 0; padding: 56px 48px 28px; }
}

/* Upload fallback: the file input is the drop target itself, so a file dropped anywhere on it lands, with no script. */
.field input.upload-file { font-size: 15px; color: var(--ink-2); padding: 28px 16px; border: 1.5px dashed #d4d0cb; border-radius: 16px; background: var(--card); cursor: pointer; }
.field input.upload-file:hover { border-color: var(--race-primary); }
.upload-file::file-selector-button { font: inherit; font-weight: 600; margin-right: 14px; padding: 10px 18px; border-radius: 999px; border: 1px solid var(--race-primary); background: transparent; color: var(--race-primary); cursor: pointer; }
.upload-hint { font-size: 13px; color: var(--muted); }
.form-page .upload-contact { margin: 10px 0 0; color: inherit; font-weight: 600; }
.upload-accepted { font-family: var(--font-display); font-weight: 500; font-size: 22px; letter-spacing: -0.01em; margin: 38px 0 14px; }
.upload-accepted + .what li { font-size: 15px; color: var(--ink-2); }
`;
