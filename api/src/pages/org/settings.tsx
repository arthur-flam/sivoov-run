import type { Race } from '@sivoov/shared';
import type { SettingsFailure } from '../../lib/raceSettings';
import { settingsValues } from '../../lib/raceSettings';
import { LookCard } from './settingsLook';
import type { ImageError } from './settingsLook';
import { StatusCard } from './settingsPublish';
import { ContactCard, RaceCard, WindowCard } from './settingsRace';
import { SaleCard } from './settingsSale';
import { Flash, Icon, PageHead } from './ui';

/** `?done=<key>` after a save: the sentence, shown in the card that was saved. */
export const SETTINGS_DONE: Record<string, string> = {
  race: 'Les informations de la course sont enregistrées.',
  window: 'Les dates sont enregistrées.',
  contact: 'L’adresse de contact est enregistrée.',
  contact_removed: 'L’adresse de contact est retirée.',
  colors: 'Les couleurs sont enregistrées.',
  logo: 'Le logo est en place.',
  logo_removed: 'Le logo est retiré.',
  hero: 'La photo est en place.',
  hero_removed: 'La photo est retirée.',
  status: 'L’état de la course est enregistré.',
};

/** Which card shows the message of each `done` key. */
const CARD_OF: Record<string, string> = {
  race: 'race',
  window: 'window',
  contact: 'contact',
  contact_removed: 'contact',
  colors: 'look',
  logo: 'look',
  logo_removed: 'look',
  hero: 'look',
  hero_removed: 'look',
  status: 'status',
};

/** Which card holds the fields of each form section. */
const SECTION_CARD: Record<SettingsFailure['section'], string> = { race: 'race', window: 'window', contact: 'contact', colors: 'look', status: 'status' };

const CARD_TITLES: Record<string, string> = {
  race: 'La course',
  window: 'Quand les coureurs peuvent courir',
  contact: 'Contact pour les coureurs',
  look: 'Apparence',
  status: 'Publication',
};

type Props = { race: Race; done?: string; failure?: SettingsFailure; imageError?: ImageError };

/** The race's settings: one card per subject, each saved on its own. */
export const OrgSettingsPage = ({ race, done, failure, imageError }: Props) => {
  const values = { ...settingsValues(race), ...(failure?.values ?? {}) };
  const errors = failure?.errors ?? {};
  const flashFor = (card: string) => (done && CARD_OF[done] === card ? SETTINGS_DONE[done] : undefined);
  const card = (id: string) => ({ race, values, errors, flash: flashFor(id) });
  return (
    <>
      <PageHead
        title="Réglages"
        sub="Ce que vos coureurs voient de votre course. Chaque bloc s’enregistre séparément."
        actions={
          <a class="btn" href={`/${race.slug}`} target="_blank" rel="noopener">
            Voir la page publique <Icon name="external" />
          </a>
        }
      />
      {failure || imageError ? (
        <Flash tone="bad">
          Rien n’a été enregistré dans « {failure ? CARD_TITLES[SECTION_CARD[failure.section]] : CARD_TITLES.look} ». Corrigez ce qui est indiqué en rouge.
        </Flash>
      ) : null}
      <div class="grid main-side">
        <div>
          <RaceCard {...card('race')} />
          <WindowCard {...card('window')} />
          <LookCard {...card('look')} imageError={imageError} />
        </div>
        <div>
          <StatusCard {...card('status')} />
          <ContactCard {...card('contact')} />
          <SaleCard race={race} />
        </div>
      </div>
    </>
  );
};
