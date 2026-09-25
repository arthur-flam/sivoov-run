import type { Context } from 'hono';
import type { Child } from 'hono/jsx';
import type { AppEnv } from '../env';
import type { OrgVars } from '../lib/orgAuth';
import { AdminLayout } from '../pages/org/adminLayout';
import type { NavKey } from '../pages/org/adminLayout';

export type OrgContext = Context<AppEnv & { Variables: OrgVars }>;

type Options = { head?: Child; status?: 200 | 400 | 403 | 404 | 409 | 422 };

/** One race page of the admin: the shell around `body`, with this person's menu and the race's colors. */
export const orgPage = <V extends OrgVars>(c: Context<AppEnv & { Variables: V }>, current: NavKey | undefined, title: string, body: Child, options: Options = {}) =>
  c.html(
    <AdminLayout title={title} email={c.get('admin').email} staff={c.get('admin').staff} race={c.get('race')} access={c.get('access')} current={current} head={options.head}>
      {body}
    </AdminLayout>,
    options.status ?? 200,
  );

/** `?done=<key>` after a redirect -> the sentence to show, from the page's own table. */
export const doneMessage = (c: Context, messages: Record<string, string>): string | undefined => {
  const key = c.req.query('done');
  return key ? messages[key] : undefined;
};
