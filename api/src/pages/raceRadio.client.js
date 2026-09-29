// « Écoutez la course » on the race page (pages/raceRadio.tsx): the demo reel drives the page.
// Everything follows the audio's own time: the chapter (title and the speaker's words), the
// distance, the runner's dot on the course, the trodden line, the countdown digits before the
// gun and the race clock after it. Without this script the page keeps a plain audio player.
(() => {
  const root = document.getElementById('ecouter');
  const dataNode = document.getElementById('radio-data');
  if (!root || !dataNode) return;
  const data = JSON.parse(dataNode.textContent || '{}');
  const q = (role) => root.querySelector(`[data-role="${role}"]`);
  const audio = q('audio');
  const play = q('play');
  const playLabel = q('play-label');
  const clockNode = q('clock');
  const kmNode = q('km');
  const chapterNode = q('chapter');
  const captionNode = q('caption');
  const runner = q('runner');
  const trodden = q('trodden');
  const bar = q('bar');
  const progress = q('progress');
  root.classList.add('is-live');
  audio.controls = false;

  const chapters = data.chapters;
  const pace = data.paceSecPerKm || 300;
  const at = (mark) => chapters.find((c) => c.mark === mark);
  const countdown = at('countdown');
  const gun = at('gun');
  const finish = at('finish');
  const officialKm = data.officialM / 1000;

  const indexAt = (t) => chapters.reduce((found, c, i) => (c.t <= t ? i : found), 0);

  /** Kilometres covered at reel time t: each chapter's km, moving on towards the next one. */
  const kmAt = (t) => {
    const i = indexAt(t);
    const here = chapters[i];
    const next = chapters[i + 1];
    if (!next || next.km <= here.km) return here.km;
    return here.km + ((next.km - here.km) * (t - here.t)) / (next.t - here.t);
  };

  /** The dot's place on the drawing, from the distance covered. */
  const pointAt = (m) => {
    const pts = data.points;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if (m <= b[2] || i === pts.length - 1) {
        const f = b[2] > a[2] ? Math.min(1, Math.max(0, (m - a[2]) / (b[2] - a[2]))) : 0;
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
    }
    return [pts[0][0], pts[0][1]];
  };

  const fmtKm = (km) => `${km.toFixed(2).replace('.', data.locale === 'fr' ? ',' : '.')} km`;
  const fmtClock = (s) => {
    const whole = Math.max(0, Math.floor(s));
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const sec = String(whole % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

  let shown = -1;
  const paint = () => {
    const t = audio.currentTime || 0;
    const i = indexAt(t);
    if (i !== shown) {
      shown = i;
      chapterNode.textContent = chapters[i].title;
      captionNode.textContent = chapters[i].caption;
      root.querySelectorAll('[data-index]').forEach((b) => b.setAttribute('aria-current', b.getAttribute('data-index') === String(i) ? 'true' : 'false'));
    }
    const km = kmAt(t);
    const m = km * 1000;
    const [x, y] = pointAt(m);
    runner.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    trodden.style.strokeDashoffset = String(1000 - (1000 * Math.min(m, data.officialM)) / data.officialM);
    kmNode.textContent = fmtKm(km);
    if (gun && t >= gun.t) {
      const raceKm = finish && t >= finish.t ? officialKm : km;
      clockNode.textContent = fmtClock(raceKm * pace);
      clockNode.classList.remove('is-count', 'is-words');
    } else if (countdown && t >= countdown.t) {
      // The seconds left to the gun, never more than the countdown's ten (a gap may sit before the gun).
      clockNode.textContent = String(gun ? Math.min(10, Math.max(1, Math.ceil(gun.t - t))) : Math.max(1, 10 - Math.floor(t - countdown.t)));
      clockNode.classList.remove('is-words');
      clockNode.classList.add('is-count');
    } else {
      clockNode.textContent = data.words.onTheLine;
      clockNode.classList.remove('is-count');
      clockNode.classList.add('is-words');
    }
    bar.style.width = `${Math.min(100, (100 * t) / (audio.duration || data.duration))}%`;
  };

  let frame = 0;
  const loop = () => {
    paint();
    if (!audio.paused) frame = requestAnimationFrame(loop);
  };
  const setPlaying = (on) => {
    root.classList.toggle('is-playing', on);
    const label = on ? data.words.pause : audio.currentTime > 0 ? data.words.resume : data.words.play;
    playLabel.textContent = label;
    play.setAttribute('aria-label', label);
  };

  audio.addEventListener('play', () => {
    setPlaying(true);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(loop);
  });
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => setPlaying(false));
  audio.addEventListener('seeked', paint);
  play.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().catch(() => undefined);
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      audio.pause();
    }
  });
  const seek = (t) => {
    audio.currentTime = t;
    paint();
    if (audio.paused) audio.play().catch(() => undefined);
  };
  progress.addEventListener('click', (e) => {
    const box = progress.getBoundingClientRect();
    seek(((e.clientX - box.left) / box.width) * (audio.duration || data.duration));
  });
  root.querySelectorAll('[data-seek]').forEach((b) => b.addEventListener('click', () => seek(Number(b.getAttribute('data-seek')))));
  // The hero's « Écouter la course » button starts the reel here.
  document.querySelectorAll('[data-listen]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      audio.play().catch(() => undefined);
    }),
  );
  paint();
})();
