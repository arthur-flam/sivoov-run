import { can, formatKm } from '@sivoov/shared';
import type { Access, DistanceKey, Race } from '@sivoov/shared';
import type { CourseAudioCard } from '../../lib/studio';
import { traceMatches } from '../../lib/studio';
import { distanceName, plural } from './format';
import { PUBLISH_CONFIRM, dayFr } from './studioCopy';
import { Badge, Card, Checklist, ConfirmButton, Empty, Field, Flash, Icon, PageHead } from './ui';
import type { TodoItem } from './ui';

/** What the "Ajouter une distance" form sends back, kept on an error so nothing is typed twice. */
export type NewCourseForm = { distanceKey: string; distanceKm: string; fieldError?: string };

type Props = { race: Race; access: Access; cards: CourseAudioCard[]; done?: string; error?: string; form?: NewCourseForm };

const KEYS: DistanceKey[] = ['marathon', 'half', '10k', '5k'];
const km = (meters: number, digits: number) => formatKm(meters, 'fr', digits);

/** The three steps of a distance, in the order a race director does them: trace, announcements, publication. */
const steps = ({ course, measuredM, summary }: CourseAudioCard, timeZone: string): TodoItem[] => {
  const trace: TodoItem =
    measuredM === null
      ? { done: false, label: 'Pas encore de tracé', hint: 'Importez le fichier GPX du parcours pour placer les annonces sur la carte.' }
      : traceMatches(measuredM, course.distanceM)
        ? { done: true, label: 'Tracé importé', hint: `${km(measuredM, 2)} mesurés pour ${km(course.distanceM, 3)} officiels.` }
        : {
            done: false,
            label: 'Tracé à vérifier',
            hint: `Le tracé mesure ${km(measuredM, 2)} pour ${km(course.distanceM, 3)} officiels. Vérifiez que c’est le bon fichier.`,
          };
  const announcements: TodoItem =
    summary.lines === 0
      ? { done: false, label: 'Pas encore d’annonce', hint: 'Ce que le coureur entend au départ, sur le parcours et à l’arrivée.' }
      : summary.toRecord > 0
        ? { done: false, label: `${plural(summary.lines, 'annonce', 'annonces')}, ${summary.toRecord} à enregistrer`, hint: 'Chaque texte doit avoir sa voix, ou votre fichier audio.' }
        : { done: true, label: `${plural(summary.lines, 'annonce', 'annonces')}, toutes prêtes` };
  const published: TodoItem = !summary.lastPublished
    ? { done: false, label: 'Pas encore publiées', hint: 'Les coureurs n’entendent aucune annonce pour l’instant.' }
    : summary.changed
      ? { done: false, label: 'Des changements ne sont pas encore publiés', hint: `Les coureurs ont la version du ${dayFr(summary.lastPublished.at, timeZone)}.` }
      : { done: true, label: `Publiées le ${dayFr(summary.lastPublished.at, timeZone)}, les coureurs les ont` };
  return [trace, announcements, published];
};

/** One primary action per card: the next thing to do on this distance. */
const NextStep = ({ card, base, canEdit }: { card: CourseAudioCard; base: string; canEdit: boolean }) => {
  const studio = `${base}/${card.course.id}`;
  const { summary } = card;
  if (!canEdit) return <a class="btn" href={studio}>Voir et écouter les annonces</a>;
  if (summary.lines === 0) return <a class="btn btn-primary" href={studio}>Écrire les annonces</a>;
  if (summary.publish === 'ready') {
    return (
      <>
        <form method="post" action={`${studio}/publish`}>
          <ConfirmButton class="btn btn-primary" message={PUBLISH_CONFIRM}>
            {summary.lastPublished ? 'Publier les changements' : 'Publier les annonces'}
          </ConfirmButton>
        </form>
        <a class="btn btn-quiet" href={studio}>Relire les annonces</a>
      </>
    );
  }
  if (summary.publish === 'missing') return <a class="btn btn-primary" href={studio}>Continuer</a>;
  return <a class="btn" href={studio}>Modifier les annonces</a>;
};

