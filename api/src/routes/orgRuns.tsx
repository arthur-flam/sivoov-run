import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireOrganizer } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { Card, Empty, PageHead } from '../pages/org/ui';
import { orgPage } from './orgPage';

/** Activities: every run recorded by the app or sent as a file. Mounted under /org. */
export const orgRuns = new Hono<AppEnv & { Variables: OrgVars }>();

orgRuns.get('/:slug/runs', requireOrganizer, (c) =>
  orgPage(
    c,
    'runs',
    'Activités',
    <>
      <PageHead title="Activités" />
      <Card>
        <Empty title="Bientôt ici." />
      </Card>
    </>,
  ),
);
