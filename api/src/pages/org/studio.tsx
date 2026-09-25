import { buildTrack, distanceLabel, formatKm, formatPace } from '@sivoov/shared';
import type { Access, Course, Race, ScriptLine } from '@sivoov/shared';
import type { LineStatus, PlacedFiring, StudioPageData } from '../../lib/studio';
import { CourseDiagram } from '../courseDiagram';
import { StudioLine } from './studioLine';
import { studioStyles } from './studioStyles';
import { studioClient } from './studioClient';

const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

type Props = { race: Race; access: Access; course: Course; data: StudioPageData };

/** The blank line the "Ajouter un événement" button clones. */
export const blankLine = (courseId: string): ScriptLine => ({
  id: '__ID__',
  title: 'Nouvel événement',
  category: 'course',
  mix: 'duck',
  priority: 5,
  once: true,
  trigger: { kind: 'distance', meters: 0 },
  key: `${courseId}-nouveau`,
  text: 'À écrire.',
});

const blankStatus = (): LineStatus => ({ id: '__ID__', hash: '', template: false, rendered: false, bytes: 0, summary: '' });

const TIMELINE_W = 1000;

const timelineDots = (firings: PlacedFiring[], distanceM: number) =>
  firings
    .filter((f) => f.meters !== null)
    .map((f) => ({ f, x: (Math.min(f.meters!, distanceM) / Math.max(1, distanceM)) * TIMELINE_W }));

/**
 * The studio: the course on a map, every audio event placed on it, the list and the editor
 * below, and the publish button. Without a Mapbox token or without network (the screenshot
 * rig), the map card falls back to the SVG course diagram carrying the same markers.
 */
