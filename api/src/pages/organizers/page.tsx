import { translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { ORGANIZERS_PATH } from '../layout';
import { LeadForm } from './leadForm';
import type { LeadFormState } from './leadForm';
import { PhoneMockup } from './phone';

/**
 * Image slot for the hero. Null shows the HTML phone mockup; set it to a path or URL (a photo of
 * a runner, a real screenshot) and the picture takes its place, framed by `.hero-visual`.
 */
export const ORGANIZERS_HERO_IMAGE: string | null = null;

/** The race shown as a live example. */
export const EXAMPLE_RACE_PATH = '/deauville-2026';

const RUNNER = ['start', 'course', 'finish', 'results', 'certificate', 'medal'] as const;
const YOU_GET = ['page', 'runners', 'results', 'shipping', 'studio'] as const;
const STEPS = ['organizers.steps.1', 'organizers.steps.2', 'organizers.steps.3'] as const;
const FAQ = ['cheapen', 'gps', 'medals', 'data'] as const;

type Props = { locale: Locale; form: LeadFormState };

/** /organisateurs: the page for race directors. Copy in the i18n dictionaries, under organizers.*. */
export const OrganizersPage = ({ locale, form }: Props) => {
  const t = translator(locale);
  return (
    <>
      <section class="pitch-hero">
        <div>
          <div class="eyebrow">{t('organizers.eyebrow')}</div>
          <h1>
            {t('organizers.hero.title')} <em>{t('organizers.hero.answer')}</em>
          </h1>
          <p class="lede">{t('organizers.hero.lede')}</p>
          <div class="cta-row">
            <a class="btn btn-ink" href="#contact">
              {t('organizers.hero.contact')}
            </a>
            <a class="btn btn-ghost" href={EXAMPLE_RACE_PATH}>
              {t('organizers.hero.example')}
            </a>
          </div>
        </div>
        <div class="hero-visual">{ORGANIZERS_HERO_IMAGE ? <img src={ORGANIZERS_HERO_IMAGE} alt="" /> : <PhoneMockup locale={locale} />}</div>
      </section>

      <section class="section">
        <h2>{t('organizers.runner.title')}</h2>
        <div class="pitch-grid">
          {RUNNER.map((k) => (
            <div class="pitch-item">
              <h3>{t(`organizers.runner.${k}.title`)}</h3>
              <p>{t(`organizers.runner.${k}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section class="section pitch-split">
        <h2>{t('organizers.get.title')}</h2>
        <ul class="pitch-rows">
          {YOU_GET.map((k) => (
            <li>
              <strong>{t(`organizers.get.${k}.title`)}</strong>
              <span>{t(`organizers.get.${k}.body`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section class="section">
        <h2>{t('organizers.steps.title')}</h2>
        <ol class="numbered cards">
          {STEPS.map((k) => (
            <li>{t(k)}</li>
          ))}
        </ol>
        <p class="pitch-note">{t('organizers.steps.time')}</p>
      </section>

      <section class="section pitch-split">
        <h2>{t('organizers.price.title')}</h2>
        <div class="price">
          <p class="price-amount">{t('organizers.price.amount')}</p>
          <p>{t('organizers.price.body')}</p>
          <p>{t('organizers.price.sales')}</p>
          <p class="price-soon">{t('organizers.price.soon')}</p>
        </div>
      </section>

      <section class="section">
        <h2>{t('organizers.faq.title')}</h2>
        <div class="faq">
          {FAQ.map((k) => (
            <div>
              <h3>{t(`organizers.faq.${k}.q`)}</h3>
              <p>{t(`organizers.faq.${k}.a`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section class="section contact" id="contact">
        <div>
          <h2>{t('organizers.contact.title')}</h2>
          <p class="lede">{t('organizers.contact.lede')}</p>
        </div>
        <LeadForm locale={locale} state={form} action={`${ORGANIZERS_PATH}?lang=${locale}#contact`} examplePath={EXAMPLE_RACE_PATH} />
      </section>
    </>
  );
};
