import { REVIEW_BIB, REVIEW_EMAIL } from '@sivoov/shared';
import type { Race } from '@sivoov/shared';
import { Card, Flash, Icon } from './ui';

type Props = { race: Race; demo: Race | null; source: Race | null; flash?: string };

/**
 * Staff only. On a real race: make its demo, or bring the demo's look up to date. On a demo:
 * which race it plays. The demo is how organizers try the app and how App Review signs in.
 */
export const DemoCard = ({ race, demo, source, flash }: Props) =>
  race.demoOf ? (
    <Card id="demo" title="Course de démonstration">
      <p class="lede">
        Cette course est la démo de {source ? <a href={`/org/${source.slug}`}>{source.name}</a> : 'une autre course'}. Elle est ouverte tous les jours et a ses propres coureurs et
        résultats{'\u00a0'}; son parcours et son son sont ceux de la vraie course, dès qu’ils y sont publiés.
      </p>
      <p class="small muted">Ajoutez les testeurs dans Coureurs, avec leur vrai email{'\u00a0'}: ils se connectent avec le code reçu.</p>
    </Card>
  ) : (
    <Card id="demo" title="Course de démonstration">
      {flash ? <Flash tone="good">{flash}</Flash> : null}
      <p class="lede">
        Pour les organisateurs qui essaient l’app, et pour la relecture de l’App Store{'\u00a0'}: la même course, ouverte tous les jours, avec ses propres coureurs et résultats. Rien
        n’apparaît ici. Le parcours et le son sont ceux de cette course{'\u00a0'}: chaque publication s’y entend aussitôt.
      </p>
      {demo ? (
        <>
          <p class="small muted" style="margin-bottom:14px">
            Relecture App Store{'\u00a0'}: {REVIEW_EMAIL}, dossard {REVIEW_BIB}, avec le code de relecture (le secret <code>REVIEW_CODE</code> du Worker).
          </p>
          <div class="form-actions">
            <a class="btn" href={`/org/${demo.slug}`}>
              Ouvrir la démo <Icon name="external" />
            </a>
            <form method="post" action={`/org/${race.slug}/demo`}>
              <button class="btn" type="submit">
                Mettre à jour son apparence
              </button>
            </form>
          </div>
        </>
      ) : (
        <form method="post" action={`/org/${race.slug}/demo`} class="form-actions">
          <button class="btn btn-primary" type="submit">
            Créer la démo
          </button>
        </form>
      )}
    </Card>
  );
