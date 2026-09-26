/*
 * The run page's map: the runner's own GPS trace on Mapbox GL JS (`window.mapboxgl`, from
 * Mapbox's CDN), a dot per kilometre, the start and the end. It reads the page's JSON island
 * and paints; every position was computed by the Worker. Colors come from the page's CSS
 * variables (tokens.ts), so the map follows the admin's theme. When the library did not load
 * (no network) or the browser has no WebGL, it shows the server-drawn SVG that is already in
 * the page instead. Pointing at a row of the kilometre table (`tr[data-km]`) lights that
 * kilometre's dot and brings it into the middle of the map.
 */
(function () {
  const island = document.getElementById('run-map-data');
  if (!island) return;
  const data = JSON.parse(island.textContent || '{}');
  const LOCALE = {
    'Map.Title': 'Carte du tracé',
    'NavigationControl.ZoomIn': 'Zoomer',
    'NavigationControl.ZoomOut': 'Dézoomer',
    'AttributionControl.ToggleAttribution': 'Afficher les sources de la carte',
    'LogoControl.Title': 'Site de Mapbox',
  };

  function css(name) {
    return window.getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  function showFallback(host) {
    const fallback = document.querySelector('[data-role="run-map-fallback"]');
    if (host) host.className = 'hide';
    if (fallback) fallback.className = 'map-svg';
  }

  const point = (lngLat, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: lngLat }, properties: properties });
  const collection = (features) => ({ type: 'FeatureCollection', features: features });
  // The island carries [lat, lng] pairs; Mapbox wants [lng, lat].
  const flip = (p) => [p[1], p[0]];

  const boundsOf = (coords) =>
    coords.reduce(
      (b, c) => [
        [Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])],
        [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])],
      ],
      [
        [Infinity, Infinity],
        [-Infinity, -Infinity],
      ],
    );

  function draw(map, coords) {
    const line = css('--race-primary');
    const surface = css('--surface');
    map.addSource('trace', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } });
    // `promoteId` lets a kilometre be lit by its number (feature-state), without redrawing the source.
    map.addSource('kms', {
      type: 'geojson',
      promoteId: 'km',
      data: collection((data.kms || []).map((k) => point([k.lng, k.lat], { km: k.km, label: k.label }))),
    });
    map.addSource('ends', {
      type: 'geojson',
      data: collection([point(coords[coords.length - 1], { kind: 'end', label: data.endLabel || 'Arrivée' }), point(coords[0], { kind: 'start', label: 'Départ' })]),
    });
    map.addLayer({
      id: 'run-trace',
      type: 'line',
      source: 'trace',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': line, 'line-width': 4, 'line-opacity': 0.9 },
    });
    const lit = ['boolean', ['feature-state', 'lit'], false];
    map.addLayer({
      id: 'run-kms',
      type: 'circle',
      source: 'kms',
      paint: {
        'circle-radius': ['case', lit, 7, 4],
        'circle-color': ['case', lit, line, surface],
        'circle-stroke-color': ['case', lit, surface, line],
        'circle-stroke-width': 2,
      },
    });
    // The end is a dot and the start a ring around it: a loop starts and ends in the same place.
    map.addLayer({
      id: 'run-end',
      type: 'circle',
      source: 'ends',
      filter: ['==', ['get', 'kind'], 'end'],
      paint: { 'circle-radius': 6, 'circle-color': css('--ink'), 'circle-stroke-color': surface, 'circle-stroke-width': 2 },
    });
    map.addLayer({
      id: 'run-start',
      type: 'circle',
      source: 'ends',
      filter: ['==', ['get', 'kind'], 'start'],
      paint: { 'circle-radius': 10, 'circle-opacity': 0, 'circle-stroke-color': css('--good'), 'circle-stroke-width': 3.5 },
    });
  }

  /** The label of a kilometre, the start or the end, under the pointer. */
  function labelOnHover(gl, map) {
    const tip = new gl.Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, offset: 10, className: 'map-tip' });
    ['run-kms', 'run-end', 'run-start'].forEach((layer) => {
      map.on('mousemove', layer, (event) => {
        const mark = event.features && event.features[0];
        if (mark) tip.setLngLat(mark.geometry.coordinates).setText(mark.properties.label).addTo(map);
      });
      map.on('mouseleave', layer, () => tip.remove());
    });
  }

  /** The kilometre table drives the map: the row under the pointer lights its dot. */
  function followSplits(map) {
    const byKm = new Map((data.kms || []).map((k) => [String(k.km), [k.lng, k.lat]]));
    let lit = null;
    const light = (km) => {
      if (km === lit) return;
      if (lit !== null) map.setFeatureState({ source: 'kms', id: Number(lit) }, { lit: false });
      lit = km;
      if (km === null) return;
      map.setFeatureState({ source: 'kms', id: Number(km) }, { lit: true });
      map.easeTo({ center: byKm.get(km), duration: 400 });
    };
    document.addEventListener('mouseover', (event) => {
      const row = event.target.closest ? event.target.closest('tr[data-km]') : null;
      const km = row ? row.getAttribute('data-km') : null;
      light(km !== null && byKm.has(km) ? km : null);
    });
  }

  function init() {
    const host = document.querySelector('[data-role="run-map"]');
    if (!host) return;
    const gl = window.mapboxgl;
    const usable = gl && (typeof gl.supported !== 'function' || gl.supported());
    if (!usable || !data.token || !data.points || data.points.length < 2) return void showFallback(host);
    const coords = data.points.map(flip);
    let map = null;
    try {
      map = new gl.Map({
        container: host,
        accessToken: data.token,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        bounds: boundsOf(coords),
        fitBoundsOptions: { padding: 24 },
        locale: LOCALE,
        // North up and flat, zoomed with a pinch, the wheel or the trackpad.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
      });
    } catch {
      return void showFallback(host);
    }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      draw(map, coords);
      labelOnHover(gl, map);
      followSplits(map);
    });
  }

  // Mapbox GL loads with `defer`: it has run by DOMContentLoaded, or failed to load at all.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
