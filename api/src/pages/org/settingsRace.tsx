import type { Race } from '@sivoov/shared';
import { plural } from './format';
import { CountryField, TextField, firstError } from './settingsFields';
import type { FormState } from './settingsFields';
import { Card, Flash } from './ui';

/** One card of the settings page: the race, what its form shows, and a message after a save. */
export type SettingsCardProps = FormState & { race: Race; flash?: string };

const action = (race: Race, section: string) => `/org/${race.slug}/settings/${section}#${section}`;

const SaveButton = () => (
  <div class="form-actions">
    <button class="btn btn-primary" type="submit">
      Enregistrer
    </button>
  </div>
);

const RACE_FIELDS = ['name', 'displayName', 'city', 'country', 'dateStart', 'dateEnd', 'organizerUrl'] as const;

/** Names, place, dates and website of the real race. */
export const RaceCard = ({ race, values, errors, flash }: SettingsCardProps) => {
  const focus = firstError(errors, RACE_FIELDS);
  return (
    <Card id="race" title="La course" sub="Ce que vos coureurs lisent sur la page de la course.">
      {flash ? <Flash tone="good">{flash}</Flash> : null}
      <form method="post" action={action(race, 'race')}>
        <TextField name="name" label="Nom officiel" values={values} errors={errors} focus={focus === 'name'} required />
        <TextField
          name="displayName"
          label="Nom affiché sur les pages"
          hint="Plus court si besoin, par exemple sans l’année."
          values={values}
          errors={errors}
          focus={focus === 'displayName'}
          required
        />
        <div class="form-grid two">
          <TextField name="city" label="Ville" values={values} errors={errors} focus={focus === 'city'} required />
          <CountryField values={values} errors={errors} />
        </div>
        <div class="form-grid two">
          <TextField name="dateStart" type="date" label="Premier jour" values={values} errors={errors} focus={focus === 'dateStart'} required />
          <TextField name="dateEnd" type="date" label="Dernier jour" values={values} errors={errors} focus={focus === 'dateEnd'} required />
        </div>
        <TextField
          name="organizerUrl"
          label="Site web de la course"
          hint="Facultatif."
          type="text"
          inputmode="url"
          placeholder="www.votre-course.fr"
          values={values}
          errors={errors}
          focus={focus === 'organizerUrl'}
        />
        <SaveButton />
      </form>
    </Card>
  );
};

const longDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));

/** "Europe/Paris" -> "Paris", "America/New_York" -> "New York". */
export const clockName = (timeZone: string): string => (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');

/** When the runners may run, typed on the race's clock. */
export const WindowCard = ({ race, values, errors, flash }: SettingsCardProps) => {
  const days = Math.round((Date.parse(race.windowEnd) - Date.parse(race.windowStart)) / 86_400_000);
  const clock = clockName(race.timezone);
  const focus = firstError(errors, ['windowStart', 'windowEnd']);
  return (
    <Card id="window" title="Quand les coureurs peuvent courir" sub={`Heure de ${clock}, même pour un coureur qui court ailleurs.`}>
      {flash ? <Flash tone="good">{flash}</Flash> : null}
      <p class="lede">
        Du {longDate(race.windowStart, race.timezone)} au {longDate(race.windowEnd, race.timezone)}, soit {plural(days, 'jour', 'jours')}. Ces dates s’affichent
        sur la page de la course et dans l’application.
      </p>
      <form method="post" action={action(race, 'window')}>
        <div class="form-grid two">
          <TextField name="windowStart" type="datetime-local" label="Ouverture" values={values} errors={errors} focus={focus === 'windowStart'} required />
          <TextField name="windowEnd" type="datetime-local" label="Fermeture" values={values} errors={errors} focus={focus === 'windowEnd'} required />
        </div>
        <SaveButton />
      </form>
    </Card>
  );
};

/** Where runners write when they are stuck. */
export const ContactCard = ({ race, values, errors, flash }: SettingsCardProps) => (
  <Card id="contact" title="Contact pour les coureurs" sub="L’adresse à laquelle vos coureurs vous écrivent quand ils ont une question.">
    {flash ? <Flash tone="good">{flash}</Flash> : null}
    <form method="post" action={action(race, 'contact')}>
      <TextField
        name="supportEmail"
        type="email"
        label="Adresse email"
        hint="Laissez vide pour ne pas en donner."
        placeholder="contact@votre-course.fr"
        autocomplete="email"
        values={values}
        errors={errors}
        focus={Boolean(errors.supportEmail)}
      />
      <SaveButton />
    </form>
  </Card>
);
