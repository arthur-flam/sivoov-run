import { can, formatOfficialTime } from '@sivoov/shared';
import type { Access, Race } from '@sivoov/shared';
import type { EntrantWithBest } from '../../db/runnerQueries';
import { distanceName, plural } from './format';
import { Card, Empty, Icon, PageHead } from './ui';

type Props = { race: Race; access: Access; rows: EntrantWithBest[]; search: string };

/** Every runner of the race, searchable. */
export const OrgRunnersPage = ({ race, access, rows, search }: Props) => {
  const base = `/org/${race.slug}`;
  return (
    <>
      <PageHead
        title="Coureurs"
        sub={plural(rows.length, 'coureur', 'coureurs')}
        actions={
          <>
            <a class="btn" href={`${base}/export/entrants.csv`}>
              <Icon name="download" /> Télécharger la liste
            </a>
            {can(access, 'edit_runners') ? (
              <a class="btn btn-primary" href={`${base}/runners/import`}>
                <Icon name="upload" /> Importer
              </a>
            ) : null}
          </>
        }
      />
      <form class="toolbar" method="get" action={`${base}/runners`} role="search">
        <div class="search">
          <input class="input" name="q" type="search" placeholder="Dossard, nom ou email" value={search} aria-label="Rechercher un coureur" />
          <button class="btn" type="submit">
            Rechercher
          </button>
        </div>
      </form>
      <Card flush>
        {rows.length === 0 ? (
          <Empty title={search ? 'Aucun coureur ne correspond.' : 'Aucun coureur pour le moment.'}>
            {search ? null : 'Importez le fichier de votre billetterie pour les ajouter.'}
          </Empty>
        ) : (
          <div class="table-wrap">
            <table class="a-table">
              <thead>
                <tr>
                  <th>Dossard</th>
                  <th>Nom</th>
                  <th>Distance</th>
                  <th class="num">Meilleur temps</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entrant, bestMs }) => (
                  <tr>
                    <td class="bib">{entrant.bib}</td>
                    <td>
                      {entrant.firstName} {entrant.lastName.toUpperCase()}
                      <span class="sub">{entrant.email}</span>
                    </td>
                    <td>{distanceName(entrant.distanceKey)}</td>
                    <td class="num">{bestMs === null ? '' : formatOfficialTime(bestMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
};
