import type { Race } from '@sivoov/shared';
import { Card, Icon } from './ui';

/**
 * Online sales. A placeholder until card payments arrive (Paddle is next): replace this card,
 * nothing else on the settings page depends on it.
 */
export const SaleCard = ({ race }: { race: Race }) => (
  <Card id="sale" title="Vente en ligne">
    <p class="lede">Bientôt : vendez vos dossards virtuels directement ici, paiement par carte. En attendant, importez la liste de votre billetterie.</p>
    <a class="btn" href={`/org/${race.slug}/runners/import`}>
      <Icon name="upload" /> Importer des coureurs
    </a>
  </Card>
);
