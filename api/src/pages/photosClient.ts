// The photos page's script rides along as a text module, like the result page's.
import shareFile from './shareFile.client.js';
import source from './photos.client.js';

/** The shared share-sheet helper first, then the page's own script. */
export const photosClient: string = `${shareFile}\n${source}`;
