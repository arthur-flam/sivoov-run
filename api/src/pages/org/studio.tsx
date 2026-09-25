import { MOMENTS, SPEECH_CHARS_PER_SECOND, buildTrack, formatKm, formatPace } from '@sivoov/shared';
import type { Course, Race, ScriptLine } from '@sivoov/shared';
import type { LineStatus, PlacedFiring, StudioPageData } from '../../lib/studio';
import { CourseDiagram } from '../courseDiagram';
import { distanceName } from './format';
import { MOMENT_COPY, PUBLISH_CONFIRM } from './studioCopy';
import { StudioLine } from './studioLine';
import { studioStyles } from './studioStyles';
import { studioClient } from './studioClient';
import { Icon, PageHead } from './ui';

const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

type Props = { race: Race; course: Course; data: StudioPageData };

/** The blank line the "Ajouter" buttons clone; the client fills in the trigger for the moment. */
export const blankLine = (courseId: string): ScriptLine => ({
  id: '__ID__',
  title: 'Nouvelle annonce',
  category: 'course',
  mix: 'duck',
  priority: 5,
  once: true,
  trigger: { kind: 'distance', meters: 1000 },
  key: `${courseId}-nouveau`,
  text: '…',
});

const blankStatus = (): LineStatus => ({
  id: '__ID__',
  source: 'voice',
  hash: '',
  template: false,
  rendered: false,
  bytes: 0,
  when: '',
  moment: 'course',
  audioPath: null,
  label: 'À enregistrer',
  tone: 'warn',
});

/** Left offset on the frise, as a percentage of the official distance. */
const pct = (meters: number, distanceM: number): string => `${((Math.min(meters, distanceM) / Math.max(1, distanceM)) * 100).toFixed(2)}%`;

/** The frise under the map: one dot per firing (faint for repeats), a label every 5 km and the total at the end. */
const Timeline = ({ firings, distanceM, categoryOf }: { firings: PlacedFiring[]; distanceM: number; categoryOf: (id: string) => string }) => {
  const labels = Array.from({ length: Math.floor(distanceM / 5000) + 1 }, (_, i) => i * 5000).filter((m) => m < distanceM * 0.88);
  return (
    <div class="timeline">
      <div class="tl-track" data-role="tl-dots">
        {firings
          .filter((f) => f.meters !== null)
          .map((f) =>
            f.recurring ? (
              <i class={`tl-dot faint cat-${categoryOf(f.eventId)}`} style={`left:${pct(f.meters!, distanceM)}`}></i>
            ) : (
              <button type="button" class={`tl-dot cat-${categoryOf(f.eventId)}`} data-event={f.eventId} style={`left:${pct(f.meters!, distanceM)}`} title={f.label} aria-label={f.label}></button>
            ),
          )}
      </div>
      <div class="tl-scale" aria-hidden="true">
        {labels.map((m) => (
          <span style={`left:${pct(m, distanceM)}`}>{m / 1000}</span>
        ))}
        <span style="left:100%">{formatKm(distanceM, 'fr', 1)}</span>
      </div>
    </div>
  );
};

/**
 * The studio: what the runner hears and where. The course on a map with every announcement on
 * it, the announcements grouped by moment in running order, each opening into a plain editor,
 * and the publish button always in sight. Without a Mapbox token or without network (the
 * screenshot rig), the map falls back to the SVG course diagram carrying the same markers.
 * Viewers get the same page read-only: they listen, they do not edit.
 */
