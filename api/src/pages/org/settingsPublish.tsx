import type { RaceStatus } from '@sivoov/shared';
import type { SettingsCardProps } from './settingsRace';
import { Card, Choices, Flash } from './ui';
import type { ChoiceOption } from './ui';

/**
 * What each state does on the public side, and nothing more. Today only a draft changes
 * anything: `db.races()` leaves it out of the home page list (and of /api/races). Every state
 * keeps the race page, the runners' sign-in and the results at their address.
 */
const STATES: Array<ChoiceOption & { value: RaceStatus }> = [
  { value: 'draft', label: 'Brouillon', hint: 'La page existe à son adresse, mais elle n’est pas listée sur l’accueil de Sivoov Run.' },
  { value: 'open', label: 'Ouverte', hint: 'La course est listée sur l’accueil de Sivoov Run.' },
  { value: 'live', label: 'En cours', hint: 'Toujours listée, pendant la semaine où vos coureurs courent.' },
  { value: 'closed', label: 'Terminée', hint: 'Toujours listée. Les résultats restent en ligne.' },
];

/** Draft, open, live, closed: radio cards, each with what it changes. */
export const StatusCard = ({ race, values, errors, flash }: SettingsCardProps) => (
  <Card id="status" title="Publication">
    {flash ? <Flash tone="good">{flash}</Flash> : null}
    <form method="post" action={`/org/${race.slug}/settings/status#status`}>
      <Choices name="status" legend="État de la course" options={STATES} selected={[values.status ?? race.status]} error={errors.status} />
      <p class="small muted" style="margin-bottom:14px">
        Dans tous les cas, vos coureurs inscrits peuvent se connecter avec leur dossard et leur email, et la page de la course reste à la même adresse.
      </p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">
          Enregistrer
        </button>
      </div>
    </form>
  </Card>
);
