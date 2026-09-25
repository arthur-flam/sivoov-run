import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { requireAdmin } from '../lib/orgAuth';
import type { AdminVars } from '../lib/orgAuth';
import { AdminLayout } from '../pages/org/adminLayout';
import { Card, Empty, PageHead } from '../pages/org/ui';

/** Sivoov staff pages, outside any race: create a race, read the organizers' requests. Mounted under /org. */
export const orgStaff = new Hono<AppEnv & { Variables: AdminVars }>();

const requireStaff = createMiddleware<AppEnv & { Variables: AdminVars }>(async (c, next) => (c.get('admin').staff ? next() : c.redirect('/org?denied=1')));

orgStaff.get('/new', requireAdmin, requireStaff, (c) =>
  c.html(
    <AdminLayout title="Nouvelle course" email={c.get('admin').email} staff>
      <PageHead title="Nouvelle course" back={{ href: '/org', label: 'Vos courses' }} />
      <Card><Empty title="Bientôt ici." /></Card>
    </AdminLayout>,
  ),
);

orgStaff.get('/leads', requireAdmin, requireStaff, (c) =>
  c.html(
    <AdminLayout title="Demandes reçues" email={c.get('admin').email} staff>
      <PageHead title="Demandes reçues" back={{ href: '/org', label: 'Vos courses' }} />
      <Card><Empty title="Bientôt ici." /></Card>
    </AdminLayout>,
  ),
);
