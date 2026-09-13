import type { CsvRejection, Organizer, Race } from '@sivoov/shared';
import { OrgShell } from './shell';

export type ImportOutcome = { inserted: number; updated: number; rejected: CsvRejection[] };

const REASONS: Record<CsvRejection['reason'], string> = {
  missing_columns: 'Colonnes manquantes',
  bad_distance: 'Épreuve inconnue',
  bad_email: 'Email invalide',
  missing_field: 'Champ vide',
  duplicate_bib: 'Dossard en double dans le fichier',
  column_count: 'Nombre de colonnes incorrect',
};

export const describeRejection = (r: CsvRejection): string => `${REASONS[r.reason]}${r.detail ? ` (${r.detail})` : ''}`;

/** Paste or upload the ticketing CSV; re-importing the same file is safe. */
export const OrgImportPage = ({ race, organizer, outcome }: { race: Race; organizer: Organizer; outcome?: ImportOutcome }) => (
  <OrgShell race={race} organizer={organizer} current="import">
    {outcome ? (
      <>
        {outcome.inserted + outcome.updated > 0 ? (
          <div class="ok" role="status">Import terminé : {outcome.inserted} ajoutés, {outcome.updated} mis à jour, {outcome.rejected.length} rejetés.</div>
        ) : (
          <div class="error" role="alert">Aucune ligne importée. {outcome.rejected.length} rejetées.</div>
        )}
        {outcome.rejected.length > 0 ? (
          <ul class="rejects">
            {outcome.rejected.map((r) => (
              <li>
                <b>ligne {r.line}</b>
                {describeRejection(r)}
              </li>
            ))}
          </ul>
        ) : null}
      </>
    ) : null}
    <p style="color:var(--ink-2);max-width:60ch;margin-bottom:18px">
      Colonnes attendues : <code>dossard, email, prénom, nom, distance</code> (ou <code>bib, email, first_name, last_name, distance_key</code>), séparées par des virgules ou des points-virgules.
      Épreuves : marathon, semi, 10 km, 5 km. Un dossard déjà présent est mis à jour.
    </p>
    <form method="post" action={`/org/${race.slug}/import`} enctype="multipart/form-data" style="max-width:640px">
      <div class="field">
        <label for="file">Fichier CSV</label>
        <input id="file" name="file" type="file" accept=".csv,text/csv,text/plain" />
      </div>
      <div class="field">
        <label for="csv">ou collez le contenu</label>
        <textarea id="csv" name="csv" placeholder={'dossard;email;prénom;nom;distance\n1001;marc@example.com;Marc;Dupont;semi'}></textarea>
      </div>
      <button class="btn btn-race" type="submit">Importer</button>
    </form>
  </OrgShell>
);
