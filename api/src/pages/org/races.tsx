import type { RaceWithRole } from '../../db/adminQueries';
import { ROLE_LABELS, STATUS_LABELS, dateFr } from './format';
import { Badge, Empty, Flash, Icon, PageHead } from './ui';

type Props = { races: RaceWithRole[]; staff: boolean; denied: boolean };

/** After sign-in: the races this person works on. Staff see every race and can create one. */
export const OrgRacesPage = ({ races, staff, denied }: Props) => (
  <>
    {denied ? <Flash tone="warn">Vous n’avez pas accès à cette page. Demandez au responsable de la course de vous donner les droits.</Flash> : null}
    <PageHead
      title="Vos courses"
      sub={staff ? 'Vous faites partie de l’équipe Sivoov : vous voyez toutes les courses.' : undefined}
      actions={
        staff ? (
          <>
            <a class="btn" href="/org/leads">
              <Icon name="inbox" /> Demandes reçues
            </a>
            <a class="btn btn-primary" href="/org/new">
              <Icon name="plus" /> Nouvelle course
            </a>
          </>
        ) : undefined
      }
    />
    {races.length === 0 ? (
      <Empty title="Aucune course pour le moment.">Votre adresse n’est rattachée à aucune course. Demandez au responsable de vous inviter.</Empty>
    ) : (
      races.map(({ race, role }) => (
        <a class="race-tile" href={`/org/${race.slug}`} style={`--race-primary:${race.theme.primary}`}>
          <i></i>
          <div>
            <b>{race.theme.displayName}</b>
            <span>
              {race.city} · {dateFr(race.dateStart, race.timezone)}
              {role ? ` · ${ROLE_LABELS[role]}` : ''}
            </span>
          </div>
          <Badge tone={race.status === 'draft' ? 'neutral' : race.status === 'closed' ? 'neutral' : 'good'}>{STATUS_LABELS[race.status]}</Badge>
        </a>
      ))
    )}
  </>
);
