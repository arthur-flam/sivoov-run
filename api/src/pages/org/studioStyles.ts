/**
 * The studio's own stylesheet, injected by the studio page on top of adminStyles. Tokens only
 * (../tokens.ts): announcement types are `--cat-*`, everything else is the admin's palette.
 * Mobile first: the map on top, the list below, the editor opening inline. From 900px the
 * header with the publish button sticks under the top bar; from 1100px the map sits in a
 * sticky column beside the list (`--st-head-h` is measured by the client script).
 */
export const studioStyles = `
[hidden] { display: none !important; }
.cat-ceremony { --cat: var(--cat-ceremony); } .cat-course { --cat: var(--cat-course); } .cat-coaching { --cat: var(--cat-coaching); }
.cat-personal { --cat: var(--cat-personal); } .cat-safety { --cat: var(--cat-safety); }

/* Header: title, the summary line, the save state and the publish button */
.st-head .ph { margin-bottom: 18px; }
.st-head .ph p { display: grid; gap: 2px; }
.st-state { font-size: 13px; color: var(--muted); min-height: 1.3em; }
.st-state.busy { color: var(--info); }
.st-state.bad { color: var(--bad); }
.st-publish { display: grid; gap: 6px; justify-items: start; max-width: 340px; }
.st-note { font-size: 13px; color: var(--ink-2); }
@media (min-width: 900px) {
  .st-head { position: sticky; top: 53px; z-index: 10; background: var(--bg); margin: -28px -36px 20px; padding: 20px 36px 0; border-bottom: 1px solid var(--border); }
  .st-publish { justify-items: end; text-align: right; }
}

/* Layout */
.studio { display: grid; gap: 20px; }
.studio > * { min-width: 0; }
@media (min-width: 1100px) {
  .studio { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); align-items: start; gap: 24px; }
  .studio-map { position: sticky; top: calc(53px + var(--st-head-h, 150px) + 16px); }
}

/* The map, or the SVG diagram when there are no tiles */
.map-card { border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); isolation: isolate; }
#studio-map { height: 280px; width: 100%; background: var(--surface-2); }
@media (min-width: 1100px) { #studio-map { height: 400px; } }
.leaflet-container { font: inherit; }
.map-fallback { padding: 12px; }
.map-fallback svg { width: 100%; height: auto; max-height: 380px; }
.map-fallback .empty { padding: 20px 8px; }
.map-fallback .note, .map-help { font-size: 13px; color: var(--muted); margin-top: 8px; }
.ev-dot { cursor: pointer; }
.ev-pin { display: block; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 2px solid var(--surface); background: var(--cat, var(--accent-ink)); box-shadow: var(--shadow); }
.ev-pin.faint { width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; opacity: 0.45; border-width: 1px; }
.ev-pin.on { outline: 3px solid var(--ink); outline-offset: 1px; }

/* The frise: every announcement along the distance */
.timeline { margin-top: 10px; padding: 12px 14px 6px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
.tl-track { position: relative; height: 22px; margin: 0 6px; }
.tl-track::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; background: var(--border-strong); border-radius: 1px; }
.tl-dot { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--cat, var(--accent-ink)); border: 2px solid var(--surface); cursor: pointer; padding: 0; }
.tl-dot.faint { width: 6px; height: 6px; margin: -3px 0 0 -3px; border: 0; opacity: 0.5; cursor: default; }
.tl-dot.on { outline: 3px solid var(--ink); outline-offset: 1px; z-index: 1; }
.tl-scale { position: relative; height: 18px; margin: 4px 6px 0; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.tl-scale span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.tl-scale span:last-child { transform: translateX(-100%); }
.pace-row { display: block; font-size: 13px; color: var(--muted); margin-top: 10px; line-height: 2; }
.pace-row input { font: inherit; font-family: var(--font-num); font-size: 16px; width: 62px; text-align: center; padding: 2px 6px; margin: 0 4px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); }

/* The voice of the course, and how the runner hears it */
.st-voice { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 10px 12px; margin-bottom: 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); font-size: 14px; }
.voice-panel { margin-bottom: 14px; padding: 16px; border: 1px solid var(--border-strong); border-radius: var(--radius-lg); background: var(--surface); font-size: 14px; }
.voice-panel h3 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.voice-panel h4 { font-size: 14px; font-weight: 600; margin: 14px 0 6px; }
.voice-panel .hint { display: block; color: var(--muted); font-size: 13px; margin: 6px 0; }
.vp-list { display: grid; gap: 4px; }
.vp-row { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
.vp-voice { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.vp-voice label, .vp-opt { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 6px 8px; border-radius: var(--radius-sm); cursor: pointer; flex: 1; }
.vp-voice label:hover, .vp-opt:hover { background: var(--bg); }
.vp-voice span, .vp-opt span { color: var(--muted); font-size: 13px; }
.vp-opt { border: 1px solid var(--border); }
.vp-custom { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 6px; }
.vp-custom label { flex-basis: 100%; font-weight: 600; font-size: 13px; }
.vp-custom input { flex: 1 1 220px; font: inherit; font-family: ui-monospace, monospace; font-size: 13px; padding: 6px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); }
.vp-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.st-help { margin-bottom: 12px; font-size: 14px; }
.st-help > summary { cursor: pointer; color: var(--info); font-weight: 600; padding: 4px 0; }
.st-help ul { margin: 8px 0 4px 18px; display: grid; gap: 6px; color: var(--ink-2); }

/* The start ceremony, second by second */
.cer { margin: 4px 0 12px; padding: 12px 14px; border: 1px solid var(--border); border-left: 4px solid var(--cat-ceremony); border-radius: var(--radius); background: var(--surface); font-size: 14px; }
.cer-h { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.cer-intro, .cer-note { color: var(--ink-2); font-size: 13px; margin: 4px 0 8px; }
.cer-note { margin-bottom: 0; }
.cer-steps { list-style: none; display: grid; gap: 0; margin: 0; padding: 0; counter-reset: cer; }
.cer-step { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 8px; padding: 6px 0 6px 26px; }
.cer-step::before { counter-increment: cer; content: counter(cer); position: absolute; left: 0; top: 7px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface-2); color: var(--ink-2); font-size: 11px; font-weight: 600; text-align: center; line-height: 18px; }
.cer-step + .cer-step { border-top: 1px dashed var(--border); }
.cer-step.at-countdown::before { background: var(--warn-bg); color: var(--warn); }
.cer-step.gun::before { content: '▶'; background: var(--cat-ceremony); color: var(--surface); }
.cer-name { text-align: left; background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--ink); cursor: pointer; }
.cer-name:hover { text-decoration: underline; }
.cer-meta { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cer-why { grid-column: 1 / -1; font-size: 13px; color: var(--ink-2); }
.cer-step.gun .cer-why { color: var(--accent-ink); font-weight: 600; }
.cer-screen { margin-top: 10px; padding: 14px; border-radius: var(--radius); background: var(--ink); color: var(--surface); font-family: var(--font-num); font-size: 30px; font-weight: 600; text-align: center; letter-spacing: 0.02em; }

/* The list, grouped by moment */
.st-tools { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.ev-group + .ev-group { margin-top: 24px; }
.ev-group-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin-bottom: 8px; }
.ev-group-h h2 { font-size: 17px; font-weight: 600; }
.ev-group-h span { font-size: 13px; color: var(--muted); }
.ev-none { font-size: 14px; color: var(--muted); padding: 4px 0 2px; }
.ev-add { margin-top: 6px; }

.ev { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.ev + .ev { margin-top: 8px; }
.ev.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-bg); }
.ev-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "open play" "flag play"; align-items: center; column-gap: 8px; padding: 4px 10px 10px 4px; }
.ev-open { grid-area: open; display: grid; gap: 0; text-align: left; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 6px 8px 4px; border-radius: var(--radius-sm); min-width: 0; }
.ev-open:hover { background: var(--bg); }
.ev-open:focus-visible, .ev-play:focus-visible, .tl-dot:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.ev-top .badge { grid-area: flag; justify-self: start; margin-left: 8px; }
.ev-play { grid-area: play; width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border-strong); background: var(--surface); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.ev-play:hover { background: var(--surface-2); }
.ev-play svg { width: 14px; height: 14px; }
.ev-when { font-family: var(--font-num); font-weight: 600; font-size: 15px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.ev-main { display: grid; min-width: 0; }
.ev-name { font-weight: 600; font-size: 15px; }
.ev-excerpt { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (min-width: 700px) {
  .ev-top { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "open flag play"; padding: 4px 10px 4px 4px; }
  .ev-top .badge { margin-left: 0; }
  .ev-open { grid-template-columns: 104px minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 8px; }
}

/* What the runner hears: the voice, personalised, or a file */
.ev-sound { border: 0; padding: 0; margin: 4px 0 12px; }
.ev-sound legend { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
.seg { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 3px; border-radius: var(--radius); background: var(--surface-2); }
.seg-opt { position: relative; }
.seg-opt input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.seg-opt span { display: block; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 14px; color: var(--ink-2); }
.seg-opt input:checked + span { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: var(--shadow); }
.seg-opt input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 1px; }
.seg-opt input:disabled + span { cursor: default; }
.seg-sm { margin-bottom: 10px; }
.seg-sm .seg-opt span { font-size: 13px; padding: 4px 10px; }
.ev-sound .hint { display: block; margin-top: 6px; font-size: 13px; color: var(--muted); }
.inserts { display: grid; gap: 6px; margin: -4px 0 12px; }
.ins-group { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
.ins-h { font-size: 12px; color: var(--muted); margin-right: 2px; }
.ins { font: inherit; font-size: 12px; padding: 2px 8px; border-radius: var(--radius-pill); border: 1px solid var(--border-strong); background: var(--surface); color: var(--ink-2); cursor: pointer; font-family: ui-monospace, monospace; }
.inserts[data-role="tags"] .ins { font-family: inherit; }
.ins:hover { background: var(--surface-2); color: var(--ink); }
.ins:disabled { opacity: 0.5; cursor: default; }
.ev-phase { font-size: 13px; color: var(--cat-personal); margin: 0 0 10px; }
.ev-sample, .ev-suggest { display: grid; gap: 4px; padding: 10px 12px; margin-bottom: 10px; border-radius: var(--radius); background: var(--bg); border: 1px solid var(--border); font-size: 14px; }
.ev-sample-h { font-size: 12px; color: var(--muted); }
.ev-sample q { font-style: italic; }
.ev-issues { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 4px; }
.ev-issues li { font-size: 13px; color: var(--bad); padding-left: 14px; position: relative; }
.ev-issues li::before { content: '!'; position: absolute; left: 2px; font-weight: 700; }
.ev-issues:empty { display: none; }

/* The editor */
.ev-body { display: none; padding: 16px 14px 4px; border-top: 1px solid var(--border); }
.ev.open .ev-body { display: block; }
.ev-body .field { margin-bottom: 12px; }
.ev-err { font-size: 13px; color: var(--bad); margin: -4px 0 12px; }
.ev-measure { font-size: 13px; color: var(--muted); margin: -6px 0 14px; }
.ev-file { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; padding: 10px 12px; margin-bottom: 12px; border-radius: var(--radius); background: var(--info-bg); border: 1px solid var(--info-border); color: var(--info); font-size: 14px; }
.ev-file p { flex: 1 1 220px; }
.ev-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.ev-actions label.btn { position: relative; }
.ev-delete { color: var(--bad); }
.ev-adv { margin-bottom: 10px; }
.ev-adv .field .hint { display: block; margin-top: 2px; }
.ev-body input:disabled, .ev-body select:disabled, .ev-body textarea:disabled { background: var(--bg); color: var(--ink-2); border-color: var(--border); cursor: default; opacity: 1; }
`;
