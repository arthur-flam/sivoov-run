/**
 * Builds docs/shots/index.html: every screenshot on one page, grouped by preset, with its
 * pixel size. Open it to review a design change in one look. No dependencies.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../docs/shots/', import.meta.url));

/** PNG width and height live at a fixed offset in the IHDR chunk. No image library needed. */
const pngSize = (path) => {
  const buf = readFileSync(path);
  return buf.length > 24 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : { w: 0, h: 0 };
};

const dirs = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const sections = dirs.map((dir) => {
  const files = readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.png'))
    .sort();
  const cards = files
    .map((f) => {
      const { w, h } = pngSize(join(root, dir, f));
      return `<figure><a href="${dir}/${f}"><img src="${dir}/${f}" alt="${f}" loading="lazy"></a><figcaption>${f.replace('.png', '')}<span>${w}&times;${h}</span></figcaption></figure>`;
    })
    .join('\n');
  return `<section><h2>${dir}<span>${files.length} shots</span></h2><div class="grid">${cards}</div></section>`;
});

writeFileSync(
  join(root, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Sivoov Run — shots</title>
<style>
  :root { color-scheme: light dark; --bg:#faf9f7; --ink:#1a1a1a; --muted:#a1a1aa; --border:#e8e6e3; --card:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0c0c0c; --ink:#fff; --border:#2a2a2a; --card:#181818; } }
  body { margin:0; padding:32px; background:var(--bg); color:var(--ink); font:14px/1.5 -apple-system, system-ui, sans-serif; }
  h1 { font-size:22px; margin:0 0 4px; } p.lede { color:var(--muted); margin:0 0 32px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); border-bottom:1px solid var(--border); padding-bottom:8px; display:flex; justify-content:space-between; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:24px; margin:20px 0 44px; align-items:start; }
  figure { margin:0; }
  img { width:100%; border:1px solid var(--border); border-radius:10px; background:var(--card); display:block; }
  figcaption { display:flex; justify-content:space-between; gap:8px; padding-top:8px; font-size:12px; }
  figcaption span { color:var(--muted); font-variant-numeric:tabular-nums; }
</style>
<h1>Sivoov Run — screenshots</h1>
<p class="lede">Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by <code>npm run shots</code>.</p>
${sections.join('\n')}
`,
);

console.log(`contact sheet: ${dirs.length} presets, ${dirs.reduce((n, d) => n + readdirSync(join(root, d)).filter((f) => f.endsWith('.png')).length, 0)} shots`);
