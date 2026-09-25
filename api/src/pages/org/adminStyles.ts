import { tokens } from '../tokens';

/**
 * The organizer admin's stylesheet. Every value comes from ../tokens.ts; nothing here decides a
 * color. Screens compose the components in ./ui.tsx and should not need CSS of their own.
 * Mobile first: the nav is a scrolling tab row on a phone and a sidebar from 900px.
 */
export const adminStyles = `${tokens}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body.admin { font-family: var(--font-body); background: var(--bg); color: var(--ink); line-height: 1.5; font-size: 15px; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img, svg { max-width: 100%; display: block; }
.hide { display: none !important; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Top bar */
.a-top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px; padding: 10px var(--gutter); background: var(--surface); border-bottom: 1px solid var(--border); }
.a-brand { font-family: var(--font-display); font-weight: 500; font-size: 18px; text-decoration: none; white-space: nowrap; }
.a-brand span { color: var(--accent); }
.a-brand small { font-family: var(--font-body); font-size: 12px; color: var(--muted); margin-left: 6px; letter-spacing: 0.02em; }
.a-top .grow { flex: 1; }
.a-menu { position: relative; }
.a-menu > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-pill); font-size: 14px; max-width: 260px; }
.a-menu > summary::-webkit-details-marker { display: none; }
.a-menu > summary .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--race-primary); flex: none; }
.a-menu > summary .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.a-menu[open] > summary { border-color: var(--border-strong); }
.a-pop { position: absolute; right: 0; top: calc(100% + 6px); min-width: 240px; max-width: 320px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 6px; z-index: 30; }
.a-pop a, .a-pop .who { display: block; padding: 9px 10px; border-radius: var(--radius-sm); text-decoration: none; font-size: 14px; }
.a-pop a:hover { background: var(--surface-2); }
.a-pop .who { color: var(--muted); font-size: 13px; border-bottom: 1px solid var(--border); border-radius: 0; margin-bottom: 4px; word-break: break-all; }
.a-pop a.on { font-weight: 600; }
.avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--surface-2); color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; text-transform: uppercase; flex: none; }

/* Shell */
.a-body { display: block; }
.a-nav { background: var(--surface); border-bottom: 1px solid var(--border); overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.a-nav::-webkit-scrollbar { display: none; }
.a-nav .race { display: none; }
.a-nav ul { list-style: none; display: flex; gap: 2px; padding: 6px var(--gutter); }
.a-nav li a { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius-sm); text-decoration: none; color: var(--ink-2); white-space: nowrap; font-size: 14px; font-weight: 500; }
.a-nav li a svg { width: 18px; height: 18px; flex: none; }
.a-nav li a:hover { background: var(--surface-2); color: var(--ink); }
.a-nav li a.on { background: var(--surface-2); color: var(--ink); font-weight: 600; }
.a-nav .foot { display: none; }
.a-main { padding: 20px var(--gutter) 60px; max-width: 1180px; }
@media (min-width: 900px) {
  .a-body { display: grid; grid-template-columns: 236px 1fr; min-height: calc(100vh - 53px); }
  .a-nav { border-bottom: 0; border-right: 1px solid var(--border); overflow: visible; }
  .a-nav > div { position: sticky; top: 53px; padding: 18px 12px; }
  .a-nav .race { display: block; padding: 0 10px 14px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
  .a-nav .race b { display: block; font-family: var(--font-display); font-weight: 500; font-size: 17px; line-height: 1.25; }
  .a-nav .race span { font-size: 13px; color: var(--muted); }
  .a-nav ul { flex-direction: column; padding: 0; }
  .a-nav .foot { display: block; margin-top: 18px; padding: 12px 10px 0; border-top: 1px solid var(--border); font-size: 13px; }
  .a-nav .foot a { display: block; color: var(--ink-2); padding: 4px 0; }
  .a-main { padding: 28px 36px 80px; }
}
.a-solo { max-width: 460px; margin: 0 auto; padding: 48px var(--gutter) 80px; }
.a-wide { max-width: 1040px; margin: 0 auto; padding: 32px var(--gutter) 80px; }

/* Page header */
.ph { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 20px; margin-bottom: 22px; }
.ph .back { display: inline-block; font-size: 13px; color: var(--ink-2); text-decoration: none; margin-bottom: 6px; }
.ph .back:hover { color: var(--ink); }
.ph h1 { font-family: var(--font-display); font-weight: 500; font-size: 28px; line-height: 1.15; letter-spacing: -0.015em; }
.ph p { color: var(--ink-2); margin-top: 4px; max-width: 62ch; }
.ph .actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (min-width: 900px) { .ph h1 { font-size: 32px; } }

/* Cards and grids */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; }
.card + .card, .card + .grid, .grid + .card, .grid + .grid, .stats + .card, .stats + .grid, .card + .stats { margin-top: 16px; }
.card-h { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 16px; margin-bottom: 12px; }
.card-h h2 { font-size: 16px; font-weight: 600; }
.card-h p { font-size: 13px; color: var(--muted); }
.card-h a { font-size: 14px; color: var(--ink-2); }
.card.flush { padding: 0; overflow: hidden; }
.card.flush > .card-h { padding: 16px 18px 0; }
.grid { display: grid; gap: 16px; }
.grid > *, .a-body > *, .card { min-width: 0; }
.grid > * > .card + .card { margin-top: 16px; }
@media (min-width: 900px) { .grid.two { grid-template-columns: 1fr 1fr; } .grid.main-side { grid-template-columns: 1.6fr 1fr; align-items: start; } }

/* Numbers */
.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (min-width: 700px) { .stats { grid-template-columns: repeat(4, 1fr); } }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; text-decoration: none; display: block; }
a.stat:hover { border-color: var(--border-strong); }
.stat .l { font-size: 13px; color: var(--ink-2); }
.stat .v { font-family: var(--font-num); font-weight: 600; font-size: 36px; line-height: 1.05; margin-top: 4px; font-variant-numeric: tabular-nums; }
.stat .h { font-size: 13px; color: var(--muted); margin-top: 2px; }
.bar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; margin-top: 10px; }
.bar i { display: block; height: 100%; background: var(--race-primary); border-radius: 3px; }

/* Badges */
.badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; line-height: 20px; white-space: nowrap; background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--border); }
.badge.good { background: var(--good-bg); color: var(--good); border-color: var(--good-border); }
.badge.warn { background: var(--warn-bg); color: var(--warn); border-color: var(--warn-border); }
.badge.bad { background: var(--bad-bg); color: var(--bad); border-color: var(--bad-border); }
.badge.info { background: var(--info-bg); color: var(--info); border-color: var(--info-border); }

/* Messages */
.flash { padding: 12px 14px; border-radius: var(--radius); margin-bottom: 16px; font-size: 15px; border: 1px solid var(--border); background: var(--surface); }
.flash.good { background: var(--good-bg); border-color: var(--good-border); color: var(--good); }
.flash.warn { background: var(--warn-bg); border-color: var(--warn-border); color: var(--warn); }
.flash.bad { background: var(--bad-bg); border-color: var(--bad-border); color: var(--bad); }
.flash.info { background: var(--info-bg); border-color: var(--info-border); color: var(--info); }
.flash ul { margin: 6px 0 0 18px; }
.empty-state { text-align: center; padding: 34px 16px; color: var(--ink-2); }
.empty-state b { display: block; color: var(--ink); font-size: 16px; margin-bottom: 4px; }
.empty-state .btn { margin-top: 14px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.num { font-family: var(--font-num); font-weight: 600; font-variant-numeric: tabular-nums; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 16px; border-radius: var(--radius-pill); font: inherit; font-weight: 600; font-size: 14px; text-decoration: none; border: 1px solid transparent; cursor: pointer; white-space: nowrap; background: var(--surface); color: var(--ink); border-color: var(--border-strong); }
.btn:hover { background: var(--surface-2); }
.btn:focus-visible, .a-menu > summary:focus-visible, .a-nav a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.btn[disabled], .btn.disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
.btn-primary { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.btn-primary:hover { background: var(--ink-2); }
.btn-race { background: var(--race-primary); color: var(--race-on-primary); border-color: var(--race-primary); }
.btn-race:hover { filter: brightness(1.1); background: var(--race-primary); }
.btn-danger { color: var(--bad); border-color: var(--bad-border); }
.btn-danger:hover { background: var(--bad-bg); }
.btn-quiet { border-color: transparent; background: transparent; color: var(--ink-2); padding: 0 10px; }
.btn-quiet:hover { background: var(--surface-2); color: var(--ink); }
.btn-sm { min-height: 32px; padding: 0 12px; font-size: 13px; }
.btn-lg { min-height: 50px; padding: 0 24px; font-size: 16px; }
.btn-block { width: 100%; }
.btn svg { width: 16px; height: 16px; }

/* Forms */
.field { display: grid; gap: 6px; margin-bottom: 16px; }
.field > label, .field > .label { font-size: 14px; font-weight: 600; }
.field .hint { font-size: 13px; color: var(--muted); font-weight: 400; }
.field .err { font-size: 13px; color: var(--bad); }
.input, .field input:not([type=checkbox]):not([type=radio]):not([type=color]), .field select, .field textarea {
  font: inherit; font-size: 16px; padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--ink); width: 100%; min-width: 0; }
.field textarea { min-height: 110px; line-height: 1.45; resize: vertical; }
.field textarea.mono { font-family: var(--font-mono); font-size: 14px; }
.input:focus, .field input:focus, .field select:focus, .field textarea:focus { outline: 3px solid var(--accent-bg); border-color: var(--accent); }
.field.bad input, .field.bad select, .field.bad textarea { border-color: var(--bad); }
.field input.code { font-family: var(--font-num); font-size: 34px; letter-spacing: 0.3em; text-align: center; }
.form-grid { display: grid; gap: 0 16px; }
@media (min-width: 700px) { .form-grid.two { grid-template-columns: 1fr 1fr; } .form-grid.three { grid-template-columns: 1fr 1fr 1fr; } }
.form-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 6px; }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; }
.check input { width: 18px; height: 18px; margin-top: 2px; flex: none; }

/* Search and filters */
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
.search { display: flex; gap: 8px; flex: 1 1 260px; max-width: 420px; }
.search input { flex: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips a { display: inline-flex; gap: 6px; align-items: center; padding: 6px 12px; border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--surface); text-decoration: none; font-size: 13px; font-weight: 500; color: var(--ink-2); }
.chips a:hover { border-color: var(--border-strong); color: var(--ink); }
.chips a.on { background: var(--ink); border-color: var(--ink); color: var(--surface); }
.chips a .n { font-variant-numeric: tabular-nums; opacity: 0.7; }

/* Tables */
.table-wrap { overflow-x: auto; }
table.a-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.a-table th { text-align: left; font-size: 12px; font-weight: 600; color: var(--muted); padding: 10px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.a-table td { padding: 11px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.a-table tr:last-child td { border-bottom: 0; }
.a-table tbody tr { position: relative; }
.a-table tbody tr:hover td { background: var(--bg); }
.a-table .row-link { text-decoration: none; font-weight: 600; }
.a-table .row-link::after { content: ''; position: absolute; inset: 0; }
.a-table td.num, .a-table th.num { text-align: right; }
.a-table td.num { font-size: 17px; }
.a-table .sub { display: block; font-size: 13px; color: var(--muted); font-weight: 400; }
.a-table .bib { font-family: var(--font-num); font-weight: 600; font-size: 17px; font-variant-numeric: tabular-nums; }

/* Key / value */
.kv { display: grid; grid-template-columns: minmax(110px, auto) 1fr; gap: 8px 16px; font-size: 14px; }
.kv dt { color: var(--muted); }
.kv dd { word-break: break-word; }

/* Checklist */
.todo { list-style: none; display: grid; gap: 2px; }
.todo li { display: grid; grid-template-columns: 24px 1fr auto; gap: 10px; align-items: start; padding: 10px 4px; border-bottom: 1px solid var(--border); }
.todo li:last-child { border-bottom: 0; }
.todo .tick { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border-strong); display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }
.todo li.done .tick { background: var(--good); border-color: var(--good); color: var(--surface); }
.todo li.done .tick svg { width: 13px; height: 13px; }
.todo b { font-weight: 600; display: block; }
.todo li.done b { color: var(--ink-2); font-weight: 500; }
.todo span { font-size: 13px; color: var(--muted); }

/* Lists of items (activity feed, races) */
.list { list-style: none; }
.list li { border-bottom: 1px solid var(--border); }
.list li:last-child { border-bottom: 0; }
.list a { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 4px; text-decoration: none; }
.list a:hover { background: var(--bg); }
.list .main { min-width: 0; }
.list .main b { display: block; font-weight: 600; }
.list .main span { font-size: 13px; color: var(--muted); }
.race-tile { display: grid; grid-template-columns: 6px 1fr auto; gap: 14px; align-items: center; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); text-decoration: none; }
.race-tile + .race-tile { margin-top: 10px; }
.race-tile:hover { border-color: var(--border-strong); }
.race-tile i { align-self: stretch; border-radius: 3px; background: var(--race-primary); }
.race-tile b { display: block; font-family: var(--font-display); font-weight: 500; font-size: 19px; }
.race-tile span { font-size: 13px; color: var(--ink-2); }

/* Names from the first admin, still used by the studio screens */
.btn-ghost { background: var(--surface); }
.ok { padding: 12px 14px; border-radius: var(--radius); margin-bottom: 16px; background: var(--good-bg); border: 1px solid var(--good-border); color: var(--good); }
.error { padding: 12px 14px; border-radius: var(--radius); margin-bottom: 16px; background: var(--bad-bg); border: 1px solid var(--bad-border); color: var(--bad); }
.empty { color: var(--ink-2); padding: 24px 0; }
.pill { display: inline-block; padding: 1px 8px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: 12px; }

/* race */
/* A card reached by #anchor after a save lands below the sticky top bar. */
.card[id] { scroll-margin-top: 72px; }
.card > .flash { margin-bottom: 14px; }
.sep { border: 0; border-top: 1px solid var(--border); margin: 18px 0; }
.lede { color: var(--ink-2); font-size: 14px; margin-bottom: 14px; max-width: 62ch; }

/* Choices: radio buttons and checkboxes as cards, each with one plain sentence. */
.choices { border: 0; display: grid; gap: 8px; margin-bottom: 16px; min-width: 0; }
.choices > legend { font-size: 14px; font-weight: 600; margin-bottom: 6px; padding: 0; }
.choices > legend .hint { font-size: 13px; color: var(--muted); font-weight: 400; }
@media (min-width: 560px) { .choices.two { grid-template-columns: 1fr 1fr; } }
.choice { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); cursor: pointer; }
.choice:hover { border-color: var(--ink-2); }
.choice:has(input:checked) { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); background: var(--bg); }
.choice:has(input:focus-visible) { outline: 3px solid var(--accent); outline-offset: 2px; }
.choice input { width: 18px; height: 18px; margin-top: 2px; flex: none; accent-color: var(--ink); }
.choice b { display: block; font-weight: 600; font-size: 15px; }
.choice small { display: block; color: var(--ink-2); font-size: 13px; margin-top: 2px; }
.choices > .err { font-size: 13px; color: var(--bad); }

/* Color picker with its code, and the race colors previewed on a sample. */
.color-input { display: flex; align-items: center; gap: 10px; }
.color-input input[type=color] { width: 56px; height: 42px; padding: 3px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; flex: none; }
.color-input code { font-family: var(--font-mono); font-size: 14px; color: var(--ink-2); text-transform: uppercase; }
.theme-preview { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); margin-bottom: 12px; }
.theme-preview .chip { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); min-width: 0; }
.theme-preview .chip i { width: 10px; height: 10px; border-radius: 50%; background: var(--race-primary); flex: none; }
.theme-preview .btn { pointer-events: none; }

/* A picture slot: what is there now, or an empty frame. */
.img-frame { display: flex; align-items: center; justify-content: center; height: 140px; padding: 10px; border: 1px dashed var(--border-strong); border-radius: var(--radius); background: var(--bg); color: var(--muted); font-size: 13px; overflow: hidden; margin-bottom: 12px; }
.img-frame.filled { border-style: solid; border-color: var(--border); }
.img-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
.img-frame.wide { padding: 0; }
.img-frame.wide img { width: 100%; height: 100%; object-fit: cover; }
.form-grid > * { min-width: 0; }
/* An error under one field of a row must not stretch its neighbour's input. */
.form-grid > .field { align-content: start; }
.img-slot { margin-bottom: 20px; }
.img-slot .field { margin-bottom: 0; }
.file-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.file-btn { position: relative; }
.file-btn:has(input:focus-visible) { outline: 3px solid var(--accent); outline-offset: 2px; }

/* An input with fixed text before it: run.sivoov.app/ + the page address. */
.affix { display: flex; align-items: stretch; min-width: 0; }
.affix > span { display: flex; align-items: center; padding: 0 10px 0 12px; border: 1px solid var(--border-strong); border-right: 0; border-radius: var(--radius) 0 0 var(--radius); background: var(--surface-2); color: var(--ink-2); font-size: 15px; white-space: nowrap; }
.field .affix > input { border-radius: 0 var(--radius) var(--radius) 0; }
@media (max-width: 559px) { .affix > span { padding: 0 6px 0 10px; font-size: 14px; } }

/* Rows: people and requests, each with a short line under the name and room for actions. */
.rows { list-style: none; }
.rows > li { padding: 14px 0; border-bottom: 1px solid var(--border); }
.rows > li:first-child { padding-top: 4px; }
.rows > li:last-child { border-bottom: 0; padding-bottom: 4px; }
.row-top { display: flex; gap: 12px; align-items: flex-start; }
.row-top > .avatar { width: 36px; height: 36px; font-size: 13px; }
.row-main { flex: 1; min-width: 0; }
.row-main b { display: block; font-weight: 600; overflow-wrap: anywhere; }
.row-main span { display: block; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
.row-aside { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; flex: none; }
.row-body { margin: 10px 0 0 48px; }
.row-body p { font-size: 14px; color: var(--ink-2); white-space: pre-line; overflow-wrap: anywhere; }
.row-body .form-actions { margin-top: 10px; }
.rows > li.dim .row-main b { color: var(--ink-2); font-weight: 500; }
@media (max-width: 559px) {
  .row-top { flex-wrap: wrap; }
  .row-main { flex-basis: calc(100% - 48px); }
  .row-aside { flex-basis: 100%; justify-content: flex-start; }
  .row-top > .avatar ~ .row-aside { padding-left: 48px; }
  .row-body { margin-left: 0; }
}

/* A disclosure that opens a small form in place ("Modifier"). */
.disclose > summary { list-style: none; }
.disclose > summary.btn-quiet.btn-sm { margin-left: -12px; }
.disclose > summary::-webkit-details-marker { display: none; }
.disclose[open] > summary { background: var(--surface-2); }
.disclose-body { margin-top: 10px; padding: 14px; border-radius: var(--radius); background: var(--bg); border: 1px solid var(--border); }
.disclose-body .choices { margin-bottom: 12px; }
.inline { display: inline; }
`;
