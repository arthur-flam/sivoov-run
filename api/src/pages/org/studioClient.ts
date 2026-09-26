// The studio's client scripts ride along as text modules (`rules` in wrangler.jsonc) and are
// inlined in the page, so there is no second request and no cache to bust. The sources are
// ./studioMap.client.js (the map, behind `window.SivoovStudioMap`) and ./studio.client.js (the
// editor): real JavaScript, linted with browser globals (api/eslint.config.js).
import mapSource from './studioMap.client.js';
import source from './studio.client.js';

export const studioClient: string = `${mapSource}\n${source}`;
