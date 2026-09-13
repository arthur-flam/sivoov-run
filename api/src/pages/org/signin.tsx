import type { Race } from '@sivoov/shared';

export type OrgSigninState =
  | { step: 'identify'; error?: 'unknown' | 'too_many' | 'invalid'; email?: string }
  | { step: 'code'; email: string; error?: 'bad_code'; devCode?: string };

const ERRORS: Record<string, string> = {
  unknown: 'Cet email n’est pas organisateur de cette course.',
  too_many: 'Trop de demandes. Réessayez dans une heure.',
  invalid: 'Vérifiez l’adresse email.',
  bad_code: 'Code incorrect ou expiré.',
};

/** Email -> code -> cookie. Same shape as the runner sign-in, French only: the admin is not localized. */
export const OrgSigninPage = ({ race, state }: { race: Race; state: OrgSigninState }) => {
  const action = `/org/${race.slug}/signin`;
  return (
    <section class="form-page">
      <a class="race-chip" href={`/${race.slug}`}>
        <i></i>
        {race.theme.displayName}
      </a>
      {state.error ? <div class="error" role="alert">{ERRORS[state.error]}</div> : null}
      {state.step === 'identify' ? (
        <>
          <h1>Espace organisateur</h1>
          <p>Entrez votre email : vous recevrez un code à 6 chiffres.</p>
          <form method="post" action={action}>
            <input type="hidden" name="step" value="identify" />
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" autocomplete="email" required autofocus value={state.email ?? ''} />
            </div>
            <button class="btn btn-race" type="submit" style="width:100%">Recevoir mon code</button>
          </form>
        </>
      ) : (
        <>
          <h1>Votre code</h1>
          <p>Nous l’avons envoyé à {state.email}. Il est valable 15 minutes.</p>
          <form method="post" action={action}>
            <input type="hidden" name="step" value="code" />
            <input type="hidden" name="email" value={state.email} />
            <div class="field">
              <label for="code">Code à 6 chiffres</label>
              <input id="code" name="code" class="code" inputmode="numeric" pattern="[0-9]{6}" maxlength={6} autocomplete="one-time-code" required autofocus value={state.devCode ?? ''} />
            </div>
            <button class="btn btn-race" type="submit" style="width:100%">Valider</button>
          </form>
          <p class="hint">
            <a href={action}>Retour</a>
          </p>
        </>
      )}
    </section>
  );
};
