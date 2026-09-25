import { IMAGE_MAX_BYTES, isReadable } from '@sivoov/shared';
import type { ImageSlot, Race } from '@sivoov/shared';
import type { SettingsCardProps } from './settingsRace';
import { Card, ColorInput, Field, Flash, Icon, ImageFrame } from './ui';

export type ImageError = { slot: ImageSlot; message: string };

/**
 * Live preview of the colors as they are picked, and the contrast warning. The ratio is the
 * WCAG one, the same as `contrastRatio` in shared/src/domain/contrast.ts, which the page uses
 * for its first render.
 */
const PREVIEW_JS = `(() => {
  const form = document.getElementById('colors-form');
  if (!form) return;
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const update = () => {
    const primary = form.elements.primary.value;
    const onPrimary = form.elements.onPrimary.value;
    const preview = form.querySelector('.theme-preview');
    preview.style.setProperty('--race-primary', primary);
    preview.style.setProperty('--race-on-primary', onPrimary);
    form.querySelectorAll('[data-code-for]').forEach((el) => { el.textContent = document.getElementById(el.dataset.codeFor).value; });
    const [a, b] = [lum(primary), lum(onPrimary)];
    form.querySelector('[data-contrast]').classList.toggle('hide', (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5);
  };
  form.addEventListener('input', update);
})();`;

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} Mo`;

const SLOTS: Record<ImageSlot, { title: string; hint: string; empty: string; alt: string; wide: boolean }> = {
  logo: { title: 'Logo', hint: 'Idéalement sans fond, lisible sur du blanc.', empty: 'Pas encore de logo', alt: 'Logo de la course', wide: false },
  hero: {
    title: 'Photo d’en-tête',
    hint: 'Une photo large, en paysage.',
    empty: 'Pas encore de photo',
    alt: 'Photo d’en-tête de la course',
    wide: true,
  },
};

const ImageBlock = ({ race, slot, error }: { race: Race; slot: ImageSlot; error?: string }) => {
  const s = SLOTS[slot];
  const src = slot === 'logo' ? race.theme.logo : race.theme.hero;
  const base = `/org/${race.slug}/settings/${slot}`;
  return (
    <div class="img-slot">
      <Field label={s.title} error={error} for={`f-${slot}`}>
        <ImageFrame src={src} alt={s.alt} empty={s.empty} wide={s.wide} />
      </Field>
      <div class="file-row">
        <form method="post" action={`${base}#look`} enctype="multipart/form-data">
          {/* Choosing the file sends it; without JavaScript, the button under <noscript> does. */}
          <label class="btn btn-sm file-btn">
            <input id={`f-${slot}`} name="file" type="file" accept="image/png,image/jpeg,image/webp" required class="sr" onchange="this.form.submit()" />
            <Icon name="upload" /> {src ? 'Remplacer' : 'Choisir une image'}
          </label>
          <noscript>
            <button class="btn btn-sm" type="submit">
              Envoyer
            </button>
          </noscript>
        </form>
        {src ? (
          <form method="post" action={`${base}/remove#look`}>
            <button class="btn btn-quiet btn-sm" type="submit">
              Retirer
            </button>
          </form>
        ) : null}
      </div>
      <p class="small muted" style="margin-top:8px">
        {s.hint} PNG, JPEG ou WebP, {mb(IMAGE_MAX_BYTES[slot])} au plus.
      </p>
    </div>
  );
};

/** Race colors with a live preview and a readability check, then the logo and the header photo. */
export const LookCard = ({ race, values, errors, flash, imageError }: SettingsCardProps & { imageError?: ImageError }) => {
  // A color input only takes "#rrggbb": anything else refused by the form shows the saved color.
  const hex = (v: string | undefined, saved: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : saved);
  const primary = hex(values.primary, race.theme.primary);
  const onPrimary = hex(values.onPrimary, race.theme.onPrimary);
  const readable = isReadable(onPrimary, primary);
  return (
    <Card id="look" title="Apparence" sub="Vos couleurs et vos images, sur les pages de la course.">
      {flash ? <Flash tone="good">{flash}</Flash> : null}
      <form id="colors-form" method="post" action={`/org/${race.slug}/settings/colors#look`}>
        <div class="theme-preview" style={`--race-primary:${primary};--race-on-primary:${onPrimary}`} aria-label="Aperçu">
          <span class="chip">
            <i></i>
            {race.theme.displayName}
          </span>
          <span class="btn btn-race">Recevoir mon code</span>
        </div>
        <div class={readable ? 'flash warn hide' : 'flash warn'} data-contrast role="status">
          Le texte sera difficile à lire sur cette couleur. Choisissez un texte plus clair ou plus foncé.
        </div>
        <div class="form-grid two">
          <Field label="Couleur principale" error={errors.primary} for="f-primary">
            <ColorInput id="f-primary" name="primary" value={primary} />
          </Field>
          <Field label="Texte sur cette couleur" error={errors.onPrimary} for="f-onPrimary">
            <ColorInput id="f-onPrimary" name="onPrimary" value={onPrimary} />
          </Field>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">
            Enregistrer les couleurs
          </button>
        </div>
        <script dangerouslySetInnerHTML={{ __html: PREVIEW_JS }} />
      </form>
      <hr class="sep" />
      <div class="form-grid two">
        <ImageBlock race={race} slot="logo" error={imageError?.slot === 'logo' ? imageError.message : undefined} />
        <ImageBlock race={race} slot="hero" error={imageError?.slot === 'hero' ? imageError.message : undefined} />
      </div>
    </Card>
  );
};
