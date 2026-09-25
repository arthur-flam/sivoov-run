import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireCan, requireOrganizer } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { Card, Empty, PageHead } from '../pages/org/ui';
import { orgPage } from './orgPage';

/** The race itself: settings and team. Mounted under /org. */
export const orgRace = new Hono<AppEnv & { Variables: OrgVars }>();

orgRace.get('/:slug/settings', requireOrganizer, requireCan('edit_race'), (c) =>
  orgPage(c, 'settings', 'Réglages', <><PageHead title="Réglages" /><Card><Empty title="Bientôt ici." /></Card></>),
);

orgRace.get('/:slug/team', requireOrganizer, requireCan('manage_team'), (c) =>
  orgPage(c, 'team', 'Équipe', <><PageHead title="Équipe" /><Card><Empty title="Bientôt ici." /></Card></>),
);
