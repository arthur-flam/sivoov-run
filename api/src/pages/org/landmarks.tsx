import { decimalFr, landmarkRows } from '@sivoov/shared';
import type { Course, LandmarkRow } from '@sivoov/shared';
import { KeyValues } from './ui';

/** What the form sends back on an error: the typed rows and, per row index, what to fix. */
export type LandmarksForm = { courseId: string; rows: LandmarkRow[]; errors: Record<number, string> };

type Props = { course: Course; base: string; canEdit: boolean; form?: LandmarksForm };

const EMPTY: LandmarkRow = { id: '', name: '', km: '', description: '' };

const Row = ({ row, index, error, courseId }: { row: LandmarkRow; index: number; error?: string; courseId: string }) => {
  const label = row.name || `nouveau lieu`;
  return (
    <div class={error ? 'list-edit-row bad' : 'list-edit-row'}>
      <input type="hidden" name="id" value={row.id} />
      <input name="name" type="text" value={row.name} placeholder="Nom du lieu" aria-label={`Nom (${label})`} maxlength={80} id={`lm-${courseId}-${index}`} />
      <input name="km" type="text" inputmode="decimal" value={row.km} placeholder="km" aria-label={`Au km (${label})`} />
      <input class="wide" name="description" type="text" value={row.description} placeholder="Une phrase, facultative" aria-label={`Description (${label})`} maxlength={200} />
      {error ? <span class="err">{error}</span> : null}
    </div>
  );
};

/**
 * "Les lieux du parcours" on a course card: the places the course passes, shown on the public
 * race page and on the studio map. Edited as a plain list; an empty row adds one, emptying a row
 * removes it. Viewers read the list.
 */
export const LandmarksEditor = ({ course, base, canEdit, form }: Props) => {
  const mine = form?.courseId === course.id ? form : undefined;
  const rows = mine ? mine.rows : [...landmarkRows(course.landmarks), EMPTY];
  const count = course.landmarks.length;
  return (
    <details class="disclose" open={Boolean(mine)}>
      <summary>{count > 0 ? `Les lieux du parcours (${count})` : 'Les lieux du parcours'}</summary>
      <p class="small muted">Les lieux que le coureur traverse. Ils s’affichent sur la page publique de la course et sur la carte des annonces.</p>
      {canEdit ? (
        <form method="post" action={`${base}/${course.id}/landmarks`}>
          <div class="list-edit">
            <div class="list-edit-head" aria-hidden="true">
              <span>Nom</span>
              <span>Au km</span>
            </div>
            {rows.map((row, index) => (
              <Row row={row} index={index} error={mine?.errors[index]} courseId={course.id} />
            ))}
          </div>
          <p class="small muted">Remplissez la dernière ligne pour ajouter un lieu. Videz une ligne pour le retirer.</p>
          <div class="form-actions">
            <button class="btn" type="submit">
              Enregistrer les lieux
            </button>
          </div>
        </form>
      ) : count === 0 ? (
        <p class="muted">Pas encore de lieu.</p>
      ) : (
        <KeyValues rows={course.landmarks.map((l) => [`km ${decimalFr(l.meters / 1000, 1)}`, l.description ? `${l.name} · ${l.description}` : l.name])} />
      )}
    </details>
  );
};
