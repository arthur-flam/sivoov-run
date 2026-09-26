/**
 * Mapbox GL JS for the admin's two maps (the audio studio and a run's trace), loaded from
 * Mapbox's CDN like a font: a stylesheet and a deferred script, only on a page that draws a
 * map. Pinned, so an upgrade is a deliberate edit here; the pages' scripts read `window.mapboxgl`.
 */
const VERSION = '3.31.0';
export const MAPBOX_GL_CSS = `https://api.mapbox.com/mapbox-gl-js/v${VERSION}/mapbox-gl.css`;
export const MAPBOX_GL_JS = `https://api.mapbox.com/mapbox-gl-js/v${VERSION}/mapbox-gl.js`;
