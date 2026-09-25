import { can, formatOfficialTime } from '@sivoov/shared';
import type { Access, DistanceKey, Race } from '@sivoov/shared';
import { PAGE_SIZE, RUNNER_FILTERS } from '../../db/runnerQueries';
import type { RunnerCounts, RunnerQuery, RunnerRow } from '../../db/runnerQueries';
import { distanceName, plural } from './format';
import { FILTER_EMPTY, FILTER_HINTS, FILTER_LABELS, presenceView } from './runnerPresence';
import { Badge, Card, Chips, Empty, Flash, Icon, PageHead, Pager } from './ui';
import type { Tone } from './ui';

export type FlashMessage = { tone: Tone; text: string };
type Props = { race: Race; access: Access; rows: RunnerRow[]; counts: RunnerCounts; query: RunnerQuery; distances: DistanceKey[]; flash?: FlashMessage; now?: Date };

/** The list's address with these filters; the defaults are left out so links stay short. */
export const runnersHref = (slug: string, q: Partial<RunnerQuery>, path = 'runners'): string => {
  const params = new URLSearchParams([
    ...(q.filter && q.filter !== 'all' ? [['filter', q.filter]] : []),
    ...(q.distance ? [['distance', q.distance]] : []),
    ...(q.search ? [['q', q.search]] : []),
    ...(q.page && q.page > 1 ? [['page', String(q.page)]] : []),
  ]);
  const qs = params.toString();
  return `/org/${slug}/${path}${qs ? `?${qs}` : ''}`;
};

export const runnerHref = (slug: string, bib: string): string => `/org/${slug}/runners/${encodeURIComponent(bib)}`;

/** Every runner of the race: who reached the app, who ran, who finished. */
export const OrgRunnersPage = ({ race, access, rows, counts, query, distances, flash, now = new Date() }: Props) => {
  const base = `/org/${race.slug}`;
  const narrowed = query.search !== '' || query.distance !== null;
  const total = counts[query.filter];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const editable = can(access, 'edit_runners');
  return (
    <>
      {flash ? <Flash tone={flash.tone}>{flash.text}</Flash> : null}
      <PageHead
        title="Coureurs"
        sub={narrowed ? `${plural(counts.all, 'coureur', 'coureurs')} pour cette recherche` : plural(counts.all, 'coureur inscrit', 'coureurs inscrits')}
        actions={
          editable ? (
            <>
              <a class="btn" href={`${base}/runners/new`}>
                <Icon name="plus" /> Ajouter un coureur
              </a>
              <a class="btn btn-primary" href={`${base}/runners/import`}>
                <Icon name="upload" /> Importer
              </a>
            </>
          ) : undefined
        }
      />
      <form class="toolbar" method="get" action={`${base}/runners`} role="search">
        {query.filter !== 'all' ? <input type="hidden" name="filter" value={query.filter} /> : null}
        <div class="search">
          <input class="input" name="q" type="search" placeholder="Dossard, nom ou email" value={query.search} aria-label="Rechercher un coureur" />
        </div>
        {distances.length > 1 ? (
          <select class="input" name="distance" aria-label="Distance" onchange="this.form.submit()">
            <option value="">Toutes les distances</option>
            {distances.map((d) => (
              <option value={d} selected={query.distance === d}>
                {distanceName(d)}
              </option>
            ))}
          </select>
        ) : null}
        <button class="btn" type="submit">
          Rechercher
        </button>
      </form>
      <Chips
        label="Filtrer les coureurs"
        items={RUNNER_FILTERS.map((f) => ({ label: FILTER_LABELS[f], count: counts[f], on: query.filter === f, href: runnersHref(race.slug, { ...query, filter: f, page: 1 }) }))}
      />
      {FILTER_HINTS[query.filter] ? <p class="hint-line">{FILTER_HINTS[query.filter]}</p> : null}
      <Card flush>
        {rows.length > 0 ? (
          <div class="table-wrap">
            <table class="a-table">
              <thead>
                <tr>
                  <th class="hide-sm">Dossard</th>
                  <th>Coureur</th>
                  <th class="hide-sm">Distance</th>
                  <th>Application</th>
                  <th class="num hide-sm">Meilleur temps</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entrant, bestMs, presence }) => {
                  const p = presenceView(presence, now, race.timezone);
                  return (
                    <tr>
                      <td class="bib hide-sm">{entrant.bib}</td>
                      <td>
                        <a class="row-link" href={runnerHref(race.slug, entrant.bib)}>
                          {entrant.firstName} {entrant.lastName.toUpperCase()}
                        </a>
                        <span class="sub hide-sm">{entrant.email}</span>
                        <span class="sub show-sm">
                          <span class="num">{entrant.bib}</span> · {distanceName(entrant.distanceKey)}
                          {bestMs === null ? '' : ` · ${formatOfficialTime(bestMs)}`}
                        </span>
                      </td>
                      <td class="hide-sm">{distanceName(entrant.distanceKey)}</td>
                      <td>
                        <Badge tone={p.tone}>{p.label}</Badge>
                        {p.detail ? <span class="sub">{p.detail}</span> : null}
                      </td>
                      <td class="num hide-sm">{bestMs === null ? '' : formatOfficialTime(bestMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : counts.all === 0 && !narrowed ? (
          <Empty
            title="Pas encore de coureurs."
            action={
              editable ? (
                <div class="form-actions">
                  <a class="btn btn-primary" href={`${base}/runners/import`}>
                    <Icon name="upload" /> Importer le fichier de la billetterie
                  </a>
                  <a class="btn" href={`${base}/runners/new`}>
                    Ajouter un coureur
                  </a>
                </div>
              ) : undefined
            }
          >
            Importez le fichier de votre billetterie, ou ajoutez les coureurs un par un.
          </Empty>
        ) : (
          <Empty
            title={narrowed ? 'Aucun coureur ne correspond.' : FILTER_EMPTY[query.filter]}
            action={
              narrowed || query.filter !== 'all' ? (
                <a class="btn" href={`${base}/runners`}>
                  Voir tous les coureurs
                </a>
              ) : undefined
            }
          />
        )}
      </Card>
      <Pager page={query.page} pages={pages} href={(page) => runnersHref(race.slug, { ...query, page })} />
      <Card title="Télécharger" sub="Des fichiers qui s’ouvrent dans Excel ou Google Sheets.">
        <div class="form-actions">
          <a class="btn" href={runnersHref(race.slug, { ...query, page: 1 }, 'export/entrants.csv')}>
            <Icon name="download" /> {query.filter === 'all' && !narrowed ? 'Liste des coureurs' : 'Cette liste'}
          </a>
          <a class="btn" href={`${base}/export/results.csv`}>
            <Icon name="download" /> Résultats
          </a>
          <a class="btn" href={`${base}/export/medals.csv`}>
            <Icon name="download" /> Adresses pour les médailles
          </a>
        </div>
      </Card>
    </>
  );
};
