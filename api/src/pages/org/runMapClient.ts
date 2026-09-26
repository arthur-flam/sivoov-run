// The run map's browser script rides along as a text module (`rules` in wrangler.jsonc) and is
// inlined in the page, like the studio's. The source is ./runMap.client.js, real JavaScript,
// linted with browser globals (api/eslint.config.js).
import source from './runMap.client.js';

export const runMapClient: string = source;
