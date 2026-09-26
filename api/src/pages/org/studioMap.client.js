/*
 * The studio's map, behind a small interface so the rest of the studio never touches the map
 * library: `window.SivoovStudioMap.create(options)` returns a controller, or null when there
 * is no map to draw (no library, no WebGL, no token, no trace), in which case the page keeps
 * the server-drawn SVG diagram. Every position comes from the Worker. The library is Mapbox
 * GL JS (`window.mapboxgl`), loaded from Mapbox's CDN by the page.
 *
 *   create({ host, points, ticks, landmarks, token, canEdit, onPick(id), onProject(lat, lng) })
 *     onProject resolves to { when, meters } or null: a click on the course proposes an
 *     announcement there (the popup's button carries data-role="place" data-meters).
 *   controller.paint(firings, { selected, categoryOf(id), titleOf(id) })
 *   controller.focus(id)       eases to where that announcement first plays, at the same zoom
 *   controller.closePopup()
 *
 * The map also follows the list by itself, with nothing for the editor to call: as the
 * organizer scrolls the announcement cards (`[data-role="list"] .ev[data-line]`), the card at
 * the reading line gets its marker ringed (`follow`) and the map eases to it. It never scrolls
 * the page, and it leaves the map alone for a moment after the organizer moves it by hand.
 */
