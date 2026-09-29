/** The share cards' one stylesheet: every format, sized to the pixel (the page is photographed). Colours are the race layer and the tokens. */
export const cardStyles = (width: number, height: number) => `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
body { background: var(--race-primary); color: var(--race-on-primary); font-family: var(--font-body); -webkit-font-smoothing: antialiased; }
body.sticker { background: transparent; }
/* The card pages have no doctype (quirks mode): tables take no colour or font from above, so they get their own. */
table { border-collapse: collapse; width: 100%; color: var(--ink); font-family: var(--font-body); }

.report, .invite { width: 100%; height: 100%; padding: 28px 32px; display: flex; flex-direction: column; gap: 14px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.kicker { font-family: var(--font-num); font-weight: 700; font-size: 46px; line-height: 0.95; text-transform: uppercase; letter-spacing: 0.01em; }
.sub { font-size: 17px; margin-top: 6px; opacity: 0.85; }
.race-logo { max-height: 76px; max-width: 280px; object-fit: contain; }
.race-name { font-family: var(--font-num); font-weight: 700; font-size: 26px; line-height: 1; text-transform: uppercase; text-align: right; max-width: 360px; }

.stats { display: flex; gap: 10px; }
.stat { flex: 1 1 0; min-width: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--surface); color: var(--ink); text-align: center; }
.stat.wide { flex: 1.6 1 0; }
.stat .k { background: color-mix(in srgb, var(--race-primary) 80%, var(--surface)); color: var(--race-on-primary); font-size: 15px; font-weight: 600; padding: 5px 8px; }
.stat .v { font-family: var(--font-num); font-weight: 700; font-size: 25px; padding: 5px 8px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }

.panel { background: var(--surface); color: var(--ink); border-radius: var(--radius-sm); overflow: hidden; position: relative; }
.body { display: flex; gap: 12px; flex: 1; min-height: 0; }
.map { position: relative; overflow: hidden; background: var(--surface-2); }
.map .ground, .map svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.mark-num { font-family: var(--font-num); font-weight: 700; }
.address { position: absolute; right: 12px; bottom: 8px; font-family: var(--font-num); font-weight: 700; font-size: 17px; color: var(--race-primary); text-transform: uppercase; letter-spacing: 0.04em; }

.highlights { position: absolute; left: 12px; top: 12px; background: var(--surface); border: 2px solid var(--race-primary); border-radius: var(--radius-sm); padding: 8px 12px; max-width: 300px; }
.highlights th { text-align: left; font-weight: 600; font-size: 15px; padding: 2px 16px 2px 0; color: var(--ink-2); }
.highlights td { font-family: var(--font-num); font-weight: 700; font-size: 20px; text-align: right; font-variant-numeric: tabular-nums; }
.highlights .note { font-size: 14px; font-weight: 600; color: var(--race-primary); margin-top: 4px; line-height: 1.25; }

.splits th { font-size: 16px; font-weight: 700; padding: 10px 6px; text-align: center; border-bottom: 1px solid var(--border); }
.splits td { font-family: var(--font-num); font-weight: 600; font-size: 22px; text-align: center; padding: 4px 6px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.splits tr:last-child td { border-bottom: 0; }
.dot { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; font-family: var(--font-num); font-weight: 700; font-size: 17px; }
.dot.long { font-size: 11px; }
.dot.mid { font-size: 14px; }

/* 1200 x 630: the stats across, the map on the left, the splits on the right. */
.og .table-panel { width: 380px; display: flex; align-items: center; }
.og .splits td { font-size: 21px; padding: 2px 6px; }
.og .map-panel { width: 756px; }

/* Portraits: the name and time as the hero, then the map and the splits. */
.post .report, .story .report { padding: 40px 32px; gap: 18px; }
.hero { padding: 6px 0 2px; }
.hero .name { font-family: var(--font-display); font-weight: 500; font-size: 64px; line-height: 1.05; }
.hero .name.small { font-size: 48px; }
.hero .time { font-family: var(--font-num); font-weight: 700; font-size: 180px; line-height: 0.9; font-variant-numeric: tabular-nums; }
.story .hero .time { font-size: 230px; }
.post .stat .v, .story .stat .v { font-size: 34px; }
.post .stat .k, .story .stat .k { font-size: 18px; }
.post .kicker, .story .kicker { font-size: 56px; }
.post .sub, .story .sub { font-size: 22px; }
.post .map-panel, .story .map-panel { width: 1016px; }
.post .map-panel .map { margin: 8px; }
.story .map-panel .map { margin: 8px; }
.post .highlights, .story .highlights { max-width: 380px; padding: 12px 16px; }
.post .highlights td, .story .highlights td { font-size: 28px; }
.post .highlights th, .story .highlights th { font-size: 20px; }
.post .highlights .note, .story .highlights .note { font-size: 19px; }
.strip th { text-align: left; font-size: 18px; padding: 6px 10px; color: var(--ink-2); white-space: nowrap; }
.strip td { text-align: center; font-family: var(--font-num); font-weight: 600; font-size: 24px; padding: 6px 2px; border-left: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.strip tr + tr td, .strip tr + tr th { border-top: 1px solid var(--border); }
.post .table-panel { padding: 6px 4px; }
.story .splits td { font-size: 34px; padding: 6px; }
.story .splits th { font-size: 22px; }
.story .dot { width: 46px; height: 46px; font-size: 24px; }
.story .dot.long { font-size: 15px; }
.story .dot.mid { font-size: 19px; }
.cta { margin-top: auto; display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-family: var(--font-num); font-weight: 700; text-transform: uppercase; }
.cta span:first-child { font-size: 40px; }
.cta .url { font-size: 28px; opacity: 0.9; }

/* The sticker: white on nothing, a soft shadow so it reads over any photo. */
.sticker-card { width: 100%; height: 100%; padding: 120px 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; color: #ffffff; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45); text-align: center; }
.sticker-card .map { background: transparent; filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.45)); }
.s-race { font-family: var(--font-num); font-weight: 700; font-size: 52px; text-transform: uppercase; line-height: 1; max-width: 900px; }
.s-time { font-family: var(--font-num); font-weight: 700; font-size: 250px; line-height: 0.9; font-variant-numeric: tabular-nums; }
.s-facts { display: flex; gap: 36px; font-family: var(--font-num); font-weight: 700; font-size: 56px; }
.s-foot { font-size: 30px; font-weight: 600; margin-top: 12px; }
.s-url { font-family: var(--font-num); font-weight: 700; font-size: 34px; text-transform: uppercase; letter-spacing: 0.03em; }

/* The bib and the race cards. */
.invite-body { display: flex; gap: 20px; flex: 1; min-height: 0; }
.invite.og .map-panel { width: 560px; flex: none; }
.invite:not(.og) .invite-body { flex-direction: column; }
.invite:not(.og) .map-panel { width: 1016px; }
.invite:not(.og) .map-panel .map { margin: 8px; }
.invite-words { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 22px; min-width: 0; }
.plate { background: var(--surface); color: var(--ink); border-radius: var(--radius-sm); padding: 18px 24px 22px; text-align: center; border-top: 18px solid color-mix(in srgb, var(--race-primary) 80%, var(--surface)); }
.plate-race { font-family: var(--font-num); font-weight: 700; font-size: 20px; text-transform: uppercase; color: var(--race-primary); }
.plate-num { font-family: var(--font-num); font-weight: 700; font-size: 150px; line-height: 0.95; font-variant-numeric: tabular-nums; }
.plate-name { font-size: 26px; font-weight: 600; }
.headline { font-family: var(--font-display); font-weight: 500; font-size: 54px; line-height: 1.05; }
.invite-line { font-size: 22px; line-height: 1.35; opacity: 0.92; }
.invite .url { font-family: var(--font-num); font-weight: 700; font-size: 26px; text-transform: uppercase; letter-spacing: 0.03em; }
.invite:not(.og) .plate-num { font-size: 220px; }
.invite:not(.og) .headline { font-size: 80px; }
.invite:not(.og) .invite-line { font-size: 30px; }
.invite:not(.og) .kicker { font-size: 56px; }
.invite:not(.og) .sub { font-size: 24px; }
.invite:not(.og) { padding: 40px 32px; }
`;
