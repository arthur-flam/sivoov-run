import type { Locale } from '@sivoov/shared';
import type { SettingsCardProps } from './settingsRace';
import { Card, Choices, Flash } from './ui';
import type { ChoiceOption } from './ui';

const LANGUAGES: Array<ChoiceOption & { value: Locale }> = [
  { value: 'fr', label: 'Français', hint: 'L’application et les emails aux coureurs sont en français.' },
  { value: 'en', label: 'Anglais', hint: 'Pour une course dont les coureurs lisent surtout l’anglais.' },
];

/** The language runners get until they choose their own (in the app or on the race page). The voice stays the race's. */
export const LanguageCard = ({ race, values, errors, flash }: SettingsCardProps) => (
  <Card id="language" title="Langue des coureurs" sub="Chaque coureur peut ensuite choisir la sienne dans l’application ou sur la page de la course.">
    {flash ? <Flash tone="good">{flash}</Flash> : null}
    <form method="post" action={`/org/${race.slug}/settings/language#language`}>
      <Choices name="defaultLocale" legend="Langue par défaut" options={LANGUAGES} selected={[values.defaultLocale ?? race.defaultLocale]} error={errors.defaultLocale} />
      <p class="small muted" style="margin-bottom:14px">
        Elle vaut pour les écrans de l’application et les emails (code de connexion, instructions). Les annonces audio restent celles du parcours.
      </p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">
          Enregistrer
        </button>
      </div>
    </form>
  </Card>
);
