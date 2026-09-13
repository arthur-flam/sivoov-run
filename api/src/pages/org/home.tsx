import type { Organizer, Race } from '@sivoov/shared';
import { distanceLabel, formatOfficialTime } from '@sivoov/shared';
import type { CourseCount, EntrantWithBest } from '../../db/orgQueries';
import { OrgShell } from './shell';

type Props = { race: Race; organizer: Organizer; counts: CourseCount[]; rows: EntrantWithBest[]; search: string };

const label = (key: string) => (key === 'marathon' || key === 'half' || key === '10k' || key === '5k' ? distanceLabel('fr', key) : key);

/** Admin home: the numbers, then the list. */
export const OrgHomePage = ({ race, organizer, counts, rows, search }: Props) => (
  <OrgShell race={race} organizer={organizer} current="home">
    <div class="facts" style="border-bottom:0;padding-top:0">
      {counts.map((c) => (
        <div class="fact">
          <div class="k">{label(c.distanceKey)}</div>
          <div class="v">{c.entrants}</div>
          <div class="s">{c.finishers} {c.finishers > 1 ? 'arrivés' : 'arrivé'}</div>
        </div>
      ))}
      <div class="fact">
        <div class="k">Total</div>
        <div class="v">{counts.reduce((n, c) => n + c.entrants, 0)}</div>
        <div class="s">{counts.reduce((n, c) => n + c.finishers, 0)} temps officiels</div>
      </div>
    </div>
    <form class="org-search" method="get" action={`/org/${race.slug}`} role="search">
      <input name="q" type="search" placeholder="Dossard ou nom" value={search} aria-label="Rechercher un inscrit" />
      <button class="btn btn-ghost" type="submit">Rechercher</button>
      {search ? <a class="btn btn-ghost" href={`/org/${race.slug}`}>Tout</a> : null}
    </form>
    {rows.length === 0 ? (
      <p class="empty">{search ? 'Aucun inscrit ne correspond.' : 'Aucun inscrit pour le moment. Importez le fichier CSV de la billetterie.'}</p>
    ) : (
      <div class="table-scroll">
        <table class="results">
          <thead>
            <tr>
              <th>Dossard</th>
              <th>Nom</th>
              <th>Email</th>
              <th>Épreuve</th>
              <th>Meilleur temps</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entrant, bestMs }) => (
              <tr>
                <td class="num bib">{entrant.bib}</td>
                <td>{entrant.firstName} {entrant.lastName.toUpperCase()}</td>
                <td class="email">{entrant.email}</td>
                <td>{label(entrant.distanceKey)}</td>
                <td class="num">{bestMs === null ? <span class="tag">—</span> : formatOfficialTime(bestMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </OrgShell>
);
