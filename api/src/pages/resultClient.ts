// The result page's script rides along as a text module, like the studio's (studioClient.ts).
import shareFile from './shareFile.client.js';
import source from './result.client.js';

/** The shared share-sheet helper first, then the page's own script. */
export const resultClient: string = `${shareFile}\n${source}`;
