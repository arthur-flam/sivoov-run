import { coursePlaces, decimalFr, momentMeters } from '@sivoov/shared';
import type { Course, PhotoMoment, Race } from '@sivoov/shared';
import { Card, ConfirmButton, Empty, Field, Flash, ImageFrame, PageHead } from './ui';

/** What the moment form sends back on an error. */
export type MomentForm = { id?: string; title: string; at: string; ask: string; scene: string; error?: string };

/** An organizer's own photo put into a moment, to see what runners will get before they do. */
export type TriedPhoto = { momentId: string; dataUrl?: string; error?: string };

type Props = {
  race: Race;
  course: Course | undefined;
  moments: PhotoMoment[];
  done: Map<string, number>;
  canEdit: boolean;
  enabled: boolean;
  mediaUrl: (key: string) => string;
  form?: MomentForm;
  tried?: TriedPhoto;
  flash?: string;
};

/** « Départ », the course's places, « Arrivée »: where a moment can stand. */
const placeOptions = (course: Course | undefined): Array<{ value: string; label: string }> => [
  { value: 'start', label: 'Au départ' },
  ...(course ? coursePlaces(course.landmarks, course.distanceM) : [])
    .filter((p) => p.mark !== 'start' && p.mark !== 'finish')
    .map((p) => ({ value: p.landmark.id, label: `${p.mark} · ${p.landmark.name} (km ${decimalFr(p.landmark.meters / 1000, 1)})` })),
  { value: 'finish', label: 'À l’arrivée' },
];

const placeLabel = (at: string, course: Course | undefined): string => {
  if (at === 'start') return 'Au départ';
  if (at === 'finish') return 'À l’arrivée';
  const place = course?.landmarks.find((l) => l.id === at);
  const meters = course ? momentMeters(at, course) : null;
  return place && meters !== null ? `${place.name}, km ${decimalFr(meters / 1000, 1)}` : 'Un lieu qui n’est plus sur le parcours';
};

