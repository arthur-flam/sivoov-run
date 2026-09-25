import { fixTally, formatClock, formatPace, lastStretch, splitRows } from '@sivoov/shared';
import type { HeardRow, Run, RunTrace } from '@sivoov/shared';
import { dateTimeFr, plural } from './format';
import { PLATFORM_LABELS, howLabel, km, kmNumber } from './runsCopy';
import { Badge, Card, Disclosure, Empty, Icon, KeyValues, LogLines, Meter } from './ui';

/** The parts of one run's page below the map. Each is a card that says something when it has nothing. */

export const SplitsCard = ({ run }: { run: Run }) => {
  const rows = splitRows(run.splits);
  const tail = lastStretch(run.splits, run);
  return (
    <Card title="Kilomètre par kilomètre" sub={rows.some((r) => r.fastest) ? 'Le plus rapide et le plus lent sont signalés.' : undefined} flush>
      {rows.length === 0 && !tail ? (
        <Empty title="Pas de temps au kilomètre.">Le téléphone n’a pas enregistré de passage.</Empty>
      ) : (
        <div class="table-wrap">
          <table class="a-table">
            <thead>
              <tr>
                <th>Km</th>
                <th>Allure</th>
                <th class="fill">
                  <span class="sr">Allure en barre</span>
                </th>
                <th class="num">Au passage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td class="bib">{r.km}</td>
                  <td>
                    <span class="num">{formatPace(r.paceSecPerKm)}</span>
                    <span class="muted small">{'\u00a0/km'}</span>
                    {r.fastest ? (
                      <span class="sub">
                        <Badge tone="good">Le plus rapide</Badge>
                      </span>
                    ) : null}
                    {r.slowest ? (
                      <span class="sub">
                        <Badge tone="warn">Le plus lent</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td class="fill">
                    <Meter share={r.share} tone={r.fastest ? 'good' : r.slowest ? 'warn' : 'neutral'} />
                  </td>
                  <td class="num">{formatClock(r.elapsedMs)}</td>
                </tr>
              ))}
              {tail ? (
                <tr>
                  <td>
                    Fin
                    <span class="sub">{`${Math.round(tail.meters)}\u00a0m`}</span>
                  </td>
                  <td>
                    <span class="num">{formatPace(tail.paceSecPerKm)}</span>
                    <span class="muted small">{'\u00a0/km'}</span>
                  </td>
                  <td class="fill"></td>
                  <td class="num">{formatClock(run.elapsedMs)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export const HeardCard = ({ rows, hasTrace }: { rows: HeardRow[]; hasTrace: boolean }) => {
  const played = rows.reduce((n, r) => n + r.times, 0);
  return (
    <Card title="Ce que le coureur a entendu" sub={rows.length > 0 ? `${plural(played, 'annonce jouée', 'annonces jouées')}, dans l’ordre.` : undefined} flush>
      {rows.length === 0 ? (
        <Empty title={hasTrace ? 'Aucune annonce jouée.' : 'Pas d’information.'}>
          {hasTrace ? 'Le téléphone n’a joué aucune annonce pendant cette course.' : 'Le téléphone n’a pas envoyé le détail de la course.'}
        </Empty>
      ) : (
        <div class="table-wrap">
          <table class="a-table">
            <thead>
              <tr>
                <th>Km</th>
                <th>Annonce</th>
                <th class="num">Temps</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td class="bib">
                    {r.times > 1 ? `${kmNumber(r.distanceM, 0)} à ${kmNumber(r.lastDistanceM, 0)}` : kmNumber(r.distanceM)}
                  </td>
                  <td>
                    {r.title}
                    {r.times > 1 ? <span class="sub">{`${r.times} fois`}</span> : null}
                  </td>
                  <td class="num">{r.times > 1 ? '' : formatClock(r.elapsedMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export const PhoneCard = ({ run }: { run: Run }) => {
  const d = run.device;
  const system = d ? [PLATFORM_LABELS[d.platform] ?? d.platform, d.osVersion].filter(Boolean).join(' ') : '';
  return (
    <Card title="Téléphone">
      <KeyValues
        rows={[
          ['Envoyé par', howLabel(run.source, d?.platform)],
          ...(d
            ? ([
                ['Système', system],
                ...(d.model ? [['Modèle', d.model] as [string, string]] : []),
                ...(d.appVersion ? [['Application', `version ${d.appVersion}`] as [string, string]] : []),
              ] as Array<[string, string]>)
            : ([['Téléphone', 'Pas d’information']] as Array<[string, string]>)),
        ]}
      />
    </Card>
  );
};

export const DownloadsCard = ({ href, gpx, raw }: { href: string; gpx: boolean; raw: boolean }) => (
  <Card title="Télécharger" sub={gpx ? 'Le fichier GPX s’ouvre dans la plupart des applications de course et de cartes.' : undefined}>
    {gpx || raw ? (
      <div style="display:grid;gap:8px">
        {gpx ? (
          <a class="btn btn-block" href={`${href}/trace.gpx`}>
            <Icon name="download" /> Télécharger la trace (GPX)
          </a>
        ) : null}
        {raw ? (
          <a class="btn btn-block btn-quiet" href={`${href}/trace.json`}>
            <Icon name="download" /> Données brutes
          </a>
        ) : null}
      </div>
    ) : (
      <p class="muted small">Rien à télécharger : le téléphone n’a pas envoyé de trace.</p>
    )}
  </Card>
);

const COUNTER_LABELS: Record<string, string> = {
  'task.batches': 'Lots de points reçus',
  'task.fixes': 'Points GPS reçus',
  'task.dropped': 'Points perdus hors course',
  'task.empty': 'Lots vides',
  'task.errors': 'Erreurs de localisation',
  'upload.failed': 'Envois échoués',
};

const LOG_LINES = 40;

/** "12:05.3" from milliseconds since the log began. */
const logClock = (ms: number): string => `${formatClock(ms)}.${Math.floor((ms % 1000) / 100)}`;

type TechProps = { run: Run; receivedAt: string; trace: RunTrace | null; traceUnreadable: boolean; timezone: string };

/** For support: counters and the end of the phone's log. Closed unless someone opens it. */
export const TechCard = ({ run, receivedAt, trace, traceUnreadable, timezone }: TechProps) => {
  const diagnostics = trace?.diagnostics;
  const tally = fixTally(diagnostics);
  const lines = (diagnostics?.lines ?? []).slice(-LOG_LINES);
  const rows: Array<[string, string]> = [
    ['Référence', run.id],
    ['Reçue le', dateTimeFr(receivedAt, timezone)],
    ...(run.startedAt ? [['Départ', dateTimeFr(run.startedAt, timezone)] as [string, string]] : []),
    ...(run.finishedAt ? [['Fin', dateTimeFr(run.finishedAt, timezone)] as [string, string]] : []),
    ['Distance mesurée', km(run.distanceM, 3)],
    ['Points GPS enregistrés', trace ? trace.samples.length.toLocaleString('fr-FR') : traceUnreadable ? 'Fichier illisible' : 'Aucun'],
    // Most rejected fixes are simply too close to the previous one to add distance; the rest were imprecise.
    ...(tally ? [['Filtre GPS', `${tally.accepted.toLocaleString('fr-FR')} points retenus, ${tally.rejected.toLocaleString('fr-FR')} écartés (trop proches ou imprécis)`] as [string, string]] : []),
    ...Object.entries(diagnostics?.counters ?? {}).map(([k, v]) => [COUNTER_LABELS[k] ?? k, v.toLocaleString('fr-FR')] as [string, string]),
    ...(diagnostics && diagnostics.dropped > 0 ? [['Lignes du journal perdues', diagnostics.dropped.toLocaleString('fr-FR')] as [string, string]] : []),
  ];
  return (
    <section class="card">
      <Disclosure summary="Détails techniques" hint="Pour le support">
        <KeyValues rows={rows} />
        {lines.length > 0 ? (
          <>
            <p class="small muted" style="margin-top:14px">
              Journal du téléphone, {plural(lines.length, 'dernière ligne', 'dernières lignes')}.
            </p>
            <LogLines lines={lines.map((l) => `${logClock(l.atMs).padStart(9)}  ${l.tag.padEnd(9)} ${l.message}`)} />
          </>
        ) : (
          <p class="small muted" style="margin-top:14px">
            Le téléphone n’a pas envoyé de journal.
          </p>
        )}
      </Disclosure>
    </section>
  );
};
