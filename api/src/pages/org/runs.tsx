import { formatOfficialTime, runVerdict } from '@sivoov/shared';
import type { Course, Race } from '@sivoov/shared';
import { RUN_FILTERS } from '../../db/runQueries';
import type { RunList, RunListItem, RunListQuery } from '../../db/runQueries';
import { ago, distanceName, plural } from './format';
import { runStatusView } from './runStatus';
import { FILTER_EMPTY, FILTER_LABELS, howLabel, km } from './runsCopy';
import { Badge, Card, Chips, Empty, Icon, PageHead, Pager } from './ui';

type Props = { race: Race; courses: Course[]; list: RunList; query: RunListQuery; now?: Date };

/** The list's address with some parameters changed; defaults are left out so links stay short. */
export const runsHref = (base: string, q: RunListQuery, change: Partial<RunListQuery>): string => {
  const next = { ...q, ...change };
  const params = new URLSearchParams([
    ...(next.filter !== 'all' ? [['filter', next.filter]] : []),
    ...(next.distance ? [['distance', next.distance]] : []),
    ...(next.search.trim() ? [['q', next.search.trim()]] : []),
    ...(next.page > 1 ? [['page', String(next.page)]] : []),
  ]);
  const text = params.toString();
  return text ? `${base}/runs?${text}` : `${base}/runs`;
};

const counts = (r: RunListItem) => runVerdict(r, r.excluded) === 'counts';

const Row = ({ r, base, race, now }: { r: RunListItem; base: string; race: Race; now: Date }) => {
  const status = runStatusView(r);
  const when = ago(r.at, now, race.timezone);
  const time = r.elapsedMs > 0 ? formatOfficialTime(r.elapsedMs) : '';
  return (
    <tr>
      <td>
        <a class="row-link" href={`${base}/runs/${encodeURIComponent(r.id)}`}>
          {r.firstName} {r.lastName.toUpperCase()}
        </a>
        <span class="sub">
          Dossard {r.bib}
          <span class="narrow-only"> · {distanceName(r.distanceKey)}</span>
        </span>
      </td>
      <td class="wide-only">{distanceName(r.distanceKey)}</td>
      <td class={counts(r) ? 'num' : 'num muted'}>
        {time}
        <span class="sub narrow-only">{km(r.distanceM)}</span>
      </td>
      <td class="num wide-only">{km(r.distanceM)}</td>
      <td>
        <Badge tone={status.tone}>{status.label}</Badge>
        <span class="sub narrow-only">{when}</span>
      </td>
      <td class="wide-only">{when}</td>
      <td class="wide-only">{howLabel(r.source, r.platform)}</td>
    </tr>
  );
};

/** Every run of the race, newest first, filtered by outcome and distance, searchable by bib or name. */
export const OrgRunsPage = ({ race, courses, list, query, now = new Date() }: Props) => {
  const base = `/org/${race.slug}`;
  const empty = FILTER_EMPTY[query.filter];
  const searching = query.search.trim() !== '';
  return (
    <>
      <PageHead
        title="Activités"
        sub={`${searching || query.distance ? '' : `${plural(list.counts.all, 'activité', 'activités')}. `}Chaque course enregistrée par l’application ou envoyée en fichier.`}
        actions={
          <a class="btn" href={`${base}/export/results.csv`}>
            <Icon name="download" /> Télécharger les résultats
          </a>
        }
      />
      <form class="toolbar" method="get" action={`${base}/runs`} role="search">
        {query.filter !== 'all' ? <input type="hidden" name="filter" value={query.filter} /> : null}
        {query.distance ? <input type="hidden" name="distance" value={query.distance} /> : null}
        <div class="search">
          <input class="input" name="q" type="search" placeholder="Dossard ou nom" value={query.search} aria-label="Rechercher une activité par dossard ou nom" />
          <button class="btn" type="submit">
            Rechercher
          </button>
        </div>
      </form>
      <div class="toolbar">
        <Chips
          label="Filtrer par résultat"
          items={RUN_FILTERS.map((f) => ({ label: FILTER_LABELS[f], href: runsHref(base, query, { filter: f, page: 1 }), on: query.filter === f, count: list.counts[f] }))}
        />
      </div>
      {courses.length > 1 ? (
        <div class="toolbar">
          <Chips
            label="Filtrer par distance"
            items={[
              { label: 'Toutes les distances', href: runsHref(base, query, { distance: null, page: 1 }), on: query.distance === null },
              ...courses.map((c) => ({
                label: distanceName(c.distanceKey),
                href: runsHref(base, query, { distance: c.distanceKey, page: 1 }),
                on: query.distance === c.distanceKey,
                count: list.byDistance[c.distanceKey] ?? 0,
              })),
            ]}
          />
        </div>
      ) : null}
      <Card flush>
        {list.items.length === 0 ? (
          searching ? (
            <Empty title={`Aucune activité ne correspond à «\u00a0${query.search.trim()}\u00a0».`} action={<a class="btn" href={runsHref(base, query, { search: '', page: 1 })}>Effacer la recherche</a>}>
              Cherchez un numéro de dossard, un prénom ou un nom.
            </Empty>
          ) : (
            <Empty title={empty.title}>{empty.text}</Empty>
          )
        ) : (
          <div class="table-wrap">
            <table class="a-table">
              <thead>
                <tr>
                  <th>Coureur</th>
                  <th class="wide-only">Distance</th>
                  <th class="num">Temps</th>
                  <th class="num wide-only">Parcouru</th>
                  <th>Statut</th>
                  <th class="wide-only">Quand</th>
                  <th class="wide-only">Comment</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((r) => (
                  <Row r={r} base={base} race={race} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pager
        newer={query.page > 1 ? runsHref(base, query, { page: query.page - 1 }) : undefined}
        older={list.hasOlder ? runsHref(base, query, { page: query.page + 1 }) : undefined}
      />
    </>
  );
};
