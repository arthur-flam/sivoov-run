/*
 * The studio's browser half: no framework, no build step. It reads the page's JSON island,
 * draws the events on a Leaflet map (or leaves the server-rendered SVG fallback in place),
 * keeps the editor in sync, and talks to the organizer JSON endpoints. Every position it
 * draws is computed by the Worker with the shared estimate function: this file never does
 * domain arithmetic, it only paints and posts.
 */
(function () {
  const el = document.getElementById('studio-data');
  if (!el) return;
  const data = JSON.parse(el.textContent || '{}');
  const base = data.base;
  const list = document.querySelector('[data-role="list"]');
  const stateEl = document.querySelector('[data-role="state"]');
  const LS_KEY = 'sivoov.studio.' + data.courseId + '.' + data.locale;

  let selected = null;
  let saveTimer = null;
  let markers = {};
  let map = null;
  let audio = null;

  function say(text, busy) {
    if (!stateEl) return;
    stateEl.textContent = text;
    stateEl.className = busy ? 'state busy' : 'state';
  }

  function cards() {
    return list ? Array.prototype.slice.call(list.querySelectorAll('.ev')) : [];
  }
  function cardFor(id) {
    return cards().filter(function (c) { return c.getAttribute('data-line') === id; })[0] || null;
  }
  function field(card, name) {
    return card.querySelector('[name="' + name + '"]');
  }
  function value(card, name) {
    const input = field(card, name);
    return input ? input.value.trim() : '';
  }
  function numberOr(card, name, fallback) {
    const raw = value(card, name);
    return raw === '' ? fallback : Number(raw);
  }

  function triggerFrom(card) {
    const kind = value(card, 'trigger.kind');
    if (kind === 'cue') return { kind: 'cue', at: value(card, 'trigger.at') || 'armed', order: numberOr(card, 'trigger.order', 1) };
    if (kind === 'distance') return { kind: 'distance', meters: numberOr(card, 'trigger.meters', 0) };
    if (kind === 'elapsed') return { kind: 'elapsed', seconds: numberOr(card, 'trigger.seconds', 0) };
    if (kind === 'split') return { kind: 'split', everyMeters: numberOr(card, 'trigger.everyMeters', 1000) };
    if (kind === 'pace') {
      const pace = { kind: 'pace', afterMeters: numberOr(card, 'trigger.afterMeters', 1000) };
      const slower = value(card, 'trigger.slowerThan');
      const faster = value(card, 'trigger.fasterThan');
      if (slower !== '') pace.slowerThan = Number(slower);
      if (faster !== '') pace.fasterThan = Number(faster);
      return pace;
    }
    return { kind: kind };
  }

  function lineFrom(card) {
    const slots = value(card, 'slots')
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    const once = field(card, 'once');
    const line = {
      id: card.getAttribute('data-line'),
      title: value(card, 'title'),
      category: value(card, 'category'),
      mix: value(card, 'mix'),
      priority: numberOr(card, 'priority', 5),
      once: once ? once.checked : true,
      trigger: triggerFrom(card),
      key: value(card, 'key'),
      text: value(card, 'text') || '…',
    };
    if (slots.length > 0) line.slots = slots;
    return line;
  }

  function scriptFrom() {
    return {
      courseId: data.courseId,
      locale: data.locale,
      voice: data.script.voice,
      lines: cards().map(lineFrom),
    };
  }

  function statusOf(id) {
    return (data.lines || []).filter(function (l) { return l.id === id; })[0] || null;
  }

  /* ---------- painting ---------- */

  function paintCards() {
    const firstFiring = {};
    (data.firings || []).forEach(function (f) {
      if (!firstFiring[f.eventId]) firstFiring[f.eventId] = f;
    });
    cards().forEach(function (card) {
      const id = card.getAttribute('data-line');
      const firing = firstFiring[id];
      const when = card.querySelector('[data-role="when"]');
      if (when) when.textContent = firing ? firing.label : '—';
      const name = card.querySelector('[data-role="name"]');
      if (name) name.textContent = value(card, 'title') || id;
      const status = statusOf(id);
      const flag = card.querySelector('[data-role="flag"]');
      if (flag && status) {
        flag.textContent = status.template ? 'modèle' : status.rendered ? 'voix prête' : 'voix à générer';
        flag.className = 'ev-flag' + (status.template || status.rendered ? '' : ' miss');
      }
      const sub = card.querySelector('[data-role="sub"]');
      if (sub && status) {
        const select = field(card, 'category');
        const category = select && select.selectedOptions[0] ? select.selectedOptions[0].textContent : '';
        sub.textContent = status.summary + ' · ' + category + ' · priorité ' + value(card, 'priority');
      }
    });
    // Order follows the estimated distance, like the map and the frise.
    const order = Object.keys(firstFiring);
    order.forEach(function (id) {
      const card = cardFor(id);
      if (card && list) list.appendChild(card);
    });
    paintPublish();
  }

  function paintPublish() {
    const target = document.querySelector('[data-role="publish-state"]');
    if (!target) return;
    const ready = (data.lines || []).filter(function (l) { return !l.template && l.rendered; });
    const missing = (data.lines || []).filter(function (l) { return !l.template && !l.rendered; });
    const bytes = ready.reduce(function (n, l) { return n + l.bytes; }, 0);
    target.textContent =
      ready.length + ' fichiers prêts · ' + Math.round(bytes / 1024) + ' ko' +
      (missing.length > 0 ? ' · ' + missing.length + ' voix manquantes' : '');
  }

  function paintTimeline() {
    const group = document.querySelector('[data-role="tl-dots"]');
    if (!group) return;
    while (group.firstChild) group.removeChild(group.firstChild);
    (data.firings || []).forEach(function (f) {
      if (f.meters === null) return;
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'tl-dot');
      dot.setAttribute('data-event', f.eventId);
      dot.setAttribute('cx', String((Math.min(f.meters, data.distanceM) / Math.max(1, data.distanceM)) * 1000));
      dot.setAttribute('cy', '22');
      dot.setAttribute('r', f.recurring ? '3' : '6');
      dot.setAttribute('opacity', f.recurring ? '0.4' : '1');
      dot.setAttribute('fill', selected === f.eventId ? 'var(--accent-name)' : 'var(--race-primary)');
      group.appendChild(dot);
    });
  }

  function categoryOf(id) {
    const card = cardFor(id);
    return card ? value(card, 'category') : 'course';
  }

  function paintMarkers() {
    if (!map || !window.L) return;
    Object.keys(markers).forEach(function (key) { map.removeLayer(markers[key]); });
    markers = {};
    (data.firings || []).forEach(function (f) {
      if (f.lat === null || f.lng === null) return;
      const classes = 'ev-pin ' + categoryOf(f.eventId) + (f.recurring ? ' faint' : '') + (selected === f.eventId ? ' on' : '');
      const marker = window.L.marker([f.lat, f.lng], {
        icon: window.L.divIcon({ className: '', html: '<i class="' + classes + '"></i>', iconSize: [16, 16] }),
        title: f.label,
        zIndexOffset: f.recurring ? 0 : 200,
        // Repeated occurrences are decoration: they must not eat a click meant for the course.
        interactive: !f.recurring,
      }).addTo(map);
      if (!f.recurring) marker.on('click', function () { select(f.eventId, false); });
      markers[f.eventId + '#' + f.occurrence] = marker;
    });
  }

  function paintFallbackMarkers() {
    Array.prototype.slice.call(document.querySelectorAll('.ev-dot')).forEach(function (dot) {
      dot.setAttribute('stroke', dot.getAttribute('data-event') === selected ? 'var(--ink)' : 'var(--card)');
      dot.addEventListener('click', function () { select(dot.getAttribute('data-event'), false); });
    });
  }

  function paintAll() {
    paintCards();
    paintTimeline();
    paintMarkers();
    paintFallbackMarkers();
  }

  function select(id, fromMap) {
    selected = id;
    cards().forEach(function (card) {
      const on = card.getAttribute('data-line') === id;
      card.className = 'ev' + (on ? ' on open' : '');
    });
    const card = cardFor(id);
    if (card && fromMap !== true) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const firing = (data.firings || []).filter(function (f) { return f.eventId === id && f.lat !== null; })[0];
    if (firing && map) map.panTo([firing.lat, firing.lng]);
    paintTimeline();
    paintMarkers();
    paintFallbackMarkers();
  }

  /* ---------- saving ---------- */

  function apply(payload) {
    if (payload.script) data.script = payload.script;
    if (payload.estimates) {
      data.firings = payload.estimates.firings;
      data.lines = payload.estimates.lines;
      data.paceSecPerKm = payload.estimates.paceSecPerKm;
    }
    paintAll();
  }

  function post(path, body, method) {
    return fetch(base + path, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (json) { return { status: res.status, json: json }; });
    });
  }

  function save() {
    const script = scriptFrom();
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(script)); } catch { /* private mode */ }
    say('Enregistrement…', true);
    return post('/script', script, 'PUT').then(function (out) {
      if (out.status !== 200) {
        say('Non enregistré : ' + (out.json.detail || out.json.error || out.status));
        return;
      }
      try { window.localStorage.removeItem(LS_KEY); } catch { /* private mode */ }
      apply(out.json);
      say('Enregistré ' + new Date().toLocaleTimeString('fr-FR'));
    });
  }

  function saveSoon() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 800);
  }

  /* ---------- voice ---------- */

  function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    window.speechSynthesis.speak(utterance);
  }

  function listen(id) {
    const card = cardFor(id);
    if (!card) return Promise.resolve();
    const status = statusOf(id);
    const text = value(card, 'text');
    if (!status || !status.rendered) {
      say('Voix du navigateur (aucun MP3 généré pour cette ligne)');
      speak(text);
      return Promise.resolve();
    }
    if (audio) audio.pause();
    audio = new window.Audio(base + '/audio/' + status.hash);
    say('Lecture : ' + (value(card, 'title') || id));
    return new Promise(function (resolve) {
      audio.addEventListener('ended', resolve);
      audio.addEventListener('error', function () { speak(text); resolve(); });
      audio.play().catch(function () { speak(text); resolve(); });
    });
  }

  function listenAll() {
    const ids = cards().map(function (c) { return c.getAttribute('data-line'); });
    return ids.reduce(function (chain, id) {
      return chain.then(function () { select(id, true); return listen(id); });
    }, Promise.resolve()).then(function () { say('Lecture terminée'); });
  }

  function render(id) {
    say('Génération de la voix…', true);
    return post('/script/render', { lineId: id }).then(function (out) {
      if (out.status !== 200) {
        say('Génération impossible : ' + (out.json.detail || out.json.error || out.status));
        return false;
      }
      apply(out.json);
      say(out.json.cached ? 'Déjà en cache' : 'Voix générée');
      return true;
    });
  }

  function renderAll() {
    const todo = (data.lines || []).filter(function (l) { return !l.template && !l.rendered; }).map(function (l) { return l.id; });
    if (todo.length === 0) { say('Toutes les voix sont déjà générées'); return; }
    let done = 0;
    todo.reduce(function (chain, id) {
      return chain.then(function () {
        say('Génération ' + (done + 1) + '/' + todo.length + '…', true);
        return render(id).then(function (ok) { if (ok) done += 1; });
      });
    }, Promise.resolve()).then(function () { say(done + ' voix générées sur ' + todo.length); });
  }

  function publish() {
    say('Publication…', true);
    post('/script/publish', {}).then(function (out) {
      if (out.status === 200) {
        say('Version ' + out.json.version + ' publiée : ' + out.json.files + ' fichiers, ' + Math.round(out.json.bytes / 1024) + ' ko');
        window.setTimeout(function () { window.location.reload(); }, 900);
        return;
      }
      if (out.json.missing) {
        say('Publication refusée, voix manquantes : ' + out.json.missing.map(function (m) { return m.title || m.id; }).join(', '));
        return;
      }
      say('Publication impossible : ' + (out.json.detail || out.json.error || out.status));
    });
  }

  /* ---------- editing ---------- */

  function freshId() {
    return 'course.' + Date.now().toString(36);
  }

  function addCard(line) {
    const template = document.querySelector('[data-role="line-template"]');
    if (!template || !list) return null;
    const card = template.content.firstElementChild.cloneNode(true);
    card.setAttribute('data-line', line.id);
    list.appendChild(card);
    const set = function (name, v) { const input = field(card, name); if (input) input.value = v; };
    set('title', line.title);
    set('text', line.text);
    set('key', line.key);
    set('priority', String(line.priority));
    set('category', line.category);
    set('mix', line.mix);
    set('slots', (line.slots || []).join(', '));
    set('trigger.kind', line.trigger.kind);
    if (line.trigger.kind === 'cue') {
      set('trigger.at', line.trigger.at);
      set('trigger.order', String(line.trigger.order));
    }
    if (line.trigger.kind === 'distance') set('trigger.meters', String(line.trigger.meters));
    if (line.trigger.kind === 'elapsed') set('trigger.seconds', String(line.trigger.seconds));
    if (line.trigger.kind === 'split') set('trigger.everyMeters', String(line.trigger.everyMeters));
    const idFlag = card.querySelector('[data-role="id"]');
    if (idFlag) idFlag.textContent = line.id;
    showTriggerFields(card);
    select(line.id, false);
    return card;
  }

  function addAt(meters) {
    const id = freshId();
    addCard({
      id: id,
      title: 'Nouvel événement',
      category: 'course',
      mix: 'duck',
      priority: 5,
      once: true,
      trigger: { kind: 'distance', meters: Math.round(meters) },
      key: data.courseId + '-' + id.split('.')[1],
      text: 'À écrire.',
    });
    save();
  }

  function duplicate(id) {
    const card = cardFor(id);
    if (!card) return;
    const line = lineFrom(card);
    const fresh = freshId();
    line.id = fresh;
    line.key = line.key + '-copie';
    line.title = line.title + ' (copie)';
    addCard(line);
    save();
  }

  function remove(id) {
    const card = cardFor(id);
    if (!card) return;
    if (!window.confirm('Supprimer cet événement ?')) return;
    card.parentNode.removeChild(card);
    save();
  }

  function showTriggerFields(card) {
    const kind = value(card, 'trigger.kind');
    Array.prototype.slice.call(card.querySelectorAll('[data-when]')).forEach(function (box) {
      box.className = 'f' + (box.getAttribute('data-when') === kind ? '' : ' hide');
    });
  }

  /* ---------- wiring ---------- */

  if (list) {
    list.addEventListener('click', function (event) {
      const card = event.target.closest ? event.target.closest('.ev') : null;
      if (!card) return;
      const id = card.getAttribute('data-line');
      const role = event.target.getAttribute && event.target.getAttribute('data-role');
      if (role === 'listen') return void listen(id);
      if (role === 'render') return void render(id);
      if (role === 'duplicate') return void duplicate(id);
      if (role === 'delete') return void remove(id);
      if (event.target.closest('[data-role="toggle"]')) {
        if (selected === id) { card.className = 'ev'; selected = null; paintTimeline(); paintMarkers(); return; }
        select(id, false);
      }
    });
    list.addEventListener('input', function (event) {
      const card = event.target.closest ? event.target.closest('.ev') : null;
      if (card && event.target.getAttribute('name') === 'trigger.kind') showTriggerFields(card);
      saveSoon();
    });
    list.addEventListener('change', function (event) {
      const card = event.target.closest ? event.target.closest('.ev') : null;
      if (card && event.target.getAttribute('name') === 'trigger.kind') showTriggerFields(card);
      saveSoon();
    });
  }

  const bind = function (role, handler) {
    const node = document.querySelector('[data-role="' + role + '"]');
    if (node) node.addEventListener('click', handler);
    return node;
  };
  bind('listen-all', listenAll);
  bind('render-all', renderAll);
  bind('publish', publish);
  bind('add', function () { addAt(0); });

  const paceInput = document.querySelector('[data-role="pace"]');
  if (paceInput) {
    paceInput.addEventListener('change', function () {
      const parts = /^(\d{1,2}):(\d{2})$/.exec(paceInput.value.trim());
      if (!parts) { say('Allure attendue au format 5:30'); return; }
      const seconds = Number(parts[1]) * 60 + Number(parts[2]);
      fetch(base + '/script?pace=' + seconds)
        .then(function (res) { return res.json(); })
        .then(function (json) { apply(json); say('Estimations à ' + paceInput.value + ' /km'); });
    });
  }

  const dots = document.querySelector('[data-role="tl-dots"]');
  if (dots) {
    dots.addEventListener('click', function (event) {
      const id = event.target.getAttribute && event.target.getAttribute('data-event');
      if (id) select(id, false);
    });
  }

  /* ---------- the map ---------- */

  function initMap() {
    const host = document.querySelector('[data-role="map"]');
    const fallback = document.querySelector('[data-role="fallback"]');
    if (!host || !window.L || !data.mapboxToken || !data.points || data.points.length < 2) {
      if (host) host.className = 'hide';
      if (fallback) fallback.className = 'map-fallback';
      paintFallbackMarkers();
      return;
    }
    map = window.L.map(host, { scrollWheelZoom: false });
    window.L.tileLayer(
      'https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=' + data.mapboxToken,
      { tileSize: 512, zoomOffset: -1, maxZoom: 18, attribution: '© Mapbox © OpenStreetMap' },
    ).addTo(map);
    const latlngs = data.points.map(function (p) { return [p.lat, p.lng]; });
    // Non-interactive: a click on the course must reach the map handler below.
    const line = window.L.polyline(latlngs, { color: '#1a1a1a', weight: 4, opacity: 0.85, interactive: false }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [18, 18] });
    window.L.circleMarker(latlngs[0], { radius: 7, color: '#1f6b34', fillColor: '#1f6b34', fillOpacity: 1 })
      .addTo(map).bindTooltip('Départ');
    window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: '#b8443b', fillColor: '#b8443b', fillOpacity: 1 })
      .addTo(map).bindTooltip('Arrivée');
    (data.ticks || []).forEach(function (tick) {
      window.L.circleMarker([tick.lat, tick.lng], { radius: 2, color: '#52525b', opacity: 0.6, fillOpacity: 0.6, interactive: false }).addTo(map);
    });
    (data.landmarks || []).forEach(function (mark) {
      if (mark.lat === null) return;
      window.L.circleMarker([mark.lat, mark.lng], { radius: 5, color: '#0f3d6e', weight: 2, fillColor: '#faf9f7', fillOpacity: 1 })
        .addTo(map).bindTooltip(mark.name);
    });
    // A click near the line proposes an event at that distance along the course.
    map.on('click', function (event) {
      post('/script/project', { lat: event.latlng.lat, lng: event.latlng.lng }).then(function (out) {
        if (out.status !== 200) return;
        const km = (out.json.meters / 1000).toFixed(2).replace('.', ',');
        window.L.popup()
          .setLatLng(event.latlng)
          .setContent(
            '<div style="font:inherit;text-align:center">Au km ' + km +
            '<br><button type="button" data-role="place" data-meters="' + out.json.meters +
            '" style="margin-top:6px;font:inherit;padding:6px 10px;border-radius:8px;border:1px solid #e8e6e3;background:#fff;cursor:pointer">Ajouter un événement ici</button></div>',
          )
          .openOn(map);
      });
    });
    host.addEventListener('click', function (event) {
      if (event.target.getAttribute && event.target.getAttribute('data-role') === 'place') {
        map.closePopup();
        addAt(Number(event.target.getAttribute('data-meters')));
      }
    });
    paintMarkers();
  }

  function restoreDraft() {
    let stored = null;
    try { stored = window.localStorage.getItem(LS_KEY); } catch { stored = null; }
    if (!stored) return;
    if (!window.confirm('Des modifications non enregistrées ont été trouvées. Les restaurer ?')) {
      try { window.localStorage.removeItem(LS_KEY); } catch { /* private mode */ }
      return;
    }
    post('/script', JSON.parse(stored), 'PUT').then(function (out) {
      if (out.status === 200) { window.location.reload(); return; }
      say('Restauration impossible : ' + (out.json.detail || out.json.error));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMap();
    paintAll();
    restoreDraft();
  });
  if (document.readyState !== 'loading') {
    initMap();
    paintAll();
    restoreDraft();
  }
})();
