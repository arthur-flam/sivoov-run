import { can, formatOfficialTime, formatPace, heardRows, kmMarks, runVerdict } from '@sivoov/shared';
import type { Access, Race, RunTrace } from '@sivoov/shared';
import type { RunDetail } from '../../db/runQueries';
import { dateTimeFr, distanceName } from './format';
import { runStatusView } from './runStatus';
import { RunTraceMap } from './runsMap';
import type { KmMark } from './runsMap';
import { km, kmNumber, verdictSentence } from './runsCopy';
import { REVIEW_ID, ReviewCard, hasReview } from './runsReview';
import type { ReviewForm } from './runsReview';
import { DownloadsCard, HeardCard, PhoneCard, SplitsCard, TechCard } from './runsSections';
import { Badge, Card, Empty, Flash, Icon, PageHead, Stat } from './ui';

type Props = {
  race: Race;
  access: Access;
  detail: RunDetail;
  /** The trace from R2: null when the phone sent none, `unreadable` when the file does not parse. */
  trace: RunTrace | null;
  traceUnreadable: boolean;
  titles: ReadonlyMap<string, string>;
  /** Mapbox token for the map tiles; null draws the trace alone. */
  mapToken: string | null;
  done?: string;
  form?: ReviewForm;
};

/** One run, as the organizer reviews it: the time and whether it counts, the trace, the kilometres, what was heard. */
export const OrgRunPage = ({ race, access, detail, trace, traceUnreadable, titles, mapToken, done, form }: Props) => {
  const { run, entrant, course, exclusion } = detail;
  const base = `/org/${race.slug}`;
  const href = `${base}/runs/${encodeURIComponent(run.id)}`;
  const verdict = runVerdict(run, exclusion !== null);
  const counts = verdict === 'counts';
  const status = runStatusView({ status: run.status, source: run.source, excluded: exclusion !== null });
  const why = verdictSentence({ verdict, distanceM: run.distanceM, courseDistanceM: course.distanceM, exclusion, timezone: race.timezone });
  const samples = trace?.samples ?? [];
  const startMs = run.startedAt ? new Date(run.startedAt).getTime() : (samples[0]?.timestamp ?? 0);
  const marks: KmMark[] = kmMarks(samples, run.splits, startMs).map((m) => ({ ...m, elapsedMs: run.splits.find((s) => s.km === m.km)?.elapsedMs ?? null }));
  const heard = heardRows(trace?.audioFired ?? [], titles);
  const played = heard.reduce((n, r) => n + r.times, 0);
  const when = run.startedAt ?? run.finishedAt ?? detail.receivedAt;
  const reviewable = can(access, 'review_runs') && hasReview(verdict, exclusion);
  return (
    <>
      <PageHead
        back={{ href: `${base}/runs`, label: 'Activités' }}
        title={`${entrant.firstName} ${entrant.lastName.toUpperCase()}`}
        sub={
          <>
            <Badge tone={status.tone}>{status.label}</Badge> Dossard {entrant.bib} · {distanceName(course.distanceKey)} · {dateTimeFr(when, race.timezone)}
          </>
        }
        actions={
          <>
            <a class="btn" href={`${base}/runners/${encodeURIComponent(entrant.bib)}`}>
              <Icon name="runners" /> Fiche du coureur
            </a>
            {reviewable ? (
              <a class="btn btn-quiet narrow-only" href={`#${REVIEW_ID}`}>
                {exclusion ? 'Rétablir ce temps' : 'Écarter ce temps'}
              </a>
            ) : null}
          </>
        }
      />
      {done ? <Flash tone="good">{done}</Flash> : null}
      {/* Right after setting a time aside, the confirmation says it all; the reason is in the card. */}
      {why && !(done && verdict === 'excluded') ? <Flash tone={why.tone}>{why.text}</Flash> : null}
      <div class="stats">
        <Stat
          label={counts ? 'Temps officiel' : 'Temps'}
          value={run.elapsedMs > 0 ? formatOfficialTime(run.elapsedMs) : 'Pas encore'}
          hint={counts ? 'Compte dans les résultats' : 'Ne compte pas'}
        />
        <Stat
          label="Distance parcourue"
          value={
            <>
              {kmNumber(run.distanceM)}
              <small>km</small>
            </>
          }
          hint={`sur ${km(course.distanceM, 1)}`}
          share={course.distanceM > 0 ? run.distanceM / course.distanceM : 0}
        />
        <Stat
          label="Allure moyenne"
          value={
            run.distanceM >= 100 ? (
              <>
                {formatPace(run.elapsedMs / run.distanceM)}
                <small>/km</small>
              </>
            ) : (
              'Pas encore'
            )
          }
          hint="en moyenne sur la course"
        />
        <Stat label="Annonces" value={played} hint={trace ? 'jouées dans ses écouteurs' : 'pas d’information'} />
      </div>
      <div class="grid main-side" style="margin-top:16px">
        <div>
          <Card title="Le tracé du coureur" sub="Là où il a couru, enregistré par son téléphone.">
            {samples.length >= 2 ? (
              <RunTraceMap points={samples} marks={marks} finished={run.distanceM >= course.distanceM} token={mapToken} />
            ) : (
              <Empty title={traceUnreadable ? 'Le fichier de cette course est illisible.' : 'Pas de tracé pour cette course.'}>
                {traceUnreadable
                  ? 'Les données envoyées par le téléphone ne peuvent pas être lues. Téléchargez les données brutes pour le support.'
                  : 'Le téléphone n’a pas envoyé de points GPS.'}
              </Empty>
            )}
          </Card>
          <SplitsCard run={run} />
          <HeardCard rows={heard} hasTrace={trace !== null} />
        </div>
        <div>
          {reviewable ? <ReviewCard action={href} verdict={verdict} exclusion={exclusion} countsIfRestored={runVerdict(run, false) === 'counts'} timezone={race.timezone} form={form} /> : null}
          <PhoneCard run={run} />
          <DownloadsCard href={href} gpx={samples.length > 0} raw={trace !== null || traceUnreadable} />
          <TechCard run={run} receivedAt={detail.receivedAt} trace={trace} traceUnreadable={traceUnreadable} timezone={race.timezone} />
        </div>
      </div>
    </>
  );
};
