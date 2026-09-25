import { can, formatOfficialTime } from '@sivoov/shared';
import type { Access, Race } from '@sivoov/shared';
import type { DistanceCount, Funnel, RecentRun, Setup } from '../../db/dashboardQueries';
import { STATUS_LABELS, ago, distanceName, plural, windowState } from './format';
import { runStatusView } from './runStatus';
import { Badge, Card, Checklist, Empty, Flash, Icon, PageHead, Stat } from './ui';
import type { TodoItem } from './ui';

type Props = { race: Race; access: Access; funnel: Funnel; distances: DistanceCount[]; recent: RecentRun[]; setup: Setup; denied: boolean; now?: Date };

const share = (n: number, of: number) => (of === 0 ? 0 : n / of);

/** What is left to do before the race opens, each with the button that does it. */
const todo = (race: Race, access: Access, funnel: Funnel, distances: DistanceCount[], setup: Setup): TodoItem[] => {
  const base = `/org/${race.slug}`;
  const link = (allowed: boolean, href: string, label: string) => (allowed ? <a class="btn btn-sm" href={href}>{label}</a> : undefined);
  const noTrace = distances.filter((d) => !d.hasTrace);
  const unpublished = distances.filter((d) => !d.published);
  return [
    {
      done: distances.length > 0 && noTrace.length === 0,
      label: 'Le tracé de chaque parcours',
      hint: distances.length === 0 ? 'Aucun parcours pour le moment.' : noTrace.length > 0 ? `Manque : ${noTrace.map((d) => distanceName(d.distanceKey)).join(', ')}.` : undefined,
      action: link(can(access, 'edit_audio'), `${base}/courses`, 'Ajouter'),
    },
    {
      done: distances.length > 0 && unpublished.length === 0,
      label: 'Les annonces audio publiées',
      hint: unpublished.length > 0 ? `À publier : ${unpublished.map((d) => distanceName(d.distanceKey)).join(', ')}.` : undefined,
      action: link(can(access, 'edit_audio'), `${base}/courses`, 'Ouvrir'),
    },
    {
      done: funnel.entrants > 0,
      label: 'La liste des coureurs',
      hint: 'Le fichier de votre billetterie : dossard, email, prénom, nom, distance.',
      action: link(can(access, 'edit_runners'), `${base}/runners/import`, 'Importer'),
    },
    {
      done: Boolean(race.supportEmail),
      label: 'Une adresse pour les questions des coureurs',
      hint: 'Elle s’affiche sur la page de la course.',
      action: link(can(access, 'edit_race'), `${base}/settings`, 'Renseigner'),
    },
    {
      done: Boolean(race.theme.logo),
      label: 'Votre logo et vos couleurs',
      action: link(can(access, 'edit_race'), `${base}/settings`, 'Personnaliser'),
    },
    {
      done: setup.members > 1,
      label: 'Votre équipe invitée',
      hint: 'Chaque personne reçoit son propre accès.',
      action: link(can(access, 'manage_team'), `${base}/team`, 'Inviter'),
    },
  ];
};

