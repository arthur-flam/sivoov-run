import { Field, Flash } from './ui';

export type OrgSigninState =
  | { step: 'identify'; error?: 'unknown' | 'too_many' | 'invalid'; email?: string }
  | { step: 'code'; email: string; error?: 'bad_code'; devCode?: string };

const ERRORS: Record<string, string> = {
  unknown: 'Cette adresse n’a pas accès à l’espace organisateur. Demandez au responsable de votre course de vous ajouter à l’équipe.',
  too_many: 'Trop de codes demandés. Réessayez dans une heure.',
  invalid: 'Cette adresse email ne semble pas valide.',
  bad_code: 'Ce code ne fonctionne pas. Il a peut-être expiré : demandez-en un nouveau.',
};

/** Email, then the six-digit code. One sign-in for every race the address belongs to. */
export const OrgSigninPage = ({ state, next }: { state: OrgSigninState; next: string }) => (
  <>
    {state.error ? <Flash tone="bad">{ERRORS[state.error]}</Flash> : null}
    {state.step === 'identify' ? (
      <>
        <div class="ph">
          <div>
            <h1>Espace organisateur</h1>
            <p>Entrez votre adresse email. Nous vous envoyons un code à 6 chiffres, pas de mot de passe.</p>
          </div>
        </div>
        <form method="post" action="/org/signin" class="card">
          <input type="hidden" name="step" value="identify" />
          <input type="hidden" name="next" value={next} />
          <Field label="Adresse email" for="email">
            <input id="email" name="email" type="email" autocomplete="email" required autofocus value={state.email ?? ''} />
          </Field>
          <button class="btn btn-primary btn-lg btn-block" type="submit">
            Recevoir mon code
          </button>
        </form>
        <p class="small muted" style="margin-top:16px">
          Vous organisez une course et n’avez pas encore d’accès ? <a href="/organisateurs">Découvrez Sivoov Run</a>.
        </p>
      </>
    ) : (
      <>
        <div class="ph">
          <div>
            <h1>Votre code</h1>
            <p>
              Nous l’avons envoyé à <b>{state.email}</b>. Il est valable 15 minutes.
            </p>
          </div>
        </div>
        <form method="post" action="/org/signin" class="card">
          <input type="hidden" name="step" value="code" />
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="next" value={next} />
          <Field label="Code à 6 chiffres" for="code">
            <input id="code" name="code" class="code" inputmode="numeric" pattern="[0-9]{6}" maxlength={6} autocomplete="one-time-code" required autofocus value={state.devCode ?? ''} />
          </Field>
          <button class="btn btn-primary btn-lg btn-block" type="submit">
            Entrer
          </button>
        </form>
        <form method="post" action="/org/signin" style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <input type="hidden" name="step" value="identify" />
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="next" value={next} />
          <button class="btn btn-quiet btn-sm" type="submit">
            Renvoyer un code
          </button>
          <a class="btn btn-quiet btn-sm" href={`/org/signin${next === '/org' ? '' : `?next=${encodeURIComponent(next)}`}`}>
            Changer d’adresse
          </a>
        </form>
      </>
    )}
  </>
);
