/*
 * The run page's map: the runner's own GPS trace on Leaflet with Mapbox tiles, a dot per
 * kilometre, the start and the end. It reads the page's JSON island and paints; every position
 * was computed by the Worker. Colors come from the page's CSS variables (tokens.ts), so the
 * map follows the admin's theme. When Leaflet did not load (no network), it shows the
 * server-drawn SVG that is already in the page instead.
 */
(function () {
  const island = document.getElementById('run-map-data');
  if (!island) return;
  const data = JSON.parse(island.textContent || '{}');

  function css(name) {
    return window.getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  function showFallback(host) {
    const fallback = document.querySelector('[data-role="run-map-fallback"]');
    if (host) host.className = 'hide';
    if (fallback) fallback.className = 'map-svg';
  }

  function init() {
    const host = document.querySelector('[data-role="run-map"]');
    if (!host) return;
    if (!window.L || !data.token || !data.points || data.points.length < 2) {
      showFallback(host);
      return;
    }
    const L = window.L;
    const line = css('--race-primary');
    const surface = css('--surface');
    // Quarter zoom steps let the trace fill the box instead of the nearest whole zoom level.
    const map = L.map(host, { scrollWheelZoom: false, zoomSnap: 0.25 });
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=' + data.token, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 18,
      attribution: '© Mapbox © OpenStreetMap',
    }).addTo(map);
    const trace = L.polyline(data.points, { color: line, weight: 4, opacity: 0.9, interactive: false }).addTo(map);
    map.fitBounds(trace.getBounds(), { padding: [20, 20] });
    (data.kms || []).forEach(function (km) {
      L.circleMarker([km.lat, km.lng], { radius: 4, color: line, weight: 2, fillColor: surface, fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(document.createTextNode(km.label));
    });
    const first = data.points[0];
    const last = data.points[data.points.length - 1];
    // The end is a dot and the start a ring around it: a loop starts and ends in the same place.
    L.circleMarker(last, { radius: 6, color: surface, weight: 2, fillColor: css('--ink'), fillOpacity: 1 }).addTo(map).bindTooltip(document.createTextNode(data.endLabel || 'Arrivée'));
    L.circleMarker(first, { radius: 10, color: css('--good'), weight: 3.5, fill: false }).addTo(map).bindTooltip('Départ');
  }

  // Leaflet loads with `defer`: it has run by DOMContentLoaded, or failed to load at all.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
