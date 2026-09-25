import type { CsvColumn, CsvParseResult, CsvRejection, CsvWarning, DistanceKey, PlannedEntrant, Race } from '@sivoov/shared';
import { distanceName, plural } from './format';
import { Badge, Card, FileDrop, Flash, Icon, PageHead, Stat } from './ui';
import type { Tone } from './ui';

/** Why a file could not even be read. */
export type ImportProblem = 'spreadsheet' | 'empty' | 'nothing';
export type ImportState =
  | { step: 'choose'; problem?: ImportProblem }
  | { step: 'preview'; text: string; fileName?: string; result: CsvParseResult; plan: PlannedEntrant[] };

type Props = { race: Race; distances: DistanceKey[]; state: ImportState };

const COLUMN_NAMES: Record<CsvColumn, string> = {
  bib: 'dossard', email: 'email', firstName: 'prénom', lastName: 'nom', distanceKey: 'distance',
  line1: 'adresse', line2: 'complément', postalCode: 'code postal', city: 'ville', country: 'pays',
};
const names = (detail = ''): string =>
  detail
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => COLUMN_NAMES[c as CsvColumn] ?? c)
    .join(', ');

/** « value » with non-breaking spaces, as French typography wants, so the quote never wraps alone. */
const quoted = (value: string): string => `\u00ab\u00a0${value}\u00a0\u00bb`;

