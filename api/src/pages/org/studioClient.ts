// The studio's client script rides along as a text module (`rules` in wrangler.jsonc) and is
// inlined in the page, so there is no second request and no cache to bust. The source is
// ./studio.client.js — real JavaScript, linted with browser globals (api/eslint.config.js).
import source from './studio.client.js';

export const studioClient: string = source;
