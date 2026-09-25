import { DISTANCE_METERS, DistanceKeySchema } from '@sivoov/shared';
import type { NewRaceForm } from '../../lib/newRace';
import { distanceName } from './format';
import { CountryField, TextField, firstError } from './settingsFields';
import { Card, Checklist, Choices, Field, Flash, PageHead } from './ui';
import type { ChoiceOption } from './ui';

const km = (m: number) => `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} km`;
/** "Marathon, 42,195 km"; "10 km" says it already. */
const DISTANCES: ChoiceOption[] = DistanceKeySchema.options.map((key) => {
  const label = distanceName(key);
  return { value: key, label, hint: label.includes('km') ? undefined : km(DISTANCE_METERS[key]) };
});

/**
 * Two conveniences while typing, both also done by the server when JavaScript is off: the page
 * address follows the name until someone edits it (the same rule as `slugify` in shared), and
 * the window follows the first day (Monday 00:00 to Sunday 23:59 of that week), and so does an
 * empty last day.
 */
const FORM_JS = `(() => {
  const form = document.getElementById('new-race');
  if (!form) return;
  const f = (n) => form.elements.namedItem(n);
  const touched = new Set(['slug', 'windowStart', 'windowEnd'].filter((n) => f(n).value));
  const slugify = (s) => s.toLowerCase().replace(/[œæß]/g, (c) => ({ 'œ': 'oe', 'æ': 'ae', 'ß': 'ss' })[c]).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  const day = (d) => d.toISOString().slice(0, 10);
  form.addEventListener('input', (e) => {
    const n = e.target.name;
    if (n === 'slug' || n === 'windowStart' || n === 'windowEnd') touched.add(n);
    if ((n === 'name' || n === 'displayName') && !touched.has('slug')) f('slug').value = slugify(f('displayName').value || f('name').value);
    if (n === 'dateStart' && f('dateStart').value && !f('dateEnd').value) f('dateEnd').value = f('dateStart').value;
    if (n === 'dateStart' && f('dateStart').value && !touched.has('windowStart') && !touched.has('windowEnd')) {
      const start = new Date(f('dateStart').value + 'T00:00:00Z');
      const monday = new Date(start.getTime() - ((start.getUTCDay() + 6) % 7) * 86400000);
      f('windowStart').value = day(monday) + 'T00:00';
      f('windowEnd').value = day(new Date(monday.getTime() + 6 * 86400000)) + 'T23:59';
    }
  });
})();`;

type Props = { form?: NewRaceForm; host: string };

const ORDER = ['name', 'displayName', 'city', 'dateStart', 'dateEnd', 'windowStart', 'windowEnd', 'ownerEmail', 'slug'] as const;

/** Staff only: a new race, as a draft, with its courses and its first owner. */
export const OrgNewRacePage = ({ form = { values: {}, distances: ['marathon'], errors: {} }, host }: Props) => {
  const { values, errors } = form;
  const focus = firstError(errors, ORDER);
  return (
    <>
      <PageHead
        title="Nouvelle course"
        back={{ href: '/org', label: 'Vos courses' }}
        sub="La course est créée en brouillon. Son responsable reçoit une invitation par email."
      />
      {Object.keys(errors).length > 0 ? <Flash tone="bad">La course n’est pas encore créée. Corrigez ce qui est indiqué en rouge.</Flash> : null}
      <div class="grid main-side">
        <form id="new-race" method="post" action="/org/new">
          <Card title="La course">
            <TextField
              name="name"
              label="Nom officiel"
              placeholder="Semi-marathon de Caen 2027"
              values={values}
              errors={errors}
              focus={focus === 'name'}
              required
            />
            <TextField
              name="displayName"
              label="Nom affiché sur les pages"
              hint="Laissez vide pour reprendre le nom officiel."
              values={values}
              errors={errors}
              focus={focus === 'displayName'}
            />
            <div class="form-grid two">
              <TextField name="city" label="Ville" values={values} errors={errors} focus={focus === 'city'} required />
              <CountryField values={values} errors={errors} />
            </div>
            <div class="form-grid two">
              <TextField name="dateStart" type="date" label="Premier jour" values={values} errors={errors} focus={focus === 'dateStart'} required />
              <TextField name="dateEnd" type="date" label="Dernier jour" values={values} errors={errors} focus={focus === 'dateEnd'} required />
            </div>
          </Card>
          <Card title="Quand les coureurs peuvent courir" sub="Heure de Paris. Laissez vide pour la semaine de la course, du lundi 00:00 au dimanche 23:59.">
            <div class="form-grid two">
              <TextField name="windowStart" type="datetime-local" label="Ouverture" values={values} errors={errors} focus={focus === 'windowStart'} />
              <TextField name="windowEnd" type="datetime-local" label="Fermeture" values={values} errors={errors} focus={focus === 'windowEnd'} />
            </div>
          </Card>
          <Card title="Distances" sub="Un parcours est créé pour chacune, à la distance officielle.">
            <Choices
              type="checkbox"
              name="distances"
              legend="Distances ouvertes"
              options={DISTANCES}
              selected={form.distances}
              columns={2}
              error={errors.distances}
            />
          </Card>
          <Card title="Responsable et adresse">
            <TextField
              name="ownerEmail"
              type="email"
              label="Email du responsable de la course"
              hint="Il reçoit une invitation et pourra inviter son équipe."
              values={values}
              errors={errors}
              focus={focus === 'ownerEmail'}
              required
            />
            <Field label="Adresse de la page" hint="Proposée à partir du nom. Des minuscules, des chiffres et des tirets." error={errors.slug} for="f-slug">
              <div class="affix">
                <span>{host}/</span>
                <input
                  id="f-slug"
                  name="slug"
                  type="text"
                  value={values.slug ?? ''}
                  autocomplete="off"
                  autocapitalize="none"
                  spellcheck={false}
                  autofocus={focus === 'slug'}
                />
              </div>
            </Field>
            <div class="form-actions">
              <button class="btn btn-primary btn-lg" type="submit">
                Créer la course
              </button>
            </div>
          </Card>
          <script dangerouslySetInnerHTML={{ __html: FORM_JS }} />
        </form>
        <Card title="Ensuite">
          <Checklist
            items={[
              { done: false, label: 'La course existe en brouillon', hint: 'Sa page est en ligne, mais pas listée sur l’accueil.' },
              { done: false, label: 'Le responsable reçoit son invitation', hint: 'Il entre avec son email et un code, sans mot de passe.' },
              { done: false, label: 'Il complète sa course', hint: 'Réglages, tracés, annonces, liste des coureurs. Puis il l’ouvre.' },
            ]}
          />
        </Card>
      </div>
    </>
  );
};
