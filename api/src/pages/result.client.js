// The result page's two buttons. Share hands the portrait card itself to the phone's share
// sheet when the browser can share files (Instagram, WhatsApp, Messages take it as a photo),
// the link when it can only share text, and copies the link everywhere else.
(() => {
  const share = document.querySelector('[data-share]');
  const print = document.querySelector('[data-print]');
  if (print) print.addEventListener('click', () => window.print());
  if (!share) return;

  // Fetched ahead: iOS only opens the share sheet from a tap, and a download between the tap
  // and the sheet would spend it.
  let card = null;
  const cardUrl = share.dataset.card;
  if (cardUrl) {
    fetch(cardUrl)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        card = blob ? new File([blob], 'finisher.png', { type: 'image/png' }) : null;
      })
      .catch(() => undefined);
  }

  const { url, text } = share.dataset;
  const label = share.textContent;
  share.addEventListener('click', async () => {
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
      share.textContent = share.dataset.copied;
      setTimeout(() => {
        share.textContent = label;
      }, 2000);
    } catch {
      // The runner closed the share sheet: nothing to do.
    }
  });
})();
