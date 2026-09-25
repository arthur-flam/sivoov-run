/*
 * The studio's browser half: no framework, no build step. It reads the page's JSON island,
 * draws the announcements on a Leaflet map (or leaves the server-rendered SVG fallback in
 * place), keeps the editor in sync, and talks to the organizer JSON endpoints. Every position,
 * status and sentence it paints comes from the Worker (shared estimates, studioCopy.ts); the
 * only arithmetic here is turning what the organizer types (km, minutes, 6:30) into the meters
 * and seconds the script stores, which mirrors shared/src/domain/audioEditor.ts.
 * Writes go through one queue, so a save, an upload and a publish never cross.
 */
(function () {
  const island = document.getElementById('studio-data');
  if (!island) return;
  const data = JSON.parse(island.textContent || '{}');
  const base = data.base;
  const canEdit = data.canEdit === true;
  const MOMENTS = ['start', 'course', 'always', 'finish'];
  const LS_KEY = 'sivoov.studio.' + data.courseId + '.' + data.locale;
  const MAX_UPLOAD = 5 * 1024 * 1024;
  const SAMPLES = { km: 'douze', splitTime: 'cinq minutes vingt-huit', firstName: 'Camille', pace: 'cinq minutes trente', time: 'trois heures douze' };

  let selected = null;
  let saveTimer = null;
  let dirty = false;
  let writes = Promise.resolve();
  let markers = [];
  let map = null;
  let audio = null;
  let listenRun = 0;

  /* ---------- small helpers ---------- */

  const q = (selector, root) => (root || document).querySelector(selector);
  const qa = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const setText = (root, role, text) => {
    const node = q('[data-role="' + role + '"]', root);
    if (node) node.textContent = text;
  };
  const cards = () => qa('[data-role="list"] .ev');
  const cardFor = (id) => cards().find((c) => c.getAttribute('data-line') === id) || null;
  const field = (card, name) => q('[name="' + name + '"]', card);
  const value = (card, name) => {
    const input = field(card, name);
    return input ? input.value.trim() : '';
  };
  const statusOf = (id) => (data.lines || []).find((l) => l.id === id) || null;
  const scriptLine = (id) => (data.script.lines || []).find((l) => l.id === id) || null;
  const audioOf = (card) => {
    const raw = card.getAttribute('data-audio');
    return raw ? JSON.parse(raw) : null;
  };

  function say(text, tone) {
    const node = q('[data-role="state"]');
    if (!node) return;
    node.textContent = text;
    node.className = 'st-state' + (tone ? ' ' + tone : '');
  }

  function cssVar(name, fallback) {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ---------- what the organizer types -> what the script stores (mirrors audioEditor.ts) ---------- */

  function parseDecimal(text) {
    const clean = String(text).trim().replace(/\s+/g, '').replace(',', '.');
    return /^(\d+(\.\d*)?|\.\d+)$/.test(clean) ? Number(clean) : null;
  }
  function metersFromKm(text) {
    const km = parseDecimal(text);
    return km === null ? null : Math.round(km * 10000) / 10;
  }
  function kmInput(meters) {
    return String(Number((meters / 1000).toFixed(4))).replace('.', ',');
  }
  function secondsFromMinutes(text) {
    const minutes = parseDecimal(text);
    return minutes === null ? null : Math.round(minutes * 600) / 10;
  }
  function paceFromInput(text) {
    const clock = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
    if (clock) return Number(clock[2]) < 60 ? Number(clock[1]) * 60 + Number(clock[2]) : null;
    const minutes = parseDecimal(text);
    return minutes === null || minutes === 0 ? null : Math.round(minutes * 60);
  }

  /** The trigger from the "Quand" fields, or the sentence that says which field to fix. */
  function triggerFrom(card) {
    const kind = value(card, 'when.kind');
    if (kind === 'start' || kind === 'finish') return { trigger: { kind: kind } };
    if (kind === 'distance') {
      const meters = metersFromKm(value(card, 'when.km'));
      return meters === null ? { error: 'Indiquez le kilomètre, par exemple 5,2.' } : { trigger: { kind: 'distance', meters: meters } };
    }
    if (kind === 'elapsed') {
      const seconds = secondsFromMinutes(value(card, 'when.minutes'));
      return seconds === null ? { error: 'Indiquez le nombre de minutes de course, par exemple 90.' } : { trigger: { kind: 'elapsed', seconds: seconds } };
    }
    if (kind === 'split') {
      const every = metersFromKm(value(card, 'when.everyKm'));
      return every === null || every === 0 ? { error: 'Indiquez tous les combien de kilomètres, par exemple 1.' } : { trigger: { kind: 'split', everyMeters: every } };
    }
    const afterText = value(card, 'when.afterKm');
    const slowerText = value(card, 'when.slowerThan');
    const fasterText = value(card, 'when.fasterThan');
    const after = afterText === '' ? 0 : metersFromKm(afterText);
    const slower = slowerText === '' ? undefined : paceFromInput(slowerText);
    const faster = fasterText === '' ? undefined : paceFromInput(fasterText);
    if (after === null) return { error: 'Indiquez le kilomètre à partir duquel le conseil est donné.' };
    if (slower === null || faster === null || (slower === undefined && faster === undefined)) {
      return { error: 'Indiquez une allure en minutes par km, par exemple 6:30.' };
    }
    return {
      trigger: Object.assign({ kind: 'pace', afterMeters: after }, slower === undefined ? {} : { slowerThan: slower }, faster === undefined ? {} : { fasterThan: faster }),
    };
  }

  /** One line of the script from its card, or its error. The file stays whatever the card carries. */
  function lineFrom(card) {
    const id = card.getAttribute('data-line');
    const when = triggerFrom(card);
    const errorNode = q('[data-role="when-error"]', card);
    if (errorNode) {
      errorNode.textContent = when.error || '';
      errorNode.hidden = !when.error;
    }
    if (when.error) return { error: when.error };
    const slots = value(card, 'slots')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const repeat = field(card, 'repeat');
    const previous = scriptLine(id);
    const file = audioOf(card);
    const line = {
      id: id,
      title: value(card, 'title'),
      category: value(card, 'category'),
      mix: value(card, 'mix'),
      priority: Number(value(card, 'priority') || 5),
      once: repeat ? !repeat.checked : true,
      trigger: when.trigger,
      key: value(card, 'key') || (previous ? previous.key : data.courseId + '-' + id.replace(/\W+/g, '-')),
      text: value(card, 'text') || '…',
    };
    return { line: Object.assign({}, line, slots.length > 0 ? { slots: slots } : {}, file ? { audio: file } : {}) };
  }

  /** The whole script from the page, or null when a field needs fixing first. */
  function scriptFrom() {
    const built = cards().map(lineFrom);
    if (built.some((b) => b.error)) return null;
    return { voice: data.script.voice, lines: built.map((b) => b.line) };
  }

  /* ---------- talking to the Worker, one write at a time ---------- */

  function call(method, path, body) {
    const url = base + path + (path.indexOf('?') < 0 ? '?' : '&') + 'pace=' + data.paceSecPerKm;
    const init = { method: method, headers: { Accept: 'application/json' } };
    if (body instanceof window.FormData) init.body = body;
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(url, init).then((res) =>
      res
        .json()
        .catch(() => ({}))
        .then((json) => ({ status: res.status, json: json })),
    );
  }

  /** Queues a write behind the others. A failed request (no network) leaves the edit to save again. */
  function write(task) {
    const next = writes.then(task, task);
    writes = next.catch(() => {
      dirty = true;
      say('Pas de connexion. Vos modifications sont gardées sur cet appareil.', 'bad');
    });
    return writes;
  }

  const detailOf = (out) => (out.json && (out.json.detail || out.json.error)) || 'erreur ' + out.status;

  function apply(payload) {
    if (payload.script) data.script = payload.script;
    if (payload.estimates) {
      data.firings = payload.estimates.firings;
      data.lines = payload.estimates.lines;
      data.summary = payload.estimates.summary;
      data.paceSecPerKm = payload.estimates.paceSecPerKm;
    }
    paintAll();
  }

  function save() {
    if (!canEdit) return writes;
    const script = scriptFrom();
    if (!script) {
      say('Pas encore sauvegardé : corrigez le champ indiqué en rouge.', 'bad');
      return writes;
    }
    dirty = false;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(script));
    } catch {
      /* private mode */
    }
    return write(() => {
      say('Sauvegarde…', 'busy');
      return call('PUT', '/script', script).then((out) => {
        if (out.status !== 200) {
          dirty = true;
          say('Pas sauvegardé : ' + detailOf(out), 'bad');
          return;
        }
        try {
          window.localStorage.removeItem(LS_KEY);
        } catch {
          /* private mode */
        }
        apply(out.json);
        say('Sauvegardé à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      });
    });
  }

  function saveSoon() {
    if (!canEdit) return;
    dirty = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      save();
    }, 800);
  }

  /** Any pending save first: renders, uploads, listening and publishing read the saved draft. */
  function flush() {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    return dirty ? save() : writes;
  }

  /* ---------- painting ---------- */

  function paintCard(card) {
    const id = card.getAttribute('data-line');
    const status = statusOf(id);
    const line = scriptLine(id);
    const file = line ? line.audio || null : audioOf(card);
    card.setAttribute('data-audio', file ? JSON.stringify(file) : '');
    setText(card, 'name', value(card, 'title') || 'Sans titre');
    setText(card, 'excerpt', file ? 'Votre fichier : ' + (file.name || 'son importé') : value(card, 'text'));
    if (status) {
      setText(card, 'when', status.when);
      const flag = q('[data-role="flag"]', card);
      if (flag) {
        flag.textContent = status.label;
        flag.className = 'badge ' + status.tone;
      }
    }
    const fileBox = q('[data-role="file"]', card);
    if (fileBox) fileBox.hidden = !file;
    if (file) setText(card, 'file-name', file.name || 'Votre fichier');
    const uploadLabel = q('[data-role="upload-label"]', card);
    if (uploadLabel) uploadLabel.hidden = Boolean(file);
    const render = q('[data-role="render"]', card);
    if (render) {
      render.hidden = !status || status.source !== 'voice';
      render.disabled = !data.ttsReady || Boolean(status && status.rendered);
      render.textContent = status && status.rendered ? 'Voix enregistrée' : 'Enregistrer la voix';
    }
    measure(card);
  }

  function measure(card) {
    const n = value(card, 'text').length;
    const seconds = Math.max(1, Math.round(n / (data.perSecond || 15)));
    setText(card, 'measure', n.toLocaleString('fr-FR') + (n > 1 ? ' caractères' : ' caractère') + ' · environ ' + seconds + ' s');
  }

  /** Cards follow the Worker's order and moments, moved only when they must (moving a node drops focus). */
  function regroup() {
    const active = document.activeElement;
    const caret = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    MOMENTS.forEach((moment) => {
      const list = q('[data-role="list"][data-moment="' + moment + '"]');
      if (!list) return;
      const wanted = (data.lines || [])
        .filter((s) => s.moment === moment)
        .map((s) => cardFor(s.id))
        .filter(Boolean);
      const current = Array.from(list.children);
      const unknown = current.filter((c) => !statusOf(c.getAttribute('data-line')));
      const order = wanted.concat(unknown);
      const same = order.length === current.length && order.every((c, i) => c === current[i]);
      if (!same) order.forEach((c) => list.appendChild(c));
    });
    qa('[data-role="list"]').forEach((list) => {
      const none = q('[data-role="none"]', list.parentNode);
      if (none) none.hidden = list.children.length > 0;
    });
    if (active && active !== document.activeElement && document.contains(active)) {
      active.focus();
      if (caret) active.setSelectionRange(caret[0], caret[1]);
    }
  }

  function paintHead() {
    const s = data.summary;
    if (!s) return;
    setText(document, 'summary', s.text);
    const button = q('[data-role="publish"]');
    if (button) {
      button.textContent = s.button.label;
      button.disabled = !s.button.enabled;
    }
    setText(document, 'publish-note', s.button.note);
    const renderAll = q('[data-role="render-all"]');
    if (renderAll) renderAll.hidden = !(data.lines || []).some((l) => l.source === 'voice' && !l.rendered);
    const listenAll = q('[data-role="listen-all"]');
    if (listenAll) listenAll.disabled = cards().length === 0;
    measureHead();
  }

  function measureHead() {
    const head = q('.st-head');
    if (head) document.documentElement.style.setProperty('--st-head-h', head.offsetHeight + 'px');
  }

  const categoryOf = (id) => {
    const card = cardFor(id);
    return card ? value(card, 'category') || 'course' : 'course';
  };
  const titleOf = (id) => {
    const card = cardFor(id);
    return card ? value(card, 'title') || 'Sans titre' : '';
  };

  function paintTimeline() {
    const track = q('[data-role="tl-dots"]');
    if (!track) return;
    track.textContent = '';
    (data.firings || []).forEach((f) => {
      if (f.meters === null) return;
      const dot = document.createElement(f.recurring ? 'i' : 'button');
      dot.className = 'tl-dot cat-' + categoryOf(f.eventId) + (f.recurring ? ' faint' : '') + (!f.recurring && selected === f.eventId ? ' on' : '');
      dot.style.left = ((Math.min(f.meters, data.distanceM) / Math.max(1, data.distanceM)) * 100).toFixed(2) + '%';
      if (!f.recurring) {
        dot.type = 'button';
        dot.setAttribute('data-event', f.eventId);
        dot.title = titleOf(f.eventId) + ' · ' + f.label;
        dot.setAttribute('aria-label', dot.title);
      }
      track.appendChild(dot);
    });
  }

  function paintMarkers() {
    if (!map || !window.L) return;
    markers.forEach((m) => map.removeLayer(m));
    markers = (data.firings || [])
      .filter((f) => f.lat !== null && f.lng !== null)
      .map((f) => {
        const classes = 'ev-pin cat-' + categoryOf(f.eventId) + (f.recurring ? ' faint' : '') + (selected === f.eventId ? ' on' : '');
        const marker = window.L.marker([f.lat, f.lng], {
          icon: window.L.divIcon({ className: '', html: '<i class="' + classes + '"></i>', iconSize: [16, 16] }),
          title: titleOf(f.eventId) + ' · ' + f.label,
          zIndexOffset: f.recurring ? 0 : 200,
          // Repeated occurrences are decoration: they must not eat a click meant for the course.
          interactive: !f.recurring,
        }).addTo(map);
        if (!f.recurring) marker.on('click', () => select(f.eventId, { fromMap: true }));
        return marker;
      });
  }

  function paintFallbackMarkers() {
    qa('.ev-dot').forEach((dot) => {
      dot.setAttribute('stroke', dot.getAttribute('data-event') === selected ? 'var(--ink)' : 'var(--surface)');
      dot.setAttribute('stroke-width', dot.getAttribute('data-event') === selected ? '3' : '1.5');
    });
  }

  function paintAll() {
    cards().forEach(paintCard);
    regroup();
    paintHead();
    paintTimeline();
    paintMarkers();
    paintFallbackMarkers();
  }

  function select(id, opts) {
    const options = opts || {};
    selected = id;
    cards().forEach((card) => {
      const on = card.getAttribute('data-line') === id;
      card.classList.toggle('on', on);
      card.classList.toggle('open', on);
      const toggle = q('[data-role="toggle"]', card);
      if (toggle) toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    const card = cardFor(id);
    if (card && !options.fromList) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const firing = (data.firings || []).find((f) => f.eventId === id && f.lat !== null);
    if (firing && map) map.panTo([firing.lat, firing.lng]);
    paintTimeline();
    paintMarkers();
    paintFallbackMarkers();
  }

  function unselect() {
    selected = null;
    cards().forEach((card) => {
      card.classList.remove('on', 'open');
      const toggle = q('[data-role="toggle"]', card);
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
    paintTimeline();
    paintMarkers();
    paintFallbackMarkers();
  }

  /* ---------- listening ---------- */

  function speak(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text.replace(/\{(\w+)\}/g, (_, slot) => SAMPLES[slot] || slot));
      utterance.lang = 'fr-FR';
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  function stopListening() {
    if (audio) {
      audio.pause();
      audio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function play(id) {
    const card = cardFor(id);
    if (!card) return Promise.resolve();
    const status = statusOf(id);
    const text = value(card, 'text');
    stopListening();
    if (!status || !status.audioPath) {
      say(
        status && status.source === 'template'
          ? 'Voix de l’ordinateur : cette annonce s’affiche sur l’écran du coureur.'
          : 'Voix de l’ordinateur : la voix de l’annonceur n’est pas encore enregistrée pour ce texte.',
      );
      return speak(text);
    }
    say('Lecture : ' + (value(card, 'title') || 'annonce'));
    audio = new window.Audio(base + status.audioPath);
    const current = audio;
    return new Promise((resolve) => {
      current.addEventListener('ended', () => resolve());
      current.addEventListener('error', () => speak(text).then(resolve));
      current.play().catch(() => speak(text).then(resolve));
    });
  }

  function listen(id) {
    listenRun += 1;
    return (canEdit ? flush() : Promise.resolve()).then(() => play(id));
  }

  function listenAll() {
    listenRun += 1;
    const run = listenRun;
    const ids = cards().map((c) => c.getAttribute('data-line'));
    (canEdit ? flush() : Promise.resolve())
      .then(() =>
        ids.reduce(
          (chain, id) =>
            chain.then(() => {
              if (run !== listenRun) return undefined;
              select(id, {});
              return play(id);
            }),
          Promise.resolve(),
        ),
      )
      .then(() => {
        if (run === listenRun) say('Vous avez tout écouté.');
      });
  }

  /* ---------- the voice, files, publishing ---------- */

  function render(id) {
    return flush().then(() =>
      write(() => {
        say('Enregistrement de la voix…', 'busy');
        return call('POST', '/script/render', { lineId: id }).then((out) => {
          if (out.status !== 200) {
            say(detailOf(out), 'bad');
            return false;
          }
          apply(out.json);
          say('Voix enregistrée.');
          return true;
        });
      }),
    );
  }

  function renderAll() {
    const todo = (data.lines || []).filter((l) => l.source === 'voice' && !l.rendered).map((l) => l.id);
    if (todo.length === 0) return;
    todo
      .reduce(
        (chain, id, i) =>
          chain.then(() => {
            say('Enregistrement des voix : ' + (i + 1) + ' sur ' + todo.length + '…', 'busy');
            return render(id);
          }),
        Promise.resolve(),
      )
      .then(() => {
        const left = (data.lines || []).filter((l) => l.source === 'voice' && !l.rendered).length;
        say(left === 0 ? 'Toutes les voix sont enregistrées.' : 'Il reste ' + left + ' voix à enregistrer.', left === 0 ? '' : 'bad');
      });
  }

  function upload(id, file) {
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      say('Le fichier dépasse 5 Mo. Envoyez un MP3 plus court ou plus compressé.', 'bad');
      return;
    }
    flush().then(() =>
      write(() => {
        say('Envoi du fichier…', 'busy');
        const form = new window.FormData();
        form.append('file', file);
        return call('POST', '/script/lines/' + encodeURIComponent(id) + '/audio', form).then((out) => {
          if (out.status !== 200) {
            say(detailOf(out), 'bad');
            return;
          }
          apply(out.json);
          say('Fichier ajouté : il est joué à la place de la voix.');
        });
      }),
    );
  }

  function unfile(id) {
    flush().then(() =>
      write(() =>
        call('DELETE', '/script/lines/' + encodeURIComponent(id) + '/audio').then((out) => {
          if (out.status !== 200) {
            say(detailOf(out), 'bad');
            return;
          }
          apply(out.json);
          say('Cette annonce est de nouveau lue par la voix.');
        }),
      ),
    );
  }

  function publish() {
    if (!window.confirm(data.confirmPublish)) return;
    flush().then(() =>
      write(() => {
        say('Publication…', 'busy');
        return call('POST', '/script/publish', {}).then((out) => {
          if (out.status !== 200) {
            say(detailOf(out), 'bad');
            return;
          }
          say('Publié. Les coureurs reçoivent cette version la prochaine fois qu’ils ouvrent l’application.');
          window.setTimeout(() => window.location.reload(), 1200);
        });
      }),
    );
  }

  /* ---------- adding, duplicating, removing ---------- */

  const freshId = () => 'annonce.' + Date.now().toString(36);

  /** A copy of a card (or of the blank template) under a new id: ids and labels follow. */
  function cloneAs(source, id) {
    const oldId = source.getAttribute('data-line');
    const card = source.cloneNode(true);
    card.setAttribute('data-line', id);
    card.classList.remove('on', 'open');
    qa('[id]', card).forEach((n) => n.setAttribute('id', id + n.getAttribute('id').slice(oldId.length)));
    qa('[for]', card).forEach((n) => n.setAttribute('for', id + n.getAttribute('for').slice(oldId.length)));
    return card;
  }

  function setField(card, name, v) {
    const input = field(card, name);
    if (input) input.value = v;
  }

  function showTriggerFields(card) {
    const kind = value(card, 'when.kind');
    qa('[data-when]', card).forEach((box) => box.classList.toggle('hide', box.getAttribute('data-when') !== kind));
  }

  function add(moment, trigger) {
    const template = q('[data-role="line-template"]');
    const list = q('[data-role="list"][data-moment="' + moment + '"]');
    if (!template || !list) return;
    const id = freshId();
    const card = cloneAs(template.content.firstElementChild, id);
    setField(card, 'title', 'Nouvelle annonce');
    setField(card, 'text', '');
    setField(card, 'key', data.courseId + '-' + id.split('.')[1]);
    setField(card, 'when.kind', trigger.kind);
    if (trigger.kind === 'distance') setField(card, 'when.km', kmInput(trigger.meters));
    if (trigger.kind === 'split') setField(card, 'when.everyKm', kmInput(trigger.everyMeters));
    const text = field(card, 'text');
    if (text) text.setAttribute('placeholder', 'Ce que le coureur entend à ce moment-là.');
    setText(card, 'when', '');
    list.appendChild(card);
    showTriggerFields(card);
    paintCard(card);
    regroup();
    select(id, {});
    if (text) text.focus();
    dirty = true;
    save();
  }

  function duplicate(id) {
    const source = cardFor(id);
    if (!source) return;
    const copyId = freshId();
    const card = cloneAs(source, copyId);
    setField(card, 'title', value(source, 'title') + ' (copie)');
    setField(card, 'key', value(source, 'key') + '-' + copyId.split('.')[1]);
    source.parentNode.insertBefore(card, source.nextSibling);
    select(copyId, {});
    dirty = true;
    save();
  }

  function remove(id) {
    const card = cardFor(id);
    if (!card || !window.confirm('Supprimer cette annonce ?')) return;
    card.parentNode.removeChild(card);
    if (selected === id) selected = null;
    dirty = true;
    save();
  }

  /* ---------- wiring ---------- */

  const DEFAULT_TRIGGER = {
    start: { kind: 'start' },
    course: { kind: 'distance', meters: 1000 },
    always: { kind: 'split', everyMeters: 1000 },
    finish: { kind: 'finish' },
  };

  const ACTIONS = ['toggle', 'listen', 'listen-all', 'render', 'unfile', 'duplicate', 'delete', 'render-all', 'publish', 'add', 'place'];
  const ACTION_SELECTOR = ACTIONS.map((role) => '[data-role="' + role + '"]').join(', ') + ', [data-event]';

  document.addEventListener('click', (event) => {
    const target = event.target.closest ? event.target.closest(ACTION_SELECTOR) : null;
    if (!target) return;
    const role = target.getAttribute('data-role');
    const card = target.closest('.ev');
    const id = card ? card.getAttribute('data-line') : null;
    if (role === 'toggle' && id) return void (selected === id ? unselect() : select(id, { fromList: true }));
    if (role === 'listen' && id) return void listen(id);
    if (role === 'listen-all') return void listenAll();
    if (!canEdit) {
      if (target.hasAttribute('data-event')) select(target.getAttribute('data-event'), {});
      return;
    }
    if (role === 'render' && id) return void render(id);
    if (role === 'unfile' && id) return void unfile(id);
    if (role === 'duplicate' && id) return void duplicate(id);
    if (role === 'delete' && id) return void remove(id);
    if (role === 'render-all') return void renderAll();
    if (role === 'publish') return void publish();
    if (role === 'add') return void add(target.getAttribute('data-moment'), DEFAULT_TRIGGER[target.getAttribute('data-moment')]);
    if (role === 'place') {
      if (map) map.closePopup();
      return void add('course', { kind: 'distance', meters: Number(target.getAttribute('data-meters')) });
    }
    if (target.hasAttribute('data-event')) select(target.getAttribute('data-event'), {});
  });

  const onEdit = (event) => {
    const card = event.target.closest ? event.target.closest('.ev') : null;
    if (!card || !canEdit) return;
    const name = event.target.getAttribute('name');
    if (event.target.getAttribute('data-role') === 'upload') {
      if (event.type !== 'change') return;
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      return void upload(card.getAttribute('data-line'), file);
    }
    if (name === 'when.kind') showTriggerFields(card);
    if (name === 'text' || name === 'title') paintCard(card);
    saveSoon();
  };
  document.addEventListener('input', onEdit);
  document.addEventListener('change', (event) => {
    if (event.target.getAttribute && event.target.getAttribute('data-role') === 'upload') return void onEdit(event);
    if (event.target.tagName === 'SELECT' || event.target.type === 'checkbox') onEdit(event);
  });

  const paceInput = q('[data-role="pace"]');
  if (paceInput) {
    paceInput.addEventListener('change', () => {
      const seconds = paceFromInput(paceInput.value);
      if (seconds === null) return void say('Écrivez l’allure comme 5:30.', 'bad');
      data.paceSecPerKm = seconds;
      call('GET', '/script').then((out) => {
        if (out.status !== 200) return void say(detailOf(out), 'bad');
        apply(out.json);
        say('Positions calculées pour ' + paceInput.value + ' /km.');
      });
    });
  }

  window.addEventListener('beforeunload', (event) => {
    if (dirty) event.preventDefault();
  });
  window.addEventListener('resize', measureHead);

  /* ---------- the map ---------- */

  function initMap() {
    const host = q('[data-role="map"]');
    const fallback = q('[data-role="fallback"]');
    if (!host || !window.L || !data.mapboxToken || !data.points || data.points.length < 2) {
      if (host) host.classList.add('hide');
      if (fallback) fallback.classList.remove('hide');
      return;
    }
    const ink = cssVar('--ink', 'black');
    map = window.L.map(host, { scrollWheelZoom: false });
    window.L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=' + data.mapboxToken, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 18,
      attribution: '© Mapbox © OpenStreetMap',
    }).addTo(map);
    const latlngs = data.points.map((p) => [p.lat, p.lng]);
    // Non-interactive: a click on the course must reach the map handler below.
    const line = window.L.polyline(latlngs, { color: ink, weight: 4, opacity: 0.85, interactive: false }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [18, 18] });
    const good = cssVar('--good', ink);
    const finish = cssVar('--accent-ink', ink);
    window.L.circleMarker(latlngs[0], { radius: 7, color: good, fillColor: good, fillOpacity: 1 }).addTo(map).bindTooltip('Départ');
    window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: finish, fillColor: finish, fillOpacity: 1 }).addTo(map).bindTooltip('Arrivée');
    const tick = cssVar('--ink-2', ink);
    (data.ticks || []).forEach((t) => {
      window.L.circleMarker([t.lat, t.lng], { radius: 2, color: tick, opacity: 0.6, fillOpacity: 0.6, interactive: false }).addTo(map);
    });
    const place = cssVar('--info', ink);
    const paper = cssVar('--surface', 'white');
    (data.landmarks || []).forEach((mark) => {
      if (mark.lat === null) return;
      window.L.circleMarker([mark.lat, mark.lng], { radius: 5, color: place, weight: 2, fillColor: paper, fillOpacity: 1 }).addTo(map).bindTooltip(document.createTextNode(mark.name));
    });
    if (canEdit) {
      // A click near the line proposes an announcement at that distance along the course.
      map.on('click', (event) => {
        call('POST', '/script/project', { lat: event.latlng.lat, lng: event.latlng.lng }).then((out) => {
          if (out.status !== 200) return;
          window.L.popup()
            .setLatLng(event.latlng)
            .setContent(
              '<div style="text-align:center">' + out.json.when +
                '<br><button type="button" class="btn btn-sm" data-role="place" data-meters="' + out.json.meters + '" style="margin-top:8px">Ajouter une annonce ici</button></div>',
            )
            .openOn(map);
        });
      });
    }
    paintMarkers();
  }

  function restoreDraft() {
    if (!canEdit) return;
    let stored = null;
    try {
      stored = window.localStorage.getItem(LS_KEY);
    } catch {
      stored = null;
    }
    if (!stored) return;
    if (!window.confirm('Des modifications faites sur cet appareil n’ont pas été sauvegardées. Les reprendre ?')) {
      try {
        window.localStorage.removeItem(LS_KEY);
      } catch {
        /* private mode */
      }
      return;
    }
    call('PUT', '/script', JSON.parse(stored)).then((out) => {
      if (out.status === 200) return void window.location.reload();
      // Refused as invalid: offering it again at every visit would not help. Kept on a network failure.
      if (out.status === 400) {
        try {
          window.localStorage.removeItem(LS_KEY);
        } catch {
          /* private mode */
        }
      }
      say('Impossible de reprendre ces modifications : ' + detailOf(out), 'bad');
    });
  }

  function start() {
    initMap();
    paintAll();
    restoreDraft();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
