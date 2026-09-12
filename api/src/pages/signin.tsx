import type { Race } from '@sivoov/shared';
import { translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';

type Step1 = { step: 'identify'; error?: 'unknown' | 'too_many' | 'invalid'; bib?: string; email?: string };
type Step2 = { step: 'code'; bib: string; email: string; error?: 'bad_code'; devCode?: string };
type Props = { race: Race; locale: Locale; state: Step1 | Step2 };

export const SigninPage = ({ race, locale, state }: Props) => {
  const t = translator(locale);
  return (
    <section class="form-page">
      <a class="race-chip" href={`/${race.slug}`}>
        <i></i>
        {race.theme.displayName}
      </a>
      {state.step === 'identify' ? (
        <>
          <h1>{t('signin.title')}</h1>
          <p>{t('signin.lede')}</p>
          {state.error === 'unknown' ? <div class="error" role="alert">{t('signin.unknown')}</div> : null}
          {state.error === 'too_many' ? <div class="error" role="alert">{locale === 'fr' ? 'Trop de demandes. Réessayez dans une heure.' : 'Too many requests. Try again in an hour.'}</div> : null}
          {state.error === 'invalid' ? <div class="error" role="alert">{t('common.error')}</div> : null}
          <form method="post" action={`/${race.slug}/signin`}>
            <input type="hidden" name="step" value="identify" />
            <div class="field">
              <label for="bib">{t('signin.bib')}</label>
              <input id="bib" name="bib" inputmode="numeric" autocomplete="off" required value={state.bib ?? ''} />
            </div>
            <div class="field">
              <label for="email">{t('signin.email')}</label>
              <input id="email" name="email" type="email" autocomplete="email" required value={state.email ?? ''} />
            </div>
            <button class="btn btn-race" type="submit" style="width:100%">
              {t('signin.send')}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1>{t('signin.code.title')}</h1>
          <p>{t('signin.code.lede', { email: state.email })}</p>
          {state.error === 'bad_code' ? <div class="error" role="alert">{t('signin.badCode')}</div> : null}
          <form method="post" action={`/${race.slug}/signin`}>
            <input type="hidden" name="step" value="code" />
            <input type="hidden" name="bib" value={state.bib} />
            <input type="hidden" name="email" value={state.email} />
            <div class="field">
              <label for="code">{t('signin.code')}</label>
              <input id="code" name="code" class="code" inputmode="numeric" pattern="[0-9]{6}" maxlength={6} autocomplete="one-time-code" required autofocus value={state.devCode ?? ''} />
            </div>
            <button class="btn btn-race" type="submit" style="width:100%">
              {t('signin.verify')}
            </button>
          </form>
          <p class="hint">
            <a href={`/${race.slug}/signin`}>{t('common.back')}</a>
          </p>
        </>
      )}
    </section>
  );
};