const GpxImport = ({ card, base }: { card: CourseAudioCard; base: string }) => {
  const id = `gpx-${card.course.id}`;
  return (
    <details class="disclose" open={card.measuredM === null}>
      <summary>{card.measuredM === null ? 'Importer le tracé (fichier GPX)' : 'Remplacer le tracé (fichier GPX)'}</summary>
      <p class="small muted">
        Un fichier GPX décrit le parcours point par point. Demandez-le à votre chronométreur, ou exportez une sortie faite sur le parcours depuis Strava ou Garmin Connect.
      </p>
      <form method="post" action={`${base}/${card.course.id}/gpx`} enctype="multipart/form-data" class="inline-form">
        <Field label="Fichier GPX" for={id}>
          <input id={id} name="gpx" type="file" accept=".gpx,application/gpx+xml" required />
        </Field>
        <button class="btn" type="submit">
          <Icon name="upload" /> Importer
        </button>
      </form>
    </details>
  );
};

const AddDistance = ({ race, used, form }: { race: Race; used: DistanceKey[]; form?: NewCourseForm }) => {
  const free = KEYS.filter((k) => !used.includes(k));
  return (
    <Card title="Ajouter une distance" sub="Chaque distance a son parcours et ses annonces.">
      {free.length === 0 ? (
        <p class="muted">Toutes les distances ont déjà un parcours.</p>
      ) : (
        <form method="post" action={`/org/${race.slug}/courses`}>
          <div class="form-grid two">
            <Field label="Distance" for="distanceKey">
              <select id="distanceKey" name="distanceKey">
                {free.map((k) => (
                  <option value={k} selected={form?.distanceKey === k}>
                    {distanceName(k)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Distance officielle, en km" hint="Vide : la distance habituelle." for="distanceKm" error={form?.fieldError}>
              <input id="distanceKm" name="distanceKm" type="text" inputmode="decimal" placeholder="Par exemple 21,0975" value={form?.distanceKm ?? ''} />
            </Field>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">
              <Icon name="plus" /> Ajouter
            </button>
          </div>
        </form>
      )}
    </Card>
  );
};

/** One card per distance: where it stands in plain words, and the one next step. */
export const OrgCoursesPage = ({ race, access, cards, done, error, form }: Props) => {
  const base = `/org/${race.slug}/courses`;
  const canEdit = can(access, 'edit_audio');
  return (
    <>
      <PageHead
        title="Parcours et annonces"
        sub="Pour chaque distance : le tracé du parcours, les annonces que le coureur entend dans ses écouteurs, puis la publication."
      />
      {done ? <Flash tone="good">{done}</Flash> : null}
      {error ? <Flash tone="bad">{error}</Flash> : null}
      {!canEdit ? <Flash tone="info">Vous pouvez consulter et écouter les annonces. Seuls les responsables et l’équipe peuvent les modifier.</Flash> : null}
      {cards.length === 0 ? (
        <Card>
          <Empty title="Pas encore de parcours.">{canEdit ? 'Ajoutez votre première distance ci-dessous.' : 'Le responsable de la course les ajoutera ici.'}</Empty>
        </Card>
      ) : (
        <div class="grid two">
          {cards.map((card) => {
            const items = steps(card, race.timezone);
            const ready = items.every((i) => i.done);
            return (
              <div>
                <Card
                  id={card.course.id}
                  title={distanceName(card.course.distanceKey)}
                  sub={`${km(card.course.distanceM, 3)} officiels`}
                  actions={ready ? <Badge tone="good">Prêt</Badge> : <Badge tone="warn">À terminer</Badge>}
                >
                  <Checklist items={items} />
                  <div class="form-actions">
                    <NextStep card={card} base={base} canEdit={canEdit} />
                  </div>
                  {canEdit ? <GpxImport card={card} base={base} /> : null}
                </Card>
              </div>
            );
          })}
        </div>
      )}
      {canEdit ? <AddDistance race={race} used={cards.map((c) => c.course.distanceKey)} form={form} /> : null}
    </>
  );
};
