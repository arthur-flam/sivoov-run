/**
 * The studio's own stylesheet, injected by the page (the shared one in ../styles.ts stays the
 * public layer). Mobile first: the map is the hero on top, the event list below; from 960px
 * the list moves into a second column beside a taller map.
 */
export const studioStyles = `
.hide { display: none !important; }
.studio-head { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.studio-head h3 { font-family: var(--font-display); font-weight: 500; font-size: 24px; letter-spacing: -0.01em; }
.studio-head .meta { font-size: 14px; color: var(--ink-2); }
.studio-head .meta b { font-family: var(--font-num); font-size: 17px; font-variant-numeric: tabular-nums; }

.studio { display: grid; gap: 18px; }
@media (min-width: 960px) { .studio { grid-template-columns: 1.15fr 1fr; align-items: start; } .studio-col { position: sticky; top: 12px; } }

.map-card { border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--card); }
#studio-map { height: 300px; width: 100%; background: #eceae6; }
@media (min-width: 960px) { #studio-map { height: 460px; } }
.map-fallback { padding: 14px; }
.map-fallback .note { font-size: 13px; color: var(--muted); margin-top: 8px; }
.map-fallback svg { width: 100%; height: auto; }
.leaflet-container { font: inherit; }
.ev-pin { display: block; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 2px solid var(--card); background: var(--accent-name); box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.ev-pin.faint { width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; opacity: .45; border-width: 1px; }
.ev-pin.on { background: var(--ink); transform: scale(1.35); }
.ev-pin.ceremony { background: #b8443b; } .ev-pin.course { background: #0f3d6e; }
.ev-pin.coaching { background: #1f6b34; } .ev-pin.personal { background: #8a5cf5; } .ev-pin.safety { background: #d98324; }

.timeline { border: 1px solid var(--border); border-radius: 14px; background: var(--card); padding: 10px 12px; }
.timeline svg { width: 100%; height: 62px; display: block; overflow: visible; }
.timeline .tl-dot { cursor: pointer; }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 14px 0; }
.toolbar .btn { min-height: 42px; padding: 0 16px; font-size: 15px; }
.toolbar label { font-size: 13px; color: var(--ink-2); display: inline-flex; gap: 6px; align-items: center; }
.toolbar input[type=text] { font: inherit; font-family: var(--font-num); font-size: 18px; width: 74px; text-align: center; padding: 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--ink); }
.state { font-size: 13px; color: var(--muted); min-height: 1.4em; }
.state.busy { color: var(--accent-name); }

.ev-list { display: grid; gap: 10px; }
.ev { border: 1px solid var(--border); border-radius: 14px; background: var(--card); padding: 12px 14px; }
.ev.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-bg); }
.ev-top { display: grid; grid-template-columns: 64px 1fr auto; gap: 10px; align-items: baseline; cursor: pointer; }
.ev-when { font-family: var(--font-num); font-size: 18px; font-weight: 600; color: var(--race-primary); font-variant-numeric: tabular-nums; }
.ev-name { font-size: 16px; font-weight: 600; }
.ev-sub { font-size: 13px; color: var(--ink-2); grid-column: 2 / span 2; }
.ev-flag { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.ev-flag.miss { color: var(--accent-name); }
.ev-body { display: none; margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px; }
.ev.open .ev-body { display: block; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.ev-body .f { display: grid; gap: 4px; margin-bottom: 10px; }
.ev-body .f > span { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.ev-body input, .ev-body select, .ev-body textarea { font: inherit; font-size: 15px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--ink); width: 100%; }
.ev-body textarea { min-height: 96px; line-height: 1.5; }
.ev-body .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ev-body .row .btn { min-height: 40px; padding: 0 14px; font-size: 14px; }
.ev-body .check { display: inline-flex; gap: 8px; align-items: center; font-size: 14px; }
.ev-body .check input { width: auto; }
.publish { border: 1px solid var(--border); border-radius: 14px; background: var(--card); padding: 14px; margin-top: 16px; }
.publish h4 { font-size: 15px; margin-bottom: 6px; }
.publish p { font-size: 14px; color: var(--ink-2); margin-bottom: 10px; }
.pill { display: inline-block; font-size: 12px; border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; color: var(--ink-2); }

.course-cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.course-card { border: 1px solid var(--border); border-radius: 16px; background: var(--card); padding: 16px; display: grid; gap: 10px; align-content: start; }
.course-card h3 { font-family: var(--font-display); font-weight: 500; font-size: 22px; }
.course-card dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 14px; }
.course-card dt { color: var(--muted); }
.course-card dd { font-variant-numeric: tabular-nums; }
.course-card .miss { color: var(--accent-name); }
.course-card form { display: grid; gap: 8px; }
.course-card .btn { min-height: 44px; font-size: 15px; }
`;
