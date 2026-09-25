import { COUNTRIES, DistanceKeySchema } from '@sivoov/shared';
import type { DistanceKey, Race, RunnerField, RunnerFieldError, RunnerFields } from '@sivoov/shared';
import { distanceName } from './format';
import { runnerHref } from './runners';
import { Card, Field, Flash, PageHead } from './ui';

export type RunnerFormState = { values: RunnerFields; errors: Partial<Record<RunnerField, RunnerFieldError>>; notify?: boolean; taken?: boolean };
type Props = { race: Race; mode: 'new' | 'edit'; distances: DistanceKey[]; state: RunnerFormState };

const MESSAGES: Record<RunnerField, Partial<Record<RunnerFieldError, string>>> = {
  bib: { required: 'Indiquez le numéro de dossard.', invalid: 'Des chiffres et des lettres seulement, sans espace.' },
  firstName: { required: 'Indiquez le prénom.', invalid: 'Ce prénom est trop long.' },
  lastName: { required: 'Indiquez le nom.', invalid: 'Ce nom est trop long.' },
  email: { required: 'Indiquez l’email du coureur : il s’en sert pour se connecter.', invalid: 'Cet email n’est pas valide. Il ressemble à nom@exemple.fr.' },
  distanceKey: { required: 'Choisissez la distance.', not_offered: 'Votre course ne propose pas cette distance.' },
  line1: { required: 'Indiquez la rue, ou videz toute l’adresse.' },
  line2: {},
  postalCode: { required: 'Indiquez le code postal, ou videz toute l’adresse.' },
  city: { required: 'Indiquez la ville, ou videz toute l’adresse.' },
  country: { unknown_country: 'Pays inconnu. Choisissez-le dans la liste.' },
};

const errorFor = (state: RunnerFormState, field: RunnerField): string | undefined => {
  if (field === 'bib' && state.taken) return 'Ce dossard est déjà pris dans cette course. Choisissez-en un autre.';
  const code = state.errors[field];
  return code ? MESSAGES[field][code] : undefined;
};

const Text = ({ state, field, label, hint, type = 'text', autocomplete }: { state: RunnerFormState; field: RunnerField; label: string; hint?: string; type?: string; autocomplete?: string }) => (
  <Field label={label} hint={hint} for={field} error={errorFor(state, field)}>
    <input id={field} name={field} type={type} value={state.values[field]} autocomplete={autocomplete} aria-invalid={state.errors[field] ? 'true' : undefined} />
  </Field>
);

/** Add a runner by hand, or correct one. Keeps what was typed when something is wrong. */
export const OrgRunnerFormPage = ({ race, mode, distances, state }: Props) => {
  const base = `/org/${race.slug}`;
  const back = mode === 'new' ? `${base}/runners` : runnerHref(race.slug, state.values.bib);
  const offered = distances.length > 0 ? distances : DistanceKeySchema.options;
  const choices = offered.includes(state.values.distanceKey as DistanceKey) || state.values.distanceKey === '' ? offered : [...offered, state.values.distanceKey];
  const countryListed = state.values.country === '' || COUNTRIES.some((c) => c.name === state.values.country || c.code === state.values.country);
  const hasErrors = Object.keys(state.errors).length > 0 || state.taken;
  return (
    <>
      <PageHead
        back={{ href: back, label: mode === 'new' ? 'Coureurs' : 'Retour au coureur' }}
        title={mode === 'new' ? 'Ajouter un coureur' : `Modifier ${state.values.firstName} ${state.values.lastName.toUpperCase()}`}
        sub={mode === 'new' ? 'Pour une inscription arrivée après l’import, ou un invité.' : `Dossard ${state.values.bib}. Le dossard ne change pas.`}
      />
      {hasErrors ? <Flash tone="bad">{state.taken ? `Le dossard ${state.values.bib} est déjà pris dans cette course.` : 'Certaines cases sont à corriger.'}</Flash> : null}
      <Card>
        <form method="post" action={mode === 'new' ? `${base}/runners/new` : `${runnerHref(race.slug, state.values.bib)}/edit`}>
          {mode === 'new' ? (
            <div class="form-grid two">
              <Text state={state} field="bib" label="Dossard" hint="Le numéro sur le dossard" />
            </div>
          ) : (
            <input type="hidden" name="bib" value={state.values.bib} />
          )}
          <div class="form-grid two">
            <Text state={state} field="firstName" label="Prénom" autocomplete="off" />
            <Text state={state} field="lastName" label="Nom" autocomplete="off" />
          </div>
          <div class="form-grid two">
            <Text state={state} field="email" label="Email" type="email" hint="Il s’en sert pour se connecter" autocomplete="off" />
            <Field label="Distance" for="distanceKey" error={errorFor(state, 'distanceKey')}>
              <select id="distanceKey" name="distanceKey">
                {state.values.distanceKey === '' ? <option value="">Choisir</option> : null}
                {choices.map((d) => (
                  <option value={d} selected={state.values.distanceKey === d}>
                    {distanceName(d)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <fieldset class="group" id="adresse">
            <legend>Adresse pour la médaille</legend>
            <p>Facultatif. Pour envoyer la médaille par la poste.</p>
            <Text state={state} field="line1" label="Adresse" autocomplete="off" />
            <Text state={state} field="line2" label="Complément" hint="Bâtiment, étage, lieu-dit" autocomplete="off" />
            <div class="form-grid three">
              <Text state={state} field="postalCode" label="Code postal" autocomplete="off" />
              <Text state={state} field="city" label="Ville" autocomplete="off" />
              <Field label="Pays" for="country" error={errorFor(state, 'country')}>
                <select id="country" name="country">
                  {COUNTRIES.map((c) => (
                    <option value={c.name} selected={state.values.country === c.name || state.values.country === c.code || (state.values.country === '' && c.code === 'FR')}>
                      {c.name}
                    </option>
                  ))}
                  {countryListed ? null : (
                    <option value={state.values.country} selected>
                      {state.values.country}
                    </option>
                  )}
                </select>
              </Field>
            </div>
          </fieldset>
          {mode === 'new' ? (
            <label class="check">
              <input type="checkbox" name="notify" value="1" checked={state.notify ?? true} />
              <span>Lui envoyer tout de suite ses instructions par email : son dossard et comment se connecter.</span>
            </label>
          ) : null}
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">
              {mode === 'new' ? 'Ajouter le coureur' : 'Enregistrer'}
            </button>
            <a class="btn btn-quiet" href={back}>
              Annuler
            </a>
          </div>
        </form>
      </Card>
    </>
  );
};
