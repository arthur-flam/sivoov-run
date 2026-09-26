/*
 * The studio's browser half: no framework, no build step. It reads the page's JSON island,
 * draws the announcements on the map (studioMap.client.js, or the server-rendered SVG fallback
 * when there is no map), keeps the editor in sync, and talks to the organizer JSON endpoints.
 * Every position, status and sentence it paints comes from the Worker (shared estimates,
 * studioCopy.ts, sent as `data.copy`); the only arithmetic here is turning what the organizer
 * types (km, minutes, 6:30) into the meters and seconds the script stores, which mirrors
 * shared/src/domain/audioEditor.ts, and timing the start ceremony it plays back.
 * Writes go through one queue, so a save, an upload and a publish never cross.
 */
(function () {
  const island = document.getElementById('studio-data');
  if (!island) return;
  const data = JSON.parse(island.textContent || '{}');
  const base = data.base;
  const canEdit = data.canEdit === true;
  const copy = data.copy || {};
  const MOMENTS = ['start', 'course', 'always', 'finish'];
  const CUE_ORDER = ['armed', 'countdown', 'gun'];
  const LS_KEY = 'sivoov.studio.' + data.courseId + '.' + data.locale;
  const MAX_UPLOAD = 5 * 1024 * 1024;
  /** What the browser voice says for a field, when the real voice cannot: Camille Martin, at km 12. */
  const SAMPLES = {
    prenom: 'Camille',
    firstName: 'Camille',
    nom: 'Martin',
    lastName: 'Martin',
    dossard: 'mille deux cent quarante-sept',
    ville: 'Lyon',
    epreuve: 'marathon',
    km: 'douze',
    temps: 'une heure cinq',
    time: 'une heure cinq',
    temps_km: 'cinq minutes vingt-huit',
    splitTime: 'cinq minutes vingt-huit',
    allure: 'cinq minutes vingt-sept au kilomètre',
    pace: 'cinq minutes vingt-sept au kilomètre',
    arrivee_prevue: 'trois heures cinquante',
  };

  let selected = null;
  let saveTimer = null;
  let dirty = false;
  let writes = Promise.resolve();
  let map = null;
  let audio = null;
  let listenRun = 0;
  /** Seconds each sound lasts, measured from the file itself (metadata only), by line id and sound path. */
  const durations = {};

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
  const modeOf = (card) => card.getAttribute('data-mode') || 'voice';
  const checked = (card, role) => {
    const input = q('[data-role="' + role + '"]:checked', card);
    return input ? input.value : null;
  };
  /** The words alone, as a caption shows them: v3 tags out (mirrors stripAudioTags in shared). */
  const words = (text) =>
    String(text)
      .replace(/\[[^\][{}]{1,40}\]\s*/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  const estimate = (text) => Math.max(1, Math.round(words(text).length / (data.perSecond || 15)));

  function say(text, tone) {
    const node = q('[data-role="state"]');
    if (!node) return;
    node.textContent = text;
    node.className = 'st-state' + (tone ? ' ' + tone : '');
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
    if (kind === 'cue') {
      const order = value(card, 'when.cueOrder').trim();
      return /^\d+$/.test(order)
        ? { trigger: { kind: 'cue', at: value(card, 'when.cueAt'), order: Number(order) } }
        : { error: 'Indiquez l’ordre dans la cérémonie, par exemple 1.' };
    }
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

  /** A personal line's own part, from its fields, or the sentence that says what is missing. */
  function personalFrom(card) {
    if (checked(card, 'pkind') === 'ai') {
      const prompt = value(card, 'personal.prompt');
      return prompt ? { personal: { kind: 'ai', prompt: prompt } } : { error: 'Écrivez la consigne pour l’IA.' };
    }
    const template = value(card, 'personal.template');
    return template ? { personal: { kind: 'template', template: template } } : { error: 'Écrivez la phrase personnalisée, avec ses champs entre accolades.' };
  }

  /** One line of the script from its card, or its error. The file stays whatever the card carries. */
  function lineFrom(card) {
    const id = card.getAttribute('data-line');
    const when = triggerFrom(card);
    const mode = modeOf(card);
    const own = mode === 'personal' ? personalFrom(card) : {};
    const error = when.error || own.error;
    const errorNode = q('[data-role="when-error"]', card);
    if (errorNode) {
      errorNode.textContent = error || '';
      errorNode.hidden = !error;
    }
    if (error) return { error: error };
    const repeat = field(card, 'repeat');
    const previous = scriptLine(id);
    const file = mode === 'file' ? audioOf(card) : null;
    const line = {
      id: id,
      title: value(card, 'title'),
      category: value(card, 'category'),
      mix: value(card, 'mix'),
      priority: Number(value(card, 'priority') || 5),
      once: repeat ? !repeat.checked : true,
      trigger: when.trigger,
      key: value(card, 'key') || (previous ? previous.key : data.courseId + '-' + id.replace(/\W+/g, '-')),
      text: value(card, 'text'),
    };
    return { line: Object.assign({}, line, own.personal ? { personal: own.personal } : {}, file ? { audio: file } : {}) };
  }

  /** The whole script from the page, or null when a field needs fixing first. */
  function scriptFrom(voice) {
    const built = cards().map(lineFrom);
    if (built.some((b) => b.error)) return null;
    return { voice: voice || data.script.voice, lines: built.map((b) => b.line) };
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

  /** Shows the parts of the editor that belong to the card's mode (voice, personal, file) and personal kind. */
  function showMode(card) {
    const mode = modeOf(card);
    qa('[data-sound]', card).forEach((box) => box.classList.toggle('hide', box.getAttribute('data-sound').split(' ').indexOf(mode) < 0));
    const pkind = checked(card, 'pkind') || 'template';
    qa('[data-pkind]', card).forEach((box) => box.classList.toggle('hide', box.getAttribute('data-pkind') !== pkind));
    const option = (copy.sound || []).find((o) => o.key === mode);
    setText(card, 'sound-hint', option ? option.hint : '');
    setText(card, 'text-label', mode === 'personal' ? 'Version hors ligne' : 'Texte lu');
    setText(card, 'text-hint', mode === 'personal' ? copy.fallbackHint || '' : copy.voiceHint || '');
    setText(card, 'listen-word', mode === 'personal' ? 'Écouter hors ligne' : 'Écouter');
    const render = q('[data-role="render"]', card);
    if (render) render.hidden = mode === 'file';
    const suggest = q('[data-role="suggest"]', card);
    if (suggest) suggest.hidden = mode === 'file';
  }

  function excerptFor(card, file) {
    const mode = modeOf(card);
    if (mode === 'file' && file) return 'Votre fichier : ' + (file.name || 'son importé');
    if (mode === 'personal') {
      return checked(card, 'pkind') === 'ai' ? 'IA : ' + value(card, 'personal.prompt') : words(value(card, 'personal.template'));
    }
    return words(value(card, 'text'));
  }

  function paintCard(card) {
    const id = card.getAttribute('data-line');
    const status = statusOf(id);
    const line = scriptLine(id);
    const file = line ? line.audio || null : audioOf(card);
    card.setAttribute('data-audio', file ? JSON.stringify(file) : '');
    setText(card, 'name', value(card, 'title') || 'Sans titre');
    setText(card, 'excerpt', excerptFor(card, file));
    if (status) {
      setText(card, 'when', status.when);
      const flag = q('[data-role="flag"]', card);
      if (flag) {
        flag.textContent = status.label;
        flag.className = 'badge ' + status.tone;
      }
      const issues = q('[data-role="issues"]', card);
      if (issues) {
        issues.textContent = '';
        (status.problems || []).forEach((problem) => {
          const li = document.createElement('li');
          li.textContent = problem;
          issues.appendChild(li);
        });
      }
      if (status.personal) setText(card, 'phase', status.personal.kind === 'ai' ? copy.phase.ai : copy.phase[status.personal.phase]);
    }
    const fileBox = q('[data-role="file"]', card);
    if (fileBox) fileBox.hidden = !file;
    if (file) setText(card, 'file-name', file.name || 'Votre fichier');
    setText(card, 'upload-word', file ? 'Remplacer le fichier' : 'Choisir un fichier audio');
    const render = q('[data-role="render"]', card);
    if (render) {
      render.disabled = !data.ttsReady || !status || status.rendered || status.issues.some((i) => i.code === 'no_text');
      render.textContent = status && status.rendered ? 'Voix enregistrée' : 'Enregistrer la voix';
    }
    showMode(card);
    measure(card);
  }

  function measure(card) {
    const n = words(value(card, 'text')).length;
    setText(card, 'measure', n.toLocaleString('fr-FR') + (n > 1 ? ' caractères' : ' caractère') + ' · environ ' + estimate(value(card, 'text')) + ' s');
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
    if (renderAll) renderAll.hidden = toRecord().length === 0;
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
    if (map) map.paint(data.firings || [], { selected: selected, categoryOf: categoryOf, titleOf: titleOf });
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
    paintCeremony();
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
    if (map) map.focus(id);
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

  /* ---------- the start ceremony: what plays before the clock, and where the clock starts ---------- */

  /** The ceremony's lines in play order: moment, then order, then list order (mirrors ceremonySequence). */
  function ceremonyLines() {
    return (data.lines || [])
      .map((status, i) => ({ status: status, i: i }))
      .filter((x) => x.status.cue)
      .sort((a, b) => CUE_ORDER.indexOf(a.status.cue.at) - CUE_ORDER.indexOf(b.status.cue.at) || a.status.cue.order - b.status.cue.order || a.i - b.i)
      .map((x) => x.status);
  }

  /** How long a line lasts: its sound file when there is one (measured once), otherwise its text read at speaking speed. */
  function secondsOf(status) {
    const known = status.audioPath ? durations[status.id + '|' + status.audioPath] : undefined;
    if (known !== undefined && known !== null) return { seconds: known, measured: true };
    const card = cardFor(status.id);
    return { seconds: estimate(card ? value(card, 'text') : ''), measured: false };
  }

  function measureDurations(lines) {
    lines
      .filter((s) => s.audioPath && durations[s.id + '|' + s.audioPath] === undefined)
      .forEach((s) => {
        const key = s.id + '|' + s.audioPath;
        durations[key] = null;
        const probe = new window.Audio();
        probe.preload = 'metadata';
        probe.addEventListener('loadedmetadata', () => {
          if (Number.isFinite(probe.duration)) {
            durations[key] = probe.duration;
            paintCeremony();
          }
        });
        probe.src = base + s.audioPath;
      });
  }

  function paintCeremony() {
    const steps = q('[data-role="ceremony-steps"]');
    const note = q('[data-role="ceremony-note"]');
    if (!steps || !note) return;
    const c = copy.ceremony || {};
    const lines = ceremonyLines();
    measureDurations(lines);
    steps.textContent = '';
    const gunAt = lines.findIndex((s) => s.cue.at === 'gun');
    const labels = { armed: 'Sur la ligne', countdown: 'Compte à rebours', gun: 'Coup de pistolet' };
    const total = lines.slice(0, gunAt < 0 ? lines.length : gunAt).reduce((sum, s) => sum + (secondsOf(s).seconds || 0), 0);
    lines.forEach((status, i) => {
      const item = document.createElement('li');
      item.className = 'cer-step at-' + status.cue.at + (i === gunAt ? ' gun' : '');
      const time = secondsOf(status);
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'cer-name';
      head.setAttribute('data-event', status.id);
      head.textContent = labels[status.cue.at] + ' · ' + titleOf(status.id);
      const meta = document.createElement('span');
      meta.className = 'cer-meta';
      meta.textContent = (time.seconds ? (time.measured ? '' : 'environ ') + Math.round(time.seconds) + ' s' : '') + (status.personal ? ' · personnalisée' : '');
      item.appendChild(head);
      item.appendChild(meta);
      if (status.cue.at === 'countdown' || i === gunAt) {
        const why = document.createElement('span');
        why.className = 'cer-why';
        why.textContent = i === gunAt ? c.gun : c.countdown;
        item.appendChild(why);
      }
      steps.appendChild(item);
    });
    const notes = [];
    if (lines.length === 0) notes.push(c.none);
    else {
      notes.push(Math.round(total) + ' s ' + c.before + '.');
      if (gunAt < 0) notes.push(c.noGun);
      if (!lines.some((s) => s.cue.at === 'countdown')) notes.push(c.noCountdown);
    }
    note.textContent = notes.join(' ');
    const play = q('[data-role="ceremony-play"]');
    if (play) play.hidden = lines.length === 0;
  }

  /** What the runner's screen shows while the ceremony plays: "Sur la ligne", the digits, then the clock from 0:00. */
  function screen(text) {
    const node = q('[data-role="ceremony-screen"]');
    if (!node) return;
    node.hidden = text === null;
    node.textContent = text || '';
  }

  const clock = (ms) => {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  /**
   * Plays the ceremony as the runner will hear it, back to back, with the runner's screen beside
   * it: the digits read from the countdown sound's own remaining time, the clock starting when the
   * gun sound starts. Lines with no sound yet are read by the browser voice.
   */
  function playCeremony() {
    listenRun += 1;
    const run = listenRun;
    const lines = ceremonyLines();
    const gunAt = lines.findIndex((s) => s.cue.at === 'gun');
    let started = null;
    let timer = null;
    const tick = (fn) => {
      if (timer) window.clearInterval(timer);
      timer = window.setInterval(() => (run === listenRun ? fn() : window.clearInterval(timer)), 200);
    };
    (canEdit ? flush() : Promise.resolve())
      .then(() =>
        lines.reduce(
          (chain, status, i) =>
            chain.then(() => {
              if (run !== listenRun) return undefined;
              select(status.id, {});
              if (i === gunAt) {
                started = Date.now();
                tick(() => screen('Chrono ' + clock(Date.now() - started)));
                screen('Chrono 0:00');
              } else if (started === null) {
                if (status.cue.at === 'countdown') tick(() => screen(audio && Number.isFinite(audio.duration) ? String(Math.max(1, Math.ceil(audio.duration - audio.currentTime))) : '…'));
                else screen('Sur la ligne');
              }
              return play(status.id);
            }),
          Promise.resolve(),
        ),
      )
      .then(() => {
        if (run !== listenRun) return;
        if (started === null) {
          started = Date.now();
          tick(() => screen('Chrono ' + clock(Date.now() - started)));
        }
        window.setTimeout(() => {
          if (timer) window.clearInterval(timer);
          screen(null);
        }, 3000);
      });
  }

  /* ---------- listening ---------- */

  function speak(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(words(text).replace(/\{\s*(\w+)\s*\}/g, (_, name) => SAMPLES[name] || name));
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

  function playPath(path, fallbackText) {
    stopListening();
    audio = new window.Audio(base + path);
    const current = audio;
    return new Promise((resolve) => {
      current.addEventListener('ended', () => resolve());
      current.addEventListener('error', () => speak(fallbackText).then(resolve));
      current.play().catch(() => speak(fallbackText).then(resolve));
    });
  }

  /** A line as everyone hears it: its sound when recorded, otherwise the browser voice reading its text. */
  function play(id) {
    const card = cardFor(id);
    if (!card) return Promise.resolve();
    const status = statusOf(id);
    const text = value(card, 'text') || (modeOf(card) === 'personal' ? value(card, 'personal.template') : '');
    if (!status || !status.audioPath) {
      stopListening();
      say('Voix de l’ordinateur : la voix de l’annonceur n’est pas encore enregistrée pour ce texte.');
      return speak(text);
    }
    say('Lecture : ' + (value(card, 'title') || 'annonce'));
    return playPath(status.audioPath, text);
  }

  function listen(id) {
    listenRun += 1;
    screen(null);
    return (canEdit ? flush() : Promise.resolve()).then(() => play(id));
  }

  function listenAll() {
    listenRun += 1;
    screen(null);
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

  /** « Écouter un exemple »: the personal line as Camille Martin would hear it, read by the real voice when possible. */
  function sample(id) {
    const card = cardFor(id);
    if (!card) return;
    listenRun += 1;
    flush().then(() => {
      say('Préparation de l’exemple…', 'busy');
      return call('POST', '/script/sample', { lineId: id }).then((out) => {
        if (out.status !== 200) return void say(detailOf(out), 'bad');
        const box = q('[data-role="sample"]', card);
        if (box) box.hidden = false;
        setText(card, 'sample-text', words(out.json.text));
        say('Exemple : ' + (value(card, 'title') || 'annonce'));
        return out.json.audioPath ? playPath(out.json.audioPath, out.json.text) : speak(out.json.text);
      });
    });
  }

  /* ---------- the voice, files, suggestions, publishing ---------- */

  const toRecord = () => (data.lines || []).filter((l) => l.issues.length === 0 && l.source !== 'upload' && !l.rendered);

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
    const todo = toRecord().map((l) => l.id);
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
        const left = toRecord().length;
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
          const card = cardFor(id);
          if (card) card.setAttribute('data-mode', 'file');
          apply(out.json);
          say('Fichier ajouté : il est joué à la place de la voix.');
        });
      }),
    );
  }

  /** The line forgets its file (which stays stored) and goes back to the mode the organizer picked. */
  function unfile(id, mode) {
    return flush().then(() =>
      write(() =>
        call('DELETE', '/script/lines/' + encodeURIComponent(id) + '/audio').then((out) => {
          if (out.status !== 200) {
            say(detailOf(out), 'bad');
            return;
          }
          const card = cardFor(id);
          if (card) {
            card.setAttribute('data-audio', '');
            card.setAttribute('data-mode', mode);
          }
          apply(out.json);
          if (mode === 'personal') saveSoon();
          say(mode === 'personal' ? 'Votre fichier n’est plus utilisé : écrivez la phrase personnalisée.' : 'Cette annonce est de nouveau lue par la voix.');
        }),
      ),
    );
  }

  /** The organizer picked what the runner hears. Leaving a file behind asks first; the file stays stored. */
  function changeMode(card, mode) {
    const id = card.getAttribute('data-line');
    const previous = modeOf(card);
    if (previous === 'file' && audioOf(card) && mode !== 'file') {
      if (!window.confirm('Ne plus utiliser votre fichier pour cette annonce ?')) {
        const back = q('[data-role="sound"][value="file"]', card);
        if (back) back.checked = true;
        return;
      }
      return void unfile(id, mode);
    }
    card.setAttribute('data-mode', mode);
    if (mode === 'personal' && !value(card, 'personal.template') && !value(card, 'personal.prompt')) {
      const template = field(card, 'personal.template');
      if (template) window.setTimeout(() => template.focus(), 0);
    }
    showMode(card);
    if (mode === 'file') {
      const input = q('[data-role="upload"]', card);
      if (input && !audioOf(card)) input.click();
      return;
    }
    saveSoon();
  }

  /** Inserts a field or a tag where the caret was, in the text box it belongs to. */
  function insert(card, button) {
    const token = button.getAttribute('data-insert');
    const group = button.closest('[data-role]').getAttribute('data-role');
    const target = group === 'fields' ? field(card, 'personal.template') : card.lastText && card.contains(card.lastText) ? card.lastText : field(card, 'text');
    if (!target || target.disabled) return;
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    const before = target.value.slice(0, start);
    const spaced = before.length > 0 && !/\s$/.test(before) && token[0] !== '…' ? ' ' + token : token;
    target.value = before + spaced + target.value.slice(end);
    target.focus();
    target.setSelectionRange(start + spaced.length, start + spaced.length);
    paintCard(card);
    saveSoon();
  }

  function suggest(id) {
    const card = cardFor(id);
    if (!card) return;
    flush().then(() => {
      say('L’IA écrit une proposition…', 'busy');
      return call('POST', '/script/suggest', { lineId: id }).then((out) => {
        if (out.status !== 200) return void say(detailOf(out), 'bad');
        const box = q('[data-role="suggestion"]', card);
        if (!box) return;
        box.hidden = false;
        box.setAttribute('data-text', out.json.text);
        setText(card, 'suggestion-text', out.json.text);
        say('Proposition prête : relisez-la avant de l’utiliser.');
      });
    });
  }

  function useSuggestion(card, keep) {
    const box = q('[data-role="suggestion"]', card);
    if (!box) return;
    if (keep) {
      const text = field(card, 'text');
      if (text) text.value = box.getAttribute('data-text') || '';
      paintCard(card);
      saveSoon();
    }
    box.hidden = true;
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

  /* ---------- the voice panel ---------- */

  let voices = null;
  let pick = null;

  const stabilityOf = (v) => (v.stability === undefined ? 0.5 : v.stability);
  const sameVoice = (a, b) => a.id === b.id && a.model === b.model && stabilityOf(a) === stabilityOf(b);

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === 'text') node.textContent = attrs[k];
      else if (attrs[k] !== false && attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  function voiceRow(v) {
    const radio = el('input', { type: 'radio', name: 'voice-id', value: v.id, 'data-name': v.name, checked: pick.id === v.id });
    return el('div', { class: 'vp-voice' }, [
      el('label', {}, [radio, el('b', { text: v.name }), el('span', { text: v.note || '' })]),
      el('button', { type: 'button', class: 'btn btn-sm btn-quiet', 'data-role': 'voice-try', 'data-id': v.id, 'data-name': v.name, 'aria-label': 'Écouter ' + v.name, text: '▶' }),
    ]);
  }

  function paintVoicePanel() {
    const panel = q('[data-role="voice-panel"]');
    if (!panel || !voices) return;
    panel.textContent = '';
    const known = voices.house.concat(voices.account || []).some((v) => v.id === pick.id);
    panel.appendChild(el('h3', { text: 'La voix de la course' }));
    panel.appendChild(el('p', { class: 'hint', text: 'Une seule voix pour toute la course. Écoutez-les sur une phrase avec le nom de votre course, puis choisissez.' }));
    panel.appendChild(el('div', { class: 'vp-list' }, voices.house.map(voiceRow)));
    if (voices.account && voices.account.length > 0) {
      panel.appendChild(el('h4', { text: 'Les voix de votre compte ElevenLabs' }));
      panel.appendChild(el('div', { class: 'vp-list' }, voices.account.map(voiceRow)));
    }
    panel.appendChild(
      el('p', {
        class: 'hint',
        text:
          'Ces voix parlent français avec un léger accent anglais. Pour une voix française native, ajoutez-la à votre compte depuis la Voice Library d’ElevenLabs et collez son identifiant ci-dessous.' +
          (voices.accountNote ? ' ' + voices.accountNote : ''),
      }),
    );
    panel.appendChild(
      el('div', { class: 'vp-custom' }, [
        el('label', { for: 'vp-custom', text: 'Identifiant d’une autre voix ElevenLabs' }),
        el('input', { id: 'vp-custom', type: 'text', 'data-role': 'voice-custom', value: known ? '' : pick.id, placeholder: 'par exemple 21m00Tcm4TlvDq8ikWAM', spellcheck: 'false' }),
        el('button', { type: 'button', class: 'btn btn-sm', 'data-role': 'voice-try', 'data-custom': 'true', text: '▶ Écouter' }),
      ]),
    );
    panel.appendChild(el('h4', { text: 'Le moteur' }));
    panel.appendChild(
      el(
        'div',
        { class: 'vp-list' },
        voices.models.map((m) =>
          el('label', { class: 'vp-opt' }, [el('input', { type: 'radio', name: 'voice-model', value: m.id, checked: pick.model === m.id }), el('b', { text: m.label }), el('span', { text: m.note })]),
        ),
      ),
    );
    if (pick.model === 'eleven_v3') {
      panel.appendChild(el('h4', { text: 'Le jeu' }));
      panel.appendChild(
        el(
          'div',
          { class: 'vp-list vp-row' },
          voices.stabilities.map((s) =>
            el('label', { class: 'vp-opt' }, [
              el('input', { type: 'radio', name: 'voice-stability', value: String(s.value), checked: stabilityOf(pick) === s.value }),
              el('b', { text: s.label }),
              el('span', { text: s.note }),
            ]),
          ),
        ),
      );
    }
    const changed = !sameVoice(pick, data.script.voice);
    const recorded = (data.lines || []).filter((l) => l.source !== 'upload' && l.rendered).length;
    panel.appendChild(
      el('div', { class: 'vp-foot' }, [
        el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-role': 'voice-use', disabled: !changed, text: 'Utiliser cette voix' }),
        el('button', { type: 'button', class: 'btn btn-sm btn-quiet', 'data-role': 'voice-close', text: 'Fermer' }),
        el('span', { class: 'hint', 'data-role': 'voice-cost', text: changed && recorded > 0 ? 'Les ' + recorded + ' annonces déjà enregistrées seront à réenregistrer avec cette voix.' : '' }),
      ]),
    );
  }

  function readPick(panel) {
    const id = q('input[name="voice-id"]:checked', panel);
    const custom = q('[data-role="voice-custom"]', panel);
    const customId = custom ? custom.value.trim() : '';
    const model = q('input[name="voice-model"]:checked', panel);
    const stability = q('input[name="voice-stability"]:checked', panel);
    const next = {
      id: customId || (id ? id.value : pick.id),
      name: customId ? (customId === data.script.voice.id ? data.script.voice.name : 'Voix ' + customId.slice(0, 6)) : id ? id.getAttribute('data-name') : pick.name,
      model: model ? model.value : pick.model,
    };
    if (next.model === 'eleven_v3' && stability && Number(stability.value) !== 0.5) next.stability = Number(stability.value);
    return next;
  }

  function openVoicePanel() {
    const panel = q('[data-role="voice-panel"]');
    const button = q('[data-role="voice-open"]');
    if (!panel) return;
    if (!panel.hidden) return void closeVoicePanel();
    panel.hidden = false;
    if (button) button.setAttribute('aria-expanded', 'true');
    pick = Object.assign({}, data.script.voice);
    if (voices) return void paintVoicePanel();
    panel.textContent = 'Chargement des voix…';
    call('GET', '/voices').then((out) => {
      if (out.status !== 200) return void (panel.textContent = detailOf(out));
      voices = out.json;
      paintVoicePanel();
    });
  }

  function closeVoicePanel() {
    const panel = q('[data-role="voice-panel"]');
    const button = q('[data-role="voice-open"]');
    if (panel) panel.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function tryVoice(target) {
    const panel = q('[data-role="voice-panel"]');
    const current = readPick(panel);
    const voice = target.getAttribute('data-custom') ? current : Object.assign({}, current, { id: target.getAttribute('data-id'), name: target.getAttribute('data-name') });
    if (!voice.id) return void say('Collez d’abord l’identifiant de la voix.', 'bad');
    say('Enregistrement d’un essai avec ' + voice.name + '…', 'busy');
    call('POST', '/voice/sample', { voice: voice }).then((out) => {
      if (out.status !== 200) return void say(detailOf(out), 'bad');
      say('Essai : ' + voice.name);
      playPath(out.json.audioPath, out.json.text);
    });
  }

  function useVoice() {
    const panel = q('[data-role="voice-panel"]');
    const voice = readPick(panel);
    const script = scriptFrom(voice);
    if (!script) return void say('Corrigez d’abord le champ indiqué en rouge.', 'bad');
    flush().then(() =>
      write(() => {
        say('Changement de voix…', 'busy');
        return call('PUT', '/script', script).then((out) => {
          if (out.status !== 200) return void say('Pas changé : ' + detailOf(out), 'bad');
          say('Voix changée. Enregistrez les voix des annonces avant de publier.');
          window.setTimeout(() => window.location.reload(), 900);
        });
      }),
    );
  }

  /* ---------- adding, duplicating, removing ---------- */

  const freshId = () => 'annonce.' + Date.now().toString(36);

  /** A copy of a card (or of the blank template) under a new id: ids, labels and radio groups follow. */
  function cloneAs(source, id) {
    const oldId = source.getAttribute('data-line');
    const card = source.cloneNode(true);
    card.setAttribute('data-line', id);
    card.classList.remove('on', 'open');
    qa('[id]', card).forEach((n) => n.setAttribute('id', id + n.getAttribute('id').slice(oldId.length)));
    qa('[for]', card).forEach((n) => n.setAttribute('for', id + n.getAttribute('for').slice(oldId.length)));
    qa('input[type="radio"]', card).forEach((n) => n.setAttribute('name', id + n.getAttribute('name').slice(oldId.length)));
    // A renamed radio group can drop its checked state: copy it from the source.
    const twins = qa('input[type="radio"]', card);
    qa('input[type="radio"]', source).forEach((n, i) => {
      if (twins[i]) twins[i].checked = n.checked;
    });
    const box = q('[data-role="suggestion"]', card);
    if (box) box.hidden = true;
    const example = q('[data-role="sample"]', card);
    if (example) example.hidden = true;
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
    if (trigger.kind === 'cue') {
      setField(card, 'when.cueAt', trigger.at);
      setField(card, 'when.cueOrder', String(trigger.order));
    }
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

  /** A new line in the départ group joins the ceremony, after the last line on the line. */
  const nextCue = () => ({
    kind: 'cue',
    at: 'armed',
    order: 1 + ceremonyLines().filter((s) => s.cue.at === 'armed').reduce((max, s) => Math.max(max, s.cue.order), 0),
  });

  const DEFAULT_TRIGGER = {
    start: nextCue,
    course: () => ({ kind: 'distance', meters: 1000 }),
    always: () => ({ kind: 'split', everyMeters: 1000 }),
    finish: () => ({ kind: 'finish' }),
  };

  const ACTIONS = [
    'toggle',
    'listen',
    'listen-all',
    'render',
    'duplicate',
    'delete',
    'render-all',
    'publish',
    'add',
    'place',
    'sample-play',
    'suggest',
    'suggestion-use',
    'suggestion-drop',
    'ceremony-play',
    'voice-open',
    'voice-close',
    'voice-try',
    'voice-use',
  ];
  const ACTION_SELECTOR = ACTIONS.map((role) => '[data-role="' + role + '"]').join(', ') + ', [data-event], [data-insert]';

  document.addEventListener('click', (event) => {
    const target = event.target.closest ? event.target.closest(ACTION_SELECTOR) : null;
    if (!target) return;
    const role = target.getAttribute('data-role');
    const card = target.closest('.ev');
    const id = card ? card.getAttribute('data-line') : null;
    if (role === 'toggle' && id) return void (selected === id ? unselect() : select(id, { fromList: true }));
    if (role === 'listen' && id) return void listen(id);
    if (role === 'listen-all') return void listenAll();
    if (role === 'ceremony-play') return void playCeremony();
    if (!canEdit) {
      if (target.hasAttribute('data-event')) select(target.getAttribute('data-event'), {});
      return;
    }
    if (target.hasAttribute('data-insert') && card) return void insert(card, target);
    if (role === 'sample-play' && id) return void sample(id);
    if (role === 'render' && id) return void render(id);
    if (role === 'suggest' && id) return void suggest(id);
    if (role === 'suggestion-use' && card) return void useSuggestion(card, true);
    if (role === 'suggestion-drop' && card) return void useSuggestion(card, false);
    if (role === 'duplicate' && id) return void duplicate(id);
    if (role === 'delete' && id) return void remove(id);
    if (role === 'render-all') return void renderAll();
    if (role === 'publish') return void publish();
    if (role === 'voice-open') return void openVoicePanel();
    if (role === 'voice-close') return void closeVoicePanel();
    if (role === 'voice-try') return void tryVoice(target);
    if (role === 'voice-use') return void useVoice();
    if (role === 'add') {
      const moment = target.getAttribute('data-moment');
      return void add(moment, DEFAULT_TRIGGER[moment]());
    }
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
    const role = event.target.getAttribute('data-role');
    if (role === 'upload') {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      return void upload(card.getAttribute('data-line'), file);
    }
    if (role === 'sound') return void changeMode(card, event.target.value);
    if (role === 'pkind') {
      showMode(card);
      paintCard(card);
      return void saveSoon();
    }
    if (name === 'when.kind') showTriggerFields(card);
    if (name === 'text' || name === 'title' || name === 'personal.template' || name === 'personal.prompt') paintCard(card);
    saveSoon();
  };
  // Typing saves as it goes; radios, selects, checkboxes and files save on change.
  document.addEventListener('input', (event) => {
    const t = event.target;
    if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text')) {
      if (t.closest && t.closest('[data-role="voice-panel"]')) return;
      onEdit(event);
    }
  });
  document.addEventListener('change', (event) => {
    const t = event.target;
    if (!t.getAttribute) return;
    if (t.closest && t.closest('[data-role="voice-panel"]')) {
      const panel = q('[data-role="voice-panel"]');
      pick = readPick(panel);
      if (t.name === 'voice-model') return void paintVoicePanel();
      const use = q('[data-role="voice-use"]', panel);
      if (use) use.disabled = sameVoice(pick, data.script.voice);
      return;
    }
    if (t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio' || t.type === 'file') onEdit(event);
  });
  // Tags go into the text box last written in: the everyone/offline text or the personal sentence.
  document.addEventListener('focusin', (event) => {
    const card = event.target.closest ? event.target.closest('.ev') : null;
    if (card && event.target.tagName === 'TEXTAREA' && event.target.name !== 'personal.prompt') card.lastText = event.target;
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
    map = window.SivoovStudioMap
      ? window.SivoovStudioMap.create({
          host: host,
          points: data.points,
          ticks: data.ticks,
          landmarks: data.landmarks,
          token: data.mapboxToken,
          canEdit: canEdit,
          onPick: (id) => select(id, { fromMap: true }),
          onProject: (lat, lng) => call('POST', '/script/project', { lat: lat, lng: lng }).then((out) => (out.status === 200 ? out.json : null)),
        })
      : null;
    if (!map) {
      if (host) host.classList.add('hide');
      if (fallback) fallback.classList.remove('hide');
      return;
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