export const OrgStudioPage = ({ race, course, data }: Props) => {
  const { script, firings, lines, points, distanceM, mapboxToken } = data;
  const track = points.length >= 2 ? buildTrack(points) : null;
  const withMap = Boolean(mapboxToken && track);
  const statusOf = (id: string): LineStatus => lines.find((l) => l.id === id) ?? blankStatus();
  const whenOf = (id: string): string => firings.find((f) => f.eventId === id)?.label ?? '—';
  const missing = lines.filter((l) => !l.template && !l.rendered);
  const ready = lines.filter((l) => !l.template && l.rendered);
  const ordered = [...script.lines].sort((a, b) => {
    const fa = firings.findIndex((f) => f.eventId === a.id);
    const fb = firings.findIndex((f) => f.eventId === b.id);
    return (fa < 0 ? Infinity : fa) - (fb < 0 ? Infinity : fb);
  });
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: studioStyles }} />
      {withMap ? <link rel="stylesheet" href={LEAFLET_CSS} /> : null}
      <div class="studio-head">
        <h3>
          Studio · {distanceLabel('fr', course.distanceKey)}
        </h3>
        <span class="meta">
          <b>{formatKm(distanceM, 'fr', 3)}</b> officiels ·{' '}
          {data.measuredM === null ? 'aucun tracé' : `${formatKm(data.measuredM, 'fr', 2)} mesurés`} · brouillon <b>v{data.version}</b> ·{' '}
          <span class="pill">{script.voice.name}</span> · <a href={`/org/${race.slug}/courses`}>Tous les parcours</a>
        </span>
      </div>
      <div class="studio">
        <div class="studio-col">
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
                    .map((f) => ({
                      id: f.eventId,
                      lat: f.lat!,
                      lng: f.lng!,
                      category: script.lines.find((l) => l.id === f.eventId)?.category,
                      occurrence: f.occurrence,
                      faint: f.recurring,
                    }))}
                />
              ) : (
                <p class="empty">Aucun tracé pour ce parcours. Importez un GPX depuis la page des parcours.</p>
              )}
              <p class="note">
                {mapboxToken ? 'Carte indisponible : affichage du tracé schématique.' : 'Tracé schématique : les événements sont placés à la même distance que sur la carte.'}
              </p>
            </div>
          </div>
          <div class="timeline" style="margin-top:12px">
            <svg viewBox={`0 0 ${TIMELINE_W} 62`} role="img" aria-label="Frise des événements">
              <line x1="0" y1="40" x2={String(TIMELINE_W)} y2="40" stroke="var(--border)" stroke-width="2" />
              {Array.from({ length: Math.floor(distanceM / 5000) + 1 }, (_, i) => {
                const x = ((i * 5000) / Math.max(1, distanceM)) * TIMELINE_W;
                return (
                  <g>
                    <line x1={String(x)} y1="34" x2={String(x)} y2="46" stroke="var(--muted)" stroke-width="1" />
                    <text x={String(x)} y="60" font-size="11" fill="var(--muted)" text-anchor="middle">
                      {i * 5}
                    </text>
                  </g>
                );
              })}
              <g data-role="tl-dots">
                {timelineDots(firings, distanceM).map(({ f, x }) => (
                  <circle
                    class="tl-dot"
                    data-event={f.eventId}
                    data-occurrence={String(f.occurrence)}
                    cx={String(x)}
                    cy="22"
                    r={f.recurring ? '3' : '6'}
                    opacity={f.recurring ? '0.4' : '1'}
                    fill="var(--race-primary)"
                  />
                ))}
              </g>
            </svg>
          </div>
        </div>
        <div>
          <div class="toolbar">
            <label>
              Allure cible
              <input data-role="pace" type="text" value={formatPace(data.paceSecPerKm)} inputmode="numeric" aria-label="Allure cible en minutes par kilomètre" />
              /km
            </label>
            <button class="btn btn-ghost" type="button" data-role="listen-all">Écouter tout</button>
            <button class="btn btn-ghost" type="button" data-role="render-all" disabled={!data.ttsReady}>
              Tout générer
            </button>
            <button class="btn btn-ghost" type="button" data-role="add">Ajouter un événement</button>
          </div>
          <p class="state" data-role="state" aria-live="polite">
            {data.ttsReady ? '' : 'Génération de voix indisponible : ELEVENLABS_API_TOKEN n’est pas configuré ici.'}
          </p>
          <div class="ev-list" data-role="list">
            {ordered.map((line) => (
              <StudioLine line={line} status={statusOf(line.id)} when={whenOf(line.id)} ttsReady={data.ttsReady} />
            ))}
          </div>
          {script.lines.length === 0 ? <p class="empty">Aucun événement. Ajoutez-en un, ou cliquez sur le tracé.</p> : null}
          <div class="publish">
            <h4>Publier la version {data.version}</h4>
            <p data-role="publish-state">
              {ready.length} fichier{ready.length > 1 ? 's' : ''} prêt{ready.length > 1 ? 's' : ''} ·{' '}
              {Math.round(ready.reduce((n, l) => n + l.bytes, 0) / 1024)} ko
              {missing.length > 0 ? ` · ${missing.length} voix manquante${missing.length > 1 ? 's' : ''}` : ''}
            </p>
            <button class="btn btn-race" type="button" data-role="publish">Publier la version {data.version}</button>
            {data.packs.length > 0 ? (
              <p style="font-size:13px;color:var(--muted);margin-top:10px">
                Déjà publié : {data.packs.map((p) => `v${p.version} (${p.files} fichiers)`).join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <template data-role="line-template">
        <StudioLine line={blankLine(course.id)} status={blankStatus()} when="—" ttsReady={data.ttsReady} />
      </template>
      <script
        type="application/json"
        id="studio-data"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({ ...data, base: `/org/${race.slug}/courses/${course.id}` }).replaceAll('<', '\\u003c') }}
      />
      {withMap ? <script src={LEAFLET_JS} defer></script> : null}
      <script defer dangerouslySetInnerHTML={{ __html: studioClient }} />
    </>
  );
};
