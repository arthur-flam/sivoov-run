// Handing a picture to the phone's share sheet, for the page scripts that share one (the result
// page's cards, the race photos). The file is fetched ahead: iOS opens the share sheet only from a
// tap, and a download between the tap and the sheet would spend it. `sivoovShareFile.share`
// returns false when the browser cannot share files, so the caller falls back to the link.
window.sivoovShareFile = (() => {
  const files = new Map();
  const extension = (type) => ({ 'image/jpeg': 'jpg', 'image/webp': 'webp' })[type] || 'png';
  const prefetch = (url, name) => {
    if (!url || files.has(url)) return;
    files.set(url, null);
    fetch(url)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        const type = (blob && blob.type) || 'image/png';
        files.set(url, blob ? new File([blob], `${name}.${extension(type)}`, { type }) : null);
      })
      .catch(() => undefined);
  };
  const share = async (url, text) => {
    const file = files.get(url);
    if (!file || !navigator.canShare || !navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], text });
    return true;
  };
  return { prefetch, share };
})();