/** "Marathon, Semi ou 10 km": the words that work in the distance column for this race. */
const distanceWords = (distances: DistanceKey[]): string => {
  const words = (distances.length > 0 ? distances : (['marathon', 'half', '10k', '5k'] as DistanceKey[])).map((d) => (d === 'half' ? 'Semi' : distanceName(d)));
  return words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} ou ${words[words.length - 1]}`;
};

/** A refused line, in plain words: what is wrong, then what to do. */
export const describeRejection = (r: CsvRejection, distances: DistanceKey[]): { what: string; fix: string } => {
  switch (r.reason) {
    case 'missing_columns':
      return { what: `Colonnes introuvables : ${names(r.detail)}.`, fix: 'La première ligne du fichier doit donner le titre de chaque colonne : Dossard, Prénom, Nom, Email, Distance. Partez du modèle si besoin.' };
    case 'column_count':
      return { what: 'Il manque des cases sur cette ligne.', fix: 'Vérifiez qu’elle a autant de colonnes que la ligne des titres.' };
    case 'missing_field':
      return { what: `Case vide : ${names(r.detail)}.`, fix: 'Remplissez-la dans votre fichier, ou retirez la ligne.' };
    case 'bad_distance':
      return { what: `Distance ${quoted(r.detail ?? '')} non reconnue.`, fix: `Écrivez ${distanceWords(distances)}.` };
    case 'distance_not_offered':
      return { what: `Distance ${quoted(r.detail ?? '')} : votre course ne la propose pas.`, fix: `Écrivez ${distanceWords(distances)}.` };
    case 'bad_email':
      return { what: `Email ${quoted(r.detail ?? '')} incorrect.`, fix: 'Corrigez-le : il ressemble à nom@exemple.fr.' };
    case 'duplicate_bib':
      return { what: `Le dossard ${r.bib ?? ''} est déjà utilisé ligne ${r.detail ?? ''}.`, fix: 'Chaque coureur a son propre dossard. Corrigez l’une des deux lignes.' };
  }
};

export const describeWarning = (w: CsvWarning): { what: string; fix: string } =>
  w.reason === 'incomplete_address'
    ? { what: `Adresse incomplète, il manque : ${names(w.detail)}.`, fix: 'Le coureur sera importé sans adresse. Complétez-la dans le fichier, ou plus tard sur sa fiche.' }
    : { what: `Pays ${quoted(w.detail)} non reconnu.`, fix: 'Le coureur sera importé sans adresse. Écrivez le pays en toutes lettres, par exemple France ou Belgique.' };

const CHANGE: Record<PlannedEntrant['change'], { label: string; tone: Tone }> = {
  new: { label: 'Nouveau', tone: 'info' },
  updated: { label: 'Mis à jour', tone: 'warn' },
  same: { label: 'Déjà à jour', tone: 'neutral' },
};

const PREVIEW_ROWS = 8;
const PROBLEMS: Record<ImportProblem, string> = {
  spreadsheet: 'Ce fichier est un classeur Excel, que nous ne savons pas lire. Dans Excel, choisissez Fichier, puis Enregistrer sous, et le format « CSV UTF-8 (délimité par des virgules) ». Envoyez ensuite ce nouveau fichier.',
  empty: 'Ce fichier est vide. Vérifiez que vous avez choisi le bon.',
  nothing: 'Choisissez un fichier, ou collez les lignes copiées depuis votre tableur.',
};

/** What the file needs, with a tiny example and the template. */
const Requirements = ({ race, distances }: { race: Race; distances: DistanceKey[] }) => (
  <Card title="Ce que votre fichier doit contenir" sub="Une ligne par coureur. Les titres en français ou en anglais, dans l’ordre que vous voulez.">
    <div class="table-wrap">
      <table class="a-table mini">
        <thead>
          <tr>
            <th>Dossard</th>
            <th>Prénom</th>
            <th>Nom</th>
            <th>Distance</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1001</td>
            <td>Marie</td>
            <td>Durand</td>
            <td>{distances[0] === 'half' ? 'Semi' : distanceName(distances[0] ?? 'marathon')}</td>
            <td>marie@exemple.fr</td>
          </tr>
          <tr>
            <td>1002</td>
            <td>Paul</td>
            <td>Martin</td>
            <td>{distances[1] ? (distances[1] === 'half' ? 'Semi' : distanceName(distances[1])) : '42,195 km'}</td>
            <td>paul@exemple.fr</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>Distance : {distanceWords(distances)}. Pour envoyer la médaille, ajoutez si vous voulez les colonnes Adresse, Complément, Code postal, Ville et Pays.</p>
    <p>Un dossard déjà présent est mis à jour, jamais ajouté en double. Vous pouvez donc renvoyer le même fichier complété.</p>
    <div class="form-actions">
      <a class="btn" href={`/org/${race.slug}/runners/import/modele.csv`}>
        <Icon name="download" /> Télécharger un modèle
      </a>
    </div>
  </Card>
);

const Choose = ({ race }: { race: Race }) => (
  <Card title="Votre fichier">
    <form method="post" action={`/org/${race.slug}/runners/import`} enctype="multipart/form-data">
      <input type="hidden" name="step" value="preview" />
      <FileDrop
        name="file"
        accept=".csv,.txt,text/csv,text/plain,.xlsx,.xls"
        title="Glissez votre fichier ici"
        hint="ou cliquez pour le choisir. Un fichier .csv enregistré depuis Excel, Numbers ou Google Sheets."
        autoSubmit
      />
      <details class="paste">
        <summary>Ou collez les lignes copiées depuis votre tableur</summary>
        <div class="field">
          <label for="csv" class="sr">
            Lignes du tableur
          </label>
          <textarea id="csv" name="csv" class="mono" placeholder={'Dossard\tPrénom\tNom\tEmail\tDistance\n1001\tMarie\tDurand\tmarie.durand@exemple.fr\tMarathon'}></textarea>
        </div>
      </details>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">
          Vérifier le fichier
        </button>
        <span class="muted small">Rien n’est importé avant votre confirmation.</span>
      </div>
    </form>
  </Card>
);

const Preview = ({ race, distances, state }: { race: Race; distances: DistanceKey[]; state: Extract<ImportState, { step: 'preview' }> }) => {
  const { result, plan } = state;
  const count = (change: PlannedEntrant['change']) => plan.filter((p) => p.change === change).length;
  const [added, updated, same] = [count('new'), count('updated'), count('same')];
  const refused = result.rejected.length;
  const ignored = result.headers.filter((h) => h.column === null && h.header !== '');
  const used = result.headers.filter((h) => h.column !== null);
  const summary = [plural(added, 'nouveau coureur', 'nouveaux coureurs'), `${updated} mis à jour`, ...(refused > 0 ? [plural(refused, 'ligne refusée', 'lignes refusées')] : [])].join(', ');
  const writes = added + updated;
  return (
    <>
      <PageHead title="Vérifiez avant d’importer" sub={`${summary}.`} back={{ href: `/org/${race.slug}/runners/import`, label: 'Choisir un autre fichier' }} />
      {writes === 0 && plan.length > 0 ? <Flash tone="info">Rien à changer : tous ces coureurs sont déjà à jour.</Flash> : null}
      {plan.length === 0 ? <Flash tone="bad">Aucune ligne ne peut être importée. Corrigez le fichier avec les indications ci-dessous, puis renvoyez-le.</Flash> : null}
      <div class="stats">
        <Stat label="Nouveaux coureurs" value={added} />
        <Stat label="Mis à jour" value={updated} hint={same > 0 ? `${same} déjà à jour` : undefined} />
        <Stat label="Lignes refusées" value={refused} hint={refused > 0 ? 'Voir ci-dessous' : undefined} />
        <Stat label="Adresses" value={plan.filter((p) => p.entrant.address).length} hint="pour la médaille" />
      </div>
      {writes > 0 ? (
        <Card>
          <form method="post" action={`/org/${race.slug}/runners/import`} class="form-actions">
            <input type="hidden" name="step" value="confirm" />
            <textarea name="csv" hidden>
              {state.text}
            </textarea>
            <button class="btn btn-primary btn-lg" type="submit">
              <Icon name="check" /> Confirmer l’import
            </button>
            <span class="muted small">{refused > 0 ? `Les ${plural(refused, 'ligne refusée', 'lignes refusées')} ne seront pas importées.` : 'Vous pourrez renvoyer le fichier plus tard : rien ne sera ajouté en double.'}</span>
          </form>
        </Card>
      ) : null}
      {refused > 0 ? (
        <Card title="Lignes refusées" sub="Corrigez-les dans votre fichier, puis renvoyez-le. Les autres lignes peuvent être importées dès maintenant.">
          <ul class="issues">
            {result.rejected.map((r) => {
              const d = describeRejection(r, distances);
              return (
                <li>
                  <b>
                    Ligne {r.line}
                    {r.bib ? `, dossard ${r.bib}` : ''}
                  </b>{' '}
                  {d.what}
                  <span class="fix">{d.fix}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
      {result.warnings.length > 0 ? (
        <Card title="À vérifier" sub="Ces coureurs seront importés, sans leur adresse.">
          <ul class="issues">
            {result.warnings.map((w) => {
              const d = describeWarning(w);
              return (
                <li>
                  <b>
                    Ligne {w.line}, dossard {w.bib}
                  </b>{' '}
                  {d.what}
                  <span class="fix">{d.fix}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
      {plan.length > 0 ? (
        <Card title="Aperçu" sub={plan.length > PREVIEW_ROWS ? `Les ${PREVIEW_ROWS} premiers coureurs sur ${plan.length}.` : undefined} flush>
          <div class="table-wrap">
            <table class="a-table">
              <thead>
                <tr>
                  <th class="hide-sm">Dossard</th>
                  <th>Coureur</th>
                  <th class="hide-sm">Distance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plan.slice(0, PREVIEW_ROWS).map(({ entrant, change }) => (
                  <tr>
                    <td class="bib hide-sm">{entrant.bib}</td>
                    <td>
                      <b>
                        {entrant.firstName} {entrant.lastName.toUpperCase()}
                      </b>
                      <span class="sub show-sm">
                        <span class="num">{entrant.bib}</span> · {distanceName(entrant.distanceKey)}
                      </span>
                      <span class="sub">{entrant.email}</span>
                      {entrant.address ? <span class="sub">{`${entrant.address.postalCode} ${entrant.address.city}`}</span> : null}
                    </td>
                    <td class="hide-sm">{distanceName(entrant.distanceKey)}</td>
                    <td>
                      <Badge tone={CHANGE[change].tone}>{CHANGE[change].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      <Card title="Colonnes lues">
        <p>
          {used.length > 0 ? `Utilisées : ${used.map((h) => h.header).join(', ')}.` : 'Aucune colonne reconnue.'}
          {ignored.length > 0 ? ` Ignorées : ${ignored.map((h) => h.header).join(', ')}.` : ''}
        </p>
        {state.fileName ? <p class="muted small">Fichier : {state.fileName}</p> : null}
      </Card>
    </>
  );
};

/** Send the ticketing file, check what it would do, then confirm. Importing the same file twice is safe. */
export const OrgImportPage = ({ race, distances, state }: Props) =>
  state.step === 'preview' ? (
    <Preview race={race} distances={distances} state={state} />
  ) : (
    <>
      <PageHead
        title="Importer des coureurs"
        sub="Le fichier de votre billetterie, enregistré depuis Excel ou Google Sheets. Vous verrez le résultat avant de confirmer."
        back={{ href: `/org/${race.slug}/runners`, label: 'Coureurs' }}
      />
      {state.problem ? <Flash tone={state.problem === 'nothing' ? 'warn' : 'bad'}>{PROBLEMS[state.problem]}</Flash> : null}
      <Choose race={race} />
      <Requirements race={race} distances={distances} />
    </>
  );