(function () {
  const STYLE = 'mapbox://styles/mapbox/outdoors-v12';
  const LOCALE = {
    'Map.Title': 'Carte du parcours',
    'NavigationControl.ZoomIn': 'Zoomer',
    'NavigationControl.ZoomOut': 'Dézoomer',
    'AttributionControl.ToggleAttribution': 'Afficher les sources de la carte',
    'LogoControl.Title': 'Site de Mapbox',
  };
  const PADDING = 28;
  const EASE_MS = 450;
  /** Where the eye reads the list, as a share of the window's height: that card is the one shown. */
  const READING_LINE = 0.35;
  /** After the organizer drags or zooms the map, scrolling the list leaves it alone this long. */
  const HANDS_OFF_MS = 2000;
  /** A click on a marker scrolls its card into view: that scroll is not the organizer reading. */
  const QUIET_MS = 250;
  const QUIET_MAX_MS = 1500;

  const cssVar = (name, fallback) => window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  const lngLat = (p) => [p.lng, p.lat];
  const placed = (f) => f.lat !== null && f.lng !== null;
  const pinKey = (f) => f.eventId + '#' + f.occurrence + (f.recurring ? '~' : '');

  const boundsOf = (points) =>
    points.reduce(
      (b, p) => [
        [Math.min(b[0][0], p.lng), Math.min(b[0][1], p.lat)],
        [Math.max(b[1][0], p.lng), Math.max(b[1][1], p.lat)],
      ],
      [
        [Infinity, Infinity],
        [-Infinity, -Infinity],
      ],
    );

  const pointAt = (p, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: lngLat(p) }, properties: properties || {} });
  const collection = (features) => ({ type: 'FeatureCollection', features: features });

  /** The course, the kilometre ticks, the start, the finish and the landmarks: drawn in the map itself, under the announcement pins. */
  function drawCourse(map, options) {
    const points = options.points;
    const ink = cssVar('--ink', 'black');
    const paper = cssVar('--surface', 'white');
    const marks = (options.landmarks || [])
      .filter(placed)
      .map((m) => pointAt(m, { kind: 'place', name: m.name }))
      .concat([pointAt(points[0], { kind: 'start', name: 'Départ' }), pointAt(points[points.length - 1], { kind: 'finish', name: 'Arrivée' })]);
    map.addSource('course', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: points.map(lngLat) }, properties: {} } });
    map.addSource('ticks', { type: 'geojson', data: collection((options.ticks || []).map((t) => pointAt(t))) });
    map.addSource('marks', { type: 'geojson', data: collection(marks) });
    map.addLayer({
      id: 'course-line',
      type: 'line',
      source: 'course',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ink, 'line-width': 4, 'line-opacity': 0.85 },
    });
    // Invisible and wide: the pointer only has to come near the line to show it can be touched.
    map.addLayer({ id: 'course-hit', type: 'line', source: 'course', paint: { 'line-color': ink, 'line-width': 18, 'line-opacity': 0 } });
    map.addLayer({ id: 'course-ticks', type: 'circle', source: 'ticks', paint: { 'circle-radius': 2, 'circle-color': cssVar('--ink-2', ink), 'circle-opacity': 0.6 } });
    map.addLayer({
      id: 'course-marks',
      type: 'circle',
      source: 'marks',
      paint: {
        'circle-radius': ['match', ['get', 'kind'], 'place', 5, 7],
        'circle-color': ['match', ['get', 'kind'], 'start', cssVar('--good', ink), 'finish', cssVar('--accent-ink', ink), paper],
        'circle-stroke-color': ['match', ['get', 'kind'], 'place', cssVar('--info', ink), paper],
        'circle-stroke-width': 2,
      },
    });
  }

  /** The name of the start, the finish or a landmark, under the pointer. */
  function nameOnHover(gl, map) {
    const tip = new gl.Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, offset: 10, className: 'map-tip' });
    map.on('mousemove', 'course-marks', (event) => {
      const mark = event.features && event.features[0];
      if (mark) tip.setLngLat(mark.geometry.coordinates).setText(mark.properties.name).addTo(map);
    });
    map.on('mouseleave', 'course-marks', () => tip.remove());
  }

  /** The popup's content, built as nodes: `when` comes from the Worker but stays text. */
  function placeContent(found) {
    const box = document.createElement('div');
    box.className = 'map-place';
    const when = document.createElement('p');
    when.textContent = found.when;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm';
    button.setAttribute('data-role', 'place');
    button.setAttribute('data-meters', String(found.meters));
    button.textContent = 'Ajouter une annonce ici';
    box.append(when, button);
    return box;
  }

  /** Whether a click landed on a pin or a popup rather than on the map itself. */
  const onOverlay = (event) => {
    const target = event.originalEvent && event.originalEvent.target;
    return Boolean(target && target.closest && target.closest('.mapboxgl-marker, .mapboxgl-popup'));
  };

  /** Whether at least half the map is on screen: below 1100px it scrolls away with the page, and then there is nothing to follow. */
  function inView(host) {
    const r = host.getBoundingClientRect();
    return Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0) >= r.height / 2;
  }

  /**
   * The reading line, in pixels from the top of the window. Over the last stretch of the page it
   * slides down to the bottom edge, or the last cards of a short list could never reach it.
   */
  function readingLine() {
    const height = window.innerHeight;
    const line = height * READING_LINE;
    const left = Math.max(0, document.documentElement.scrollHeight - (window.scrollY + height));
    return line + Math.max(0, height - line - left);
  }

  /** The announcement card at the reading line, null above the list (then the map shows the whole course). */
  function readingCard() {
    const height = window.innerHeight;
    const line = readingLine();
    const cards = Array.from(document.querySelectorAll('[data-role="list"] .ev[data-line]'))
      .map((el) => ({ el: el, rect: el.getBoundingClientRect() }))
      .filter((c) => c.rect.height > 0 && c.rect.bottom > 0 && c.rect.top < height);
    if (cards.length === 0 || cards[0].rect.top > line) return null;
    const gap = (c) => (c.rect.top <= line && c.rect.bottom >= line ? 0 : Math.min(Math.abs(c.rect.top - line), Math.abs(c.rect.bottom - line)));
    return cards.reduce((best, c) => (gap(c) < gap(best) ? c : best)).el;
  }

  function create(options) {
    const gl = window.mapboxgl;
    const points = options.points || [];
    if (!options.host || !gl || !options.token || points.length < 2) return null;
    if (typeof gl.supported === 'function' && !gl.supported()) return null;
    const bounds = boundsOf(points);
    let map = null;
    try {
      map = new gl.Map({
        container: options.host,
        accessToken: options.token,
        style: STYLE,
        bounds: bounds,
        fitBoundsOptions: { padding: PADDING },
        locale: LOCALE,
        // North up, flat: the course reads like the printed map. Pinch, wheel and trackpad zoom.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        scrollZoom: true,
      });
    } catch {
      return null;
    }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      drawCourse(map, options);
      nameOnHover(gl, map);
      if (options.canEdit) {
        map.on('mouseenter', 'course-hit', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'course-hit', () => (map.getCanvas().style.cursor = ''));
      }
    });

    let popup = null;
    if (options.canEdit && options.onProject) {
      // A click near the line proposes an announcement at that distance along the course.
      map.on('click', (event) => {
        if (onOverlay(event)) return;
        options.onProject(event.lngLat.lat, event.lngLat.lng).then((found) => {
          if (!found) return;
          if (popup) popup.remove();
          popup = new gl.Popup({ maxWidth: '260px', offset: 6 }).setLngLat(event.lngLat).setDOMContent(placeContent(found)).addTo(map);
        });
      });
    }

    let firings = [];
    let view = { selected: null, categoryOf: () => 'course', titleOf: () => '' };
    /** Pins by event and occurrence, reused from one paint to the next so a save does not flicker. */
    const pins = new Map();
    /** The pin ringed for the card being read, and that card's announcement. */
    let followKey = null;
    let followId = null;
    let moved = false;
    let handsOffUntil = 0;
    let quietSince = 0;
    let quietUntil = 0;

    function dress(pin, f) {
      const cat = 'cat-' + view.categoryOf(f.eventId);
      Array.from(pin.el.classList)
        .filter((c) => c.indexOf('cat-') === 0 && c !== cat)
        .forEach((c) => pin.el.classList.remove(c));
      pin.el.classList.add(cat);
      pin.el.classList.toggle('faint', f.recurring);
      pin.el.classList.toggle('on', view.selected === f.eventId);
      pin.el.classList.toggle('follow', pinKey(f) === followKey);
      pin.el.title = view.titleOf(f.eventId) + ' · ' + f.label;
      pin.marker.setLngLat([f.lng, f.lat]);
    }

    function addPin(f) {
      const el = document.createElement('i');
      el.className = 'ev-pin';
      // Repeated occurrences are decoration: a click goes through them to the course. Inline,
      // because Mapbox writes the marker's pointer-events inline unless one is already there.
      if (f.recurring) el.style.pointerEvents = 'none';
      else if (options.onPick) el.addEventListener('click', () => options.onPick(f.eventId));
      const pin = { el: el, marker: new gl.Marker({ element: el }).setLngLat([f.lng, f.lat]).addTo(map) };
      pins.set(pinKey(f), pin);
      return pin;
    }

    function paint(next, nextView) {
      firings = next || [];
      view = nextView || view;
      const shown = firings.filter(placed);
      const keys = new Set(shown.map(pinKey));
      Array.from(pins.keys())
        .filter((key) => !keys.has(key))
        .forEach((key) => {
          pins.get(key).marker.remove();
          pins.delete(key);
        });
      shown.forEach((f) => dress(pins.get(pinKey(f)) || addPin(f), f));
    }

    const firstPlaced = (id) => firings.find((f) => f.eventId === id && placed(f)) || null;

    function ring(key) {
      followKey = key;
      pins.forEach((pin, k) => pin.el.classList.toggle('follow', k === key));
    }

    /** Keeps the zoom the organizer chose: only the centre moves. */
    function showFiring(f) {
      moved = true;
      map.easeTo({ center: [f.lng, f.lat], duration: EASE_MS });
    }

    function focus(id) {
      const f = firstPlaced(id);
      followId = id;
      quietSince = Date.now();
      quietUntil = quietSince + QUIET_MS;
      ring(f ? pinKey(f) : null);
      if (f) showFiring(f);
    }

    function followList() {
      if (Date.now() < handsOffUntil || !inView(options.host)) return;
      const card = readingCard();
      const id = card ? card.getAttribute('data-line') : null;
      if (id === followId) return;
      followId = id;
      const f = id ? firstPlaced(id) : null;
      ring(f ? pinKey(f) : null);
      // An announcement with no place (a pace trigger) leaves the map where it is.
      if (f) return void showFiring(f);
      if (id === null && moved) {
        moved = false;
        map.fitBounds(bounds, { padding: PADDING, duration: EASE_MS });
      }
    }

    let frame = 0;
    window.addEventListener(
      'scroll',
      () => {
        const now = Date.now();
        // The scroll the editor starts after a pick: wait until it settles, never longer than QUIET_MAX_MS.
        if (now < quietUntil) {
          quietUntil = Math.min(now + 200, quietSince + QUIET_MAX_MS);
          return;
        }
        if (!frame)
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            followList();
          });
      },
      { passive: true },
    );
    // Only moves made by hand carry the browser event; the eases above do not.
    const handsOff = (event) => {
      if (event.originalEvent) handsOffUntil = Date.now() + HANDS_OFF_MS;
    };
    map.on('movestart', handsOff);
    map.on('move', handsOff);

    return {
      paint: paint,
      focus: focus,
      closePopup: () => {
        if (popup) popup.remove();
        popup = null;
      },
    };
  }

  window.SivoovStudioMap = { create: create };
})();
