import { DISTANCE_METERS, distanceLabel, formatKm } from '@sivoov/shared';
import type { Course, DistanceKey, Organizer, Race } from '@sivoov/shared';
import type { PackSummary } from '../../db/scriptQueries';
import { OrgShell } from './shell';
import { studioStyles } from './studioStyles';

export type CourseCard = {
  course: Course;
  /** Length measured on the uploaded GPX, or null when the course has no trace yet. */
  measuredM: number | null;
  draft: { version: number; updatedAt: string; lines: number } | null;
  pack: PackSummary | null;
};

type Props = { race: Race; organizer: Organizer; cards: CourseCard[]; error?: string; notice?: string };

const KEYS: DistanceKey[] = ['marathon', 'half', '10k', '5k'];
const label = (key: DistanceKey) => distanceLabel('fr', key);
const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} à ${iso.slice(11, 16)}`;

const kb = (bytes: number) => `${Math.round(bytes / 1024)} ko`;

/** One card per course: the trace, the landmarks, the draft, the published pack, the studio. */
export const OrgCoursesPage = ({ race, organizer, cards, error, notice }: Props) => (
  <OrgShell race={race} organizer={organizer} current="courses">
    <style dangerouslySetInnerHTML={{ __html: studioStyles }} />
    {error ? <div class="error" role="alert">{error}</div> : null}
    {notice ? <div class="ok" role="status">{notice}</div> : null}
    <p style="color:var(--ink-2);max-width:64ch;margin-bottom:18px">
      Chaque épreuve a un parcours (le tracé GPX), des points de repère et un script audio. Ouvrez le studio pour poser
      les événements sur la carte, écouter les textes et publier la version que l’application téléchargera.
    </p>
    <div class="course-cards">
      {cards.map(({ course, measuredM, draft, pack }) => {
        const base = `/org/${race.slug}/courses/${course.id}`;
        return (
          <div class="course-card">
            <h3>{label(course.distanceKey)}</h3>
            <dl>
              <dt>Distance officielle</dt>
              <dd>{formatKm(course.distanceM, 'fr', 3)}</dd>
              <dt>Tracé</dt>
              <dd class={measuredM === null ? 'miss' : ''}>{measuredM === null ? 'aucun tracé' : `${formatKm(measuredM, 'fr', 2)} mesurés`}</dd>
              <dt>Repères</dt>
              <dd>{course.landmarks.length}</dd>
              <dt>Script</dt>
              <dd class={draft === null ? 'miss' : ''}>
                {draft === null ? 'aucun script' : `v${draft.version} · ${draft.lines} lignes · ${day(draft.updatedAt)}`}
              </dd>
              <dt>Publié</dt>
              <dd class={pack === null ? 'miss' : ''}>{pack === null ? 'rien publié' : `v${pack.version} · ${pack.files} fichiers · ${kb(pack.bytes)}`}</dd>
            </dl>
            <a class="btn btn-race" href={base}>Ouvrir le studio</a>
            <form method="post" action={`${base}/gpx`} enctype="multipart/form-data">
              <label class="ev-flag" for={`gpx-${course.id}`}>{measuredM === null ? 'Importer le tracé GPX' : 'Remplacer le tracé GPX'}</label>
              <input id={`gpx-${course.id}`} name="gpx" type="file" accept=".gpx,application/gpx+xml,text/xml" required />
              <button class="btn btn-ghost" type="submit">Envoyer le GPX</button>
            </form>
          </div>
        );
      })}
    </div>
    <h3 style="font-family:var(--font-display);font-weight:500;font-size:22px;margin:30px 0 12px">Ajouter un parcours</h3>
    <form method="post" action={`/org/${race.slug}/courses`} style="max-width:420px">
      <div class="field">
        <label for="distanceKey">Épreuve</label>
        <select id="distanceKey" name="distanceKey" style="font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--ink);width:100%">
          {KEYS.filter((k) => !cards.some((c) => c.course.distanceKey === k)).map((k) => (
            <option value={k}>{label(k)}</option>
          ))}
        </select>
      </div>
      <div class="field">
        <label for="distanceM">Distance officielle (mètres)</label>
        <input id="distanceM" name="distanceM" type="number" min="100" step="0.5" value={String(DISTANCE_METERS.marathon)} required />
      </div>
      <button class="btn btn-ghost" type="submit" disabled={cards.length >= KEYS.length}>
        Ajouter un parcours
      </button>
    </form>
  </OrgShell>
);