/** The organizer's home: where the race stands, what happened last, what is left to do. */
export const OrgDashboardPage = ({ race, access, funnel, distances, recent, setup, denied, now = new Date() }: Props) => {
  const base = `/org/${race.slug}`;
  const window = windowState(race, now);
  const items = todo(race, access, funnel, distances, setup);
  const left = items.filter((i) => !i.done).length;
  return (
    <>
      {denied ? <Flash tone="warn">Votre rôle ne permet pas d’ouvrir cette page. Demandez au responsable de la course.</Flash> : null}
      <PageHead
        title={race.theme.displayName}
        sub={
          <>
            <Badge tone={window.phase === 'open' ? 'good' : 'neutral'}>{race.status === 'draft' ? STATUS_LABELS.draft : window.phase === 'open' ? 'En cours' : window.phase === 'before' ? 'À venir' : 'Terminé'}</Badge>{' '}
            {window.text}.
          </>
        }
        actions={
          <>
            <a class="btn" href={`/${race.slug}`} target="_blank" rel="noopener">
              Page publique <Icon name="external" />
            </a>
            {can(access, 'edit_runners') ? (
              <a class="btn btn-primary" href={`${base}/runners/import`}>
                <Icon name="upload" /> Importer des coureurs
              </a>
            ) : null}
          </>
        }
      />
      <div class="stats">
        <Stat label="Inscrits" value={funnel.entrants} hint={plural(distances.length, 'distance', 'distances')} href={`${base}/runners`} />
        <Stat
          label="Connectés"
          value={funnel.signedIn}
          hint={`dont ${funnel.onApp} dans l’application`}
          share={share(funnel.signedIn, funnel.entrants)}
          href={`${base}/runners?filter=signed_in`}
        />
        <Stat label="Ont couru" value={funnel.started} share={share(funnel.started, funnel.entrants)} href={`${base}/runs`} />
        <Stat label="Arrivés" value={funnel.finished} hint="avec un temps officiel" share={share(funnel.finished, funnel.entrants)} href={`${base}/runs?filter=finished`} />
      </div>
      <div class="grid main-side" style="margin-top:16px">
        <div>
          <Card title="Dernières activités" actions={recent.length > 0 ? <a href={`${base}/runs`}>Tout voir</a> : undefined}>
            {recent.length === 0 ? (
              <Empty title="Personne n’a encore couru.">Les courses des coureurs apparaîtront ici dès qu’ils auront terminé ou envoyé leur fichier.</Empty>
            ) : (
              <ul class="list">
                {recent.map((r) => {
                  const status = runStatusView(r);
                  return (
                    <li>
                      <a href={`${base}/runs/${encodeURIComponent(r.id)}`}>
                        <div class="main">
                          <b>
                            {r.firstName} {r.lastName.toUpperCase()} <span class="muted num">#{r.bib}</span>
                          </b>
                          <span>
                            {distanceName(r.distanceKey)} · {ago(r.at, now, race.timezone)}
                          </span>
                        </div>
                        <div style="display:flex;gap:10px;align-items:center">
                          {r.elapsedMs > 0 ? <span class="num" style="font-size:19px">{formatOfficialTime(r.elapsedMs)}</span> : null}
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="Par distance" flush>
            <div class="table-wrap">
              <table class="a-table">
                <thead>
                  <tr>
                    <th>Distance</th>
                    <th class="num">Inscrits</th>
                    <th class="num">Arrivés</th>
                    <th>Parcours</th>
                    <th>Annonces</th>
                  </tr>
                </thead>
                <tbody>
                  {distances.map((d) => (
                    <tr>
                      <td>
                        <a class="row-link" href={`${base}/runners?distance=${d.distanceKey}`}>
                          {distanceName(d.distanceKey)}
                        </a>
                      </td>
                      <td class="num">{d.entrants}</td>
                      <td class="num">{d.finished}</td>
                      <td>{d.hasTrace ? <Badge tone="good">Prêt</Badge> : <Badge tone="warn">À importer</Badge>}</td>
                      <td>{d.published ? <Badge tone="good">Publiées</Badge> : <Badge tone="warn">À publier</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <div>
          <Card title={left === 0 ? 'Tout est prêt' : 'Pour être prêt'} sub={left === 0 ? undefined : `${plural(left, 'chose', 'choses')} à faire`}>
            <Checklist items={items} />
          </Card>
          <Card title="Télécharger" sub="Des fichiers qui s’ouvrent dans Excel ou Google Sheets.">
            <div style="display:grid;gap:8px">
              <a class="btn btn-block" href={`${base}/export/entrants.csv`}>
                <Icon name="download" /> Liste des coureurs
              </a>
              <a class="btn btn-block" href={`${base}/export/results.csv`}>
                <Icon name="download" /> Résultats
              </a>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};
