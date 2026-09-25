import type { CsvRejection, Race } from '@sivoov/shared';
import { Card, Field, Flash, PageHead } from './ui';

export type ImportOutcome = { inserted: number; updated: number; rejected: CsvRejection[] };

const REASONS: Record<CsvRejection['reason'], string> = {
  missing_columns: 'Colonnes manquantes',
  bad_distance: 'Distance inconnue',
  bad_email: 'Email invalide',
  missing_field: 'Case vide',
  duplicate_bib: 'Dossard en double dans le fichier',
  column_count: 'Nombre de colonnes incorrect',
};

export const describeRejection = (r: CsvRejection): string => `${REASONS[r.reason]}${r.detail ? ` (${r.detail})` : ''}`;

/** Paste or send the ticketing file; importing the same file twice is safe. */
export const OrgImportPage = ({ race, outcome }: { race: Race; outcome?: ImportOutcome }) => (
  <>
    <PageHead title="Importer des coureurs" back={{ href: `/org/${race.slug}/runners`, label: 'Coureurs' }} />
    {outcome ? (
      <>
        {outcome.inserted + outcome.updated > 0 ? (
          <Flash tone="good">
            Import terminé : {outcome.inserted} ajoutés, {outcome.updated} mis à jour, {outcome.rejected.length} refusés.
          </Flash>
        ) : (
          <Flash tone="bad">Aucune ligne importée. {outcome.rejected.length} refusées.</Flash>
        )}
        {outcome.rejected.length > 0 ? (
          <Card title="Lignes refusées">
            <ul class="list">
              {outcome.rejected.map((r) => (
                <li style="padding:8px 0">
                  <b class="num">Ligne {r.line}</b> {describeRejection(r)}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </>
    ) : null}
    <Card>
      <p class="muted" style="margin-bottom:16px;max-width:62ch">
        Colonnes attendues : dossard, email, prénom, nom, distance. Séparées par des virgules ou des points-virgules. Un dossard déjà présent est mis à jour.
      </p>
      <form method="post" action={`/org/${race.slug}/runners/import`} enctype="multipart/form-data">
        <Field label="Fichier" for="file">
          <input id="file" name="file" type="file" accept=".csv,text/csv,text/plain" />
        </Field>
        <Field label="ou collez le contenu" for="csv">
          <textarea id="csv" name="csv" class="mono" placeholder={'dossard;email;prénom;nom;distance\n1001;marc@example.com;Marc;Dupont;semi'}></textarea>
        </Field>
        <button class="btn btn-primary" type="submit">
          Importer
        </button>
      </form>
    </Card>
  </>
);
