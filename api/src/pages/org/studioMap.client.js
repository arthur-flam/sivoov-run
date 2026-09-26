/*
 * The studio's map, behind a small interface so the rest of the studio never touches the map
 * library: `window.SivoovStudioMap.create(options)` returns a controller, or null when there
 * is no map to draw (no library, no token, no trace), in which case the page keeps the
 * server-drawn SVG diagram. Every position comes from the Worker.
 *
 *   create({ host, points, ticks, landmarks, token, canEdit, onPick(id), onProject(lat, lng) })
 *     onProject resolves to { when, meters } or null: a click on the course proposes an
 *     announcement there (the popup's button carries data-role="place" data-meters).
 *   controller.paint(firings, { selected, categoryOf(id), titleOf(id) })
 *   controller.focus(id)       pans to where that announcement first plays
 *   controller.closePopup()
 */
(function () {
  function cssVar(name, fallback) {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function create(options) {
    const L = window.L;
    const points = options.points || [];
    if (!options.host || !L || !options.token || points.length < 2) return null;
    const ink = cssVar('--ink', 'black');
    const map = L.map(options.host, { scrollWheelZoom: false });
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=' + options.token, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 18,
      attribution: '© Mapbox © OpenStreetMap',
    }).addTo(map);
    const latlngs = points.map((p) => [p.lat, p.lng]);
    // Non-interactive: a click on the course must reach the map handler below.
    const line = L.polyline(latlngs, { color: ink, weight: 4, opacity: 0.85, interactive: false }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [18, 18] });
    const good = cssVar('--good', ink);
    const finish = cssVar('--accent-ink', ink);
    L.circleMarker(latlngs[0], { radius: 7, color: good, fillColor: good, fillOpacity: 1 }).addTo(map).bindTooltip('Départ');
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: finish, fillColor: finish, fillOpacity: 1 }).addTo(map).bindTooltip('Arrivée');
    const tick = cssVar('--ink-2', ink);
    (options.ticks || []).forEach((t) => {
      L.circleMarker([t.lat, t.lng], { radius: 2, color: tick, opacity: 0.6, fillOpacity: 0.6, interactive: false }).addTo(map);
    });
    const place = cssVar('--info', ink);
    const paper = cssVar('--surface', 'white');
    (options.landmarks || []).forEach((mark) => {
      if (mark.lat === null) return;
      L.circleMarker([mark.lat, mark.lng], { radius: 5, color: place, weight: 2, fillColor: paper, fillOpacity: 1 }).addTo(map).bindTooltip(document.createTextNode(mark.name));
    });
    if (options.canEdit && options.onProject) {
      // A click near the line proposes an announcement at that distance along the course.
      map.on('click', (event) => {
        options.onProject(event.latlng.lat, event.latlng.lng).then((found) => {
          if (!found) return;
          L.popup()
            .setLatLng(event.latlng)
            .setContent(
              '<div style="text-align:center">' +
                found.when +
                '<br><button type="button" class="btn btn-sm" data-role="place" data-meters="' +
                found.meters +
                '" style="margin-top:8px">Ajouter une annonce ici</button></div>',
            )
            .openOn(map);
        });
      });
    }

    let markers = [];
    let firings = [];

    function paint(next, view) {
      firings = next || [];
      markers.forEach((m) => map.removeLayer(m));
      markers = firings
        .filter((f) => f.lat !== null && f.lng !== null)
        .map((f) => {
          const classes = 'ev-pin cat-' + view.categoryOf(f.eventId) + (f.recurring ? ' faint' : '') + (view.selected === f.eventId ? ' on' : '');
          const marker = L.marker([f.lat, f.lng], {
            icon: L.divIcon({ className: '', html: '<i class="' + classes + '"></i>', iconSize: [16, 16] }),
            title: view.titleOf(f.eventId) + ' · ' + f.label,
            zIndexOffset: f.recurring ? 0 : 200,
            // Repeated occurrences are decoration: they must not eat a click meant for the course.
            interactive: !f.recurring,
          }).addTo(map);
          if (!f.recurring && options.onPick) marker.on('click', () => options.onPick(f.eventId));
          return marker;
        });
    }

    function focus(id) {
      const firing = firings.find((f) => f.eventId === id && f.lat !== null);
      if (firing) map.panTo([firing.lat, firing.lng]);
    }

    return { paint: paint, focus: focus, closePopup: () => map.closePopup() };
  }

  window.SivoovStudioMap = { create: create };
})();
