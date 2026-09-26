import { formatClock, formatKm, formatPace, translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';

/** The finish of a Deauville half in 1:52:04: the numbers the mockup shows. */
const EXAMPLE = { meters: 21097.5, elapsedMs: (1 * 3600 + 52 * 60 + 4) * 1000 };

/**
 * The run screen at the finish, drawn in HTML and CSS until there is a real screenshot to show.
 * Placeholder: to use a picture instead, set ORGANIZERS_HERO_IMAGE in ./page.tsx.
 */
export const PhoneMockup = ({ locale }: { locale: Locale }) => {
  const t = translator(locale);
  const km = formatKm(EXAMPLE.meters, locale, 1).replace(' km', '');
  const pace = formatPace(EXAMPLE.elapsedMs / 1000 / (EXAMPLE.meters / 1000));
  return (
    <figure class="phone" role="img" aria-label={t('organizers.phone.label')}>
      <div class="phone-screen">
        <p class="phone-race">{t('organizers.phone.race')}</p>
        <p class="phone-status">{t('organizers.phone.status')}</p>
        <p class="phone-distance">
          {km}
          <small>km</small>
        </p>
        <p class="phone-time">{formatClock(EXAMPLE.elapsedMs)}</p>
        <p class="phone-pace">{pace} /km</p>
        <div class="phone-progress">
          <i></i>
        </div>
        <p class="phone-official">{t('organizers.phone.official')}</p>
        <p class="phone-caption">{t('organizers.phone.caption')}</p>
      </div>
    </figure>
  );
};