export const OrgStudioPage = ({ race, course, data }: Props) => {
  const { script, firings, lines, points, distanceM, mapboxToken, summary, canEdit } = data;
  const track = points.length >= 2 ? buildTrack(points) : null;
  const withMap = Boolean(mapboxToken && track);
  const lineById = (id: string) => script.lines.find((l) => l.id === id);
  const categoryOf = (id: string) => lineById(id)?.category ?? 'course';
  const base = `/org/${race.slug}/courses/${course.id}`;
  const toRecord = lines.filter((l) => l.source === 'voice' && !l.rendered).length;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: studioStyles }} />
      {withMap ? <link rel="stylesheet" href={LEAFLET_CSS} /> : null}
      <div class="st-head">
        <PageHead
          back={{ href: `/org/${race.slug}/courses`, label: 'Parcours et annonces' }}
          title={`Annonces · ${distanceName(course.distanceKey)}`}
          sub={
            <>
              <span data-role="summary">{summary.text}</span>
              <span class="st-state" data-role="state" aria-live="polite">
                {data.ttsReady ? '' : 'La voix de l’annonceur n’est pas disponible ici : « Écouter » utilise la voix de l’ordinateur.'}
              </span>
            </>
          }
          actions={
            canEdit ? (
              <div class="st-publish">
                <button class="btn btn-primary" type="button" data-role="publish" disabled={!summary.button.enabled}>
                  {summary.button.label}
                </button>
                <span class="st-note" data-role="publish-note">
                  {summary.button.note}
                </span>
              </div>
            ) : (
              <div class="st-publish">
                <span class="badge neutral">Lecture seule</span>
                <span class="st-note">Vous pouvez écouter les annonces, sans les modifier.</span>
              </div>
            )
          }
        />
      </div>
      <div class="studio">
        <div class="studio-map">
          <div class="map-card">
            {withMap ? <div id="studio-map" data-role="map"></div> : null}
            <div class={`map-fallback${withMap ? ' hide' : ''}`} data-role="fallback">
              {track ? (
                <CourseDiagram
                  track={track}
                  officialM={distanceM}
                  landmarks={course.landmarks}
                  width={560}
                  height={360}
                  markers={firings
                    .filter((f) => f.lat !== null && f.lng !== null)
                    .map((f) => ({ id: f.eventId, lat: f.lat!, lng: f.lng!, category: categoryOf(f.eventId), occurrence: f.occurrence, faint: f.recurring }))}
                />
              ) : (
                <p class="empty">
                  Pas encore de tracé pour ce parcours. Importez le fichier GPX depuis la page <a href={`/org/${race.slug}/courses`}>Parcours et annonces</a>.
                </p>
              )}
              {track ? (
                <p class="note">
                  {mapboxToken ? 'Carte indisponible : tracé schématique.' : 'Tracé schématique : les annonces sont placées au même endroit que sur la carte.'}
                </p>
              ) : null}
            </div>
          </div>
          <Timeline firings={firings} distanceM={distanceM} categoryOf={categoryOf} />
          {withMap && canEdit ? <p class="map-help">Touchez le tracé pour ajouter une annonce à cet endroit.</p> : null}
          <label class="pace-row">
            Les annonces prévues à un temps de course sont placées pour un coureur à
            <input data-role="pace" type="text" value={formatPace(data.paceSecPerKm)} inputmode="numeric" aria-label="Allure du coureur, en minutes par kilomètre" />
            /km.
          </label>
        </div>
        <div class="studio-list">
          <div class="st-tools">
            <button class="btn btn-sm" type="button" data-role="listen-all" disabled={lines.length === 0}>
              <Icon name="play" /> Tout écouter
            </button>
            {canEdit && data.ttsReady ? (
              <button class="btn btn-sm" type="button" data-role="render-all" hidden={toRecord === 0}>
                Enregistrer les voix manquantes
              </button>
            ) : null}
          </div>
          {MOMENTS.map((moment) => {
            const rows = lines.filter((l) => l.moment === moment);
            return (
              <section class="ev-group" data-group={moment}>
                <div class="ev-group-h">
                  <h2>{MOMENT_COPY[moment].title}</h2>
                  <span>{MOMENT_COPY[moment].hint}</span>
                </div>
                <div class="ev-list" data-role="list" data-moment={moment}>
                  {rows.map((status) => {
                    const line = lineById(status.id);
                    return line ? <StudioLine line={line} status={status} canEdit={canEdit} ttsReady={data.ttsReady} /> : null;
                  })}
                </div>
                <p class="ev-none" data-role="none" hidden={rows.length > 0}>
                  Pas encore d’annonce.
                </p>
                {canEdit ? (
                  <button class="btn btn-sm btn-quiet ev-add" type="button" data-role="add" data-moment={moment}>
                    <Icon name="plus" /> {MOMENT_COPY[moment].add}
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
      {canEdit ? (
        <template data-role="line-template">
          <StudioLine line={blankLine(course.id)} status={blankStatus()} canEdit={canEdit} ttsReady={data.ttsReady} />
        </template>
      ) : null}
      <script
        type="application/json"
        id="studio-data"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ ...data, base, perSecond: SPEECH_CHARS_PER_SECOND, confirmPublish: PUBLISH_CONFIRM }).replaceAll('<', '\\u003c'),
        }}
      />
      {withMap ? <script src={LEAFLET_JS} defer></script> : null}
      <script defer dangerouslySetInnerHTML={{ __html: studioClient }} />
    </>
  );
};
