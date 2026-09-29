// The result page's buttons. « Partager l'image » hands the picture on show to the phone's share
// sheet when the browser can share files (Instagram, WhatsApp, Messages take it as a photo),
// the link when it can only share text, and copies the link everywhere else. The format
// buttons swap the picture, its download and what is shared.
(() => {
  const print = document.querySelector('[data-print]');
  if (print) print.addEventListener('click', () => window.print());

  const flash = (button, text) => {
    const label = button.textContent;
    button.textContent = text;
    setTimeout(() => {
      button.textContent = label;
    }, 2000);
  };

  // Fetched ahead: iOS only opens the share sheet from a tap, and a download between the tap
  // and the sheet would spend it. One file per picture, kept once fetched.
  const files = new Map();
  const prefetch = (url, name) => {
    if (!url || files.has(url)) return;
    files.set(url, null);
    fetch(url)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => files.set(url, blob ? new File([blob], name, { type: 'image/png' }) : null))
      .catch(() => undefined);
  };

  const share = document.querySelector('[data-share]');
  if (share) {
    prefetch(share.dataset.card, `${share.dataset.file || 'sivoov'}.png`);
    share.addEventListener('click', async () => {
      const { url, text } = share.dataset;
      const card = files.get(share.dataset.card);
      try {
        if (card && navigator.canShare && navigator.canShare({ files: [card] })) {
          await navigator.share({ files: [card], text: `${text} ${url}` });
          return;
        }
        if (navigator.share) {
          await navigator.share({ text, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        flash(share, share.dataset.copied);
      } catch {
        // The runner closed the share sheet: nothing to do.
      }
    });
  }

  const copy = document.querySelector('[data-copy]');
  if (copy) {
    copy.addEventListener('click', () => {
      navigator.clipboard
        .writeText(copy.dataset.url)
        .then(() => flash(copy, copy.dataset.copied))
        .catch(() => undefined);
    });
  }

  const studio = document.querySelector('[data-share-studio]');
  const stage = studio && studio.querySelector('[data-stage]');
  if (!stage) return;
  const hint = studio.querySelector('[data-hint]');
  const download = studio.querySelector('[data-download]');

  // Without a PNG the card's own page shows in a frame at its real size, scaled to fit.
  const fit = () => {
    const frame = stage.querySelector('iframe');
    if (frame) frame.style.transform = `scale(${stage.clientWidth / frame.width})`;
  };
  window.addEventListener('resize', fit);
  fit();

  studio.querySelectorAll('[data-format]').forEach((button) => {
    button.addEventListener('click', () => {
      const { format, png, page, w, h } = button.dataset;
      studio.querySelectorAll('[data-format]').forEach((b) => b.setAttribute('aria-checked', String(b === button)));
      stage.className = `share-stage fmt-${format}`;
      stage.style.aspectRatio = `${w}/${h}`;
      stage.replaceChildren();
      if (png) {
        const img = document.createElement('img');
        img.src = png;
        img.width = Number(w);
        img.height = Number(h);
        img.alt = '';
        stage.append(img);
      } else {
        const frame = document.createElement('iframe');
        frame.src = page;
        frame.width = Number(w);
        frame.height = Number(h);
        frame.tabIndex = -1;
        stage.append(frame);
        fit();
      }
      if (hint) hint.textContent = button.dataset.hint;
      if (share && png) {
        share.dataset.card = png;
        prefetch(png, `${share.dataset.file || 'sivoov'}-${format}.png`);
      }
      if (download && png) {
        download.href = png;
        download.download = `${share ? share.dataset.file : 'sivoov'}-${format}.png`;
      }
    });
  });
})();