const MomentFields = ({ course, values, submit }: { course: Course | undefined; values?: Partial<MomentForm>; submit: string }) => (
  <>
    <Field label="Titre" for={`title-${values?.id ?? 'new'}`} hint="Ce que le coureur lit : « Sur les Planches », « La ligne d’arrivée ».">
      <input id={`title-${values?.id ?? 'new'}`} name="title" type="text" maxlength={80} required value={values?.title ?? ''} />
    </Field>
    <Field label="Où" for={`at-${values?.id ?? 'new'}`} hint="Pendant la course, l’app le rappelle au coureur quand il y passe.">
      <select id={`at-${values?.id ?? 'new'}`} name="at">
        {placeOptions(course).map((o) => (
          <option value={o.value} selected={o.value === (values?.at ?? 'finish')}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
    <Field label="Ce que vous demandez au coureur" for={`ask-${values?.id ?? 'new'}`} hint="Une phrase : « Un selfie, bras levés, le sourire du finisher. »">
      <input id={`ask-${values?.id ?? 'new'}`} name="ask" type="text" maxlength={240} required value={values?.ask ?? ''} />
    </Field>
    <Field label="La scène" for={`scene-${values?.id ?? 'new'}`} hint="Ce que l’image montre autour du coureur : le lieu, la lumière, le public. En français ou en anglais.">
      <textarea id={`scene-${values?.id ?? 'new'}`} name="scene" maxlength={1200} required>
        {values?.scene ?? ''}
      </textarea>
    </Field>
    <Field label="Vos photos du lieu" hint="Jusqu’à trois, en JPEG, PNG ou WebP, 5 Mo chacune. L’image s’en inspire pour le décor. Laissez vide pour garder celles d’avant.">
      <input name="refs" type="file" accept="image/jpeg,image/png,image/webp" multiple />
    </Field>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">
        {submit}
      </button>
    </div>
  </>
);

/**
 * The race's photo moments: where runners are asked for a selfie, what the picture shows, the
 * organizer's photos of the place, and a try with the organizer's own photo.
 */
export const OrgPhotosPage = ({ race, course, moments, done, canEdit, enabled, mediaUrl, form, tried, flash }: Props) => {
  const base = `/org/${race.slug}/photos`;
  return (
    <>
      <PageHead
        title="Photos"
        sub="Des moments du parcours où les coureurs se prennent en photo. Une IA les place dans votre course, sur vos images du lieu, dossard sur la poitrine. Ils les partagent, ou les gardent pour eux."
      />
      {flash ? <Flash tone="good">{flash}</Flash> : null}
      {!enabled ? <Flash tone="warn">Les photos ne peuvent pas encore être créées sur ce serveur (la clé Gemini manque). Les coureurs voient les moments sans pouvoir envoyer leur photo.</Flash> : null}
      {form?.error ? <Flash tone="bad">{form.error}</Flash> : null}

      {moments.length === 0 ? (
        <Card>
          <Empty title="Pas encore de moment photo">Ajoutez-en un ci-dessous : l’arrivée est le moment que tous les coureurs veulent garder.</Empty>
        </Card>
      ) : (
        moments.map((m) => (
          <Card title={m.title} sub={placeLabel(m.at, course)} id={`m-${m.id}`}>
            <p>{m.ask}</p>
            <p class="small muted">{m.scene}</p>
            {m.refs.length > 0 ? (
              <div class="grid two">
                {m.refs.map((key) => (
                  <ImageFrame src={mediaUrl(key)} alt={`Photo du lieu, ${m.title}`} empty="" wide />
                ))}
              </div>
            ) : (
              <p class="small muted">Pas de photo du lieu : l’image l’imagine d’après la scène.</p>
            )}
            <p class="small">{`${done.get(m.id) ?? 0} photo${(done.get(m.id) ?? 0) > 1 ? 's' : ''} de coureurs faite${(done.get(m.id) ?? 0) > 1 ? 's' : ''}`}</p>

            {tried?.momentId === m.id ? (
              tried.dataUrl ? (
                <figure data-testid="tried-photo">
                  <img src={tried.dataUrl} alt="Votre photo dans la course" style="max-width:360px;width:100%;border-radius:12px" />
                  <figcaption class="small muted">Votre essai. Il n’est gardé nulle part : ajustez la scène et essayez encore.</figcaption>
                </figure>
              ) : (
                <Flash tone="bad">{tried.error ?? 'L’image n’a pas pu être créée.'}</Flash>
              )
            ) : null}

            {canEdit ? (
              <>
                <details class="disclose">
                  <summary>Essayer avec votre photo</summary>
                  <form method="post" action={`${base}/${m.id}/try`} enctype="multipart/form-data">
                    <Field label="Un selfie de vous" hint="Il sert à cet essai seulement et n’est pas gardé. Le dossard montré est le 1234.">
                      <input name="photo" type="file" accept="image/*" required />
                    </Field>
                    <div class="form-actions">
                      <button class="btn" type="submit" disabled={!enabled}>
                        Me mettre dans la course
                      </button>
                    </div>
                  </form>
                </details>
                <details class="disclose" open={form?.id === m.id}>
                  <summary>Modifier</summary>
                  <form method="post" action={`${base}/${m.id}`} enctype="multipart/form-data">
                    <MomentFields course={course} values={form?.id === m.id ? form : { ...m }} submit="Enregistrer" />
                  </form>
                </details>
                <form method="post" action={`${base}/${m.id}/delete`}>
                  <ConfirmButton message={`Retirer « ${m.title} » ? Les photos déjà faites restent visibles par leurs coureurs.`}>Retirer ce moment</ConfirmButton>
                </form>
              </>
            ) : null}
          </Card>
        ))
      )}

      {canEdit ? (
        <Card title="Ajouter un moment">
          <form method="post" action={base} enctype="multipart/form-data">
            <MomentFields course={course} values={form && !form.id ? form : undefined} submit="Ajouter le moment" />
          </form>
        </Card>
      ) : null}
    </>
  );
};
