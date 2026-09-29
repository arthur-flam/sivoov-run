// The photos page (shareFile.client.js runs before this script). Before a selfie goes, it is shrunk in the browser to 1600 px and re-encoded
// as JPEG: a phone's 12 MB original becomes a few hundred kB, and the re-encoding drops the
// photo's EXIF (where it was taken). While the picture is made (twenty seconds or more) the
// button says so and the page waits. « Partager » hands the picture to the share sheet.
(() => {
  const MAX = 1600;

  const shrink = (file) =>
    new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return resolve(file);
      createImageBitmap(file, { imageOrientation: 'from-image' })
        .then((bitmap) => {
          const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.88);
        })
        .catch(() => resolve(file));
    });

  document.querySelectorAll('[data-photo-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type=submit]');
      const data = new FormData(form);
      const photo = data.get('photo');
      if (photo instanceof File && photo.size > 0) data.set('photo', await shrink(photo));
      document.querySelectorAll('[data-photo-form] button').forEach((b) => (b.disabled = true));
      if (button) button.textContent = form.dataset.wait;
      form.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch(form.action, { method: 'POST', body: data });
        // The server answers with the page itself: after a redirect on success, or with the problem said.
        const html = await res.text();
        document.open();
        document.write(html);
        document.close();
        if (res.redirected) history.replaceState(null, '', res.url);
      } catch {
        form.submit();
      }
    });
  });

  document.querySelectorAll('[data-share-photo]').forEach((button) => {
    const url = button.dataset.sharePhoto;
    window.sivoovShareFile.prefetch(url, 'photo');
    button.addEventListener('click', async () => {
      try {
        if (!(await window.sivoovShareFile.share(url, button.dataset.title))) window.open(url, '_blank');
      } catch {
        // Closed the share sheet.
      }
    });
  });
})();
