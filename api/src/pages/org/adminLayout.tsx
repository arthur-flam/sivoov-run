import type { Child } from 'hono/jsx';
import { can } from '@sivoov/shared';
import type { Access, OrgAction, Race } from '@sivoov/shared';
import { FONTS_URL } from '../tokens';
import { adminStyles } from './adminStyles';
import { ROLE_LABELS } from './format';
import { Icon } from './ui';
import type { IconName } from './ui';

export type NavKey = 'home' | 'runners' | 'runs' | 'courses' | 'settings' | 'team';

type NavItem = { key: NavKey; label: string; icon: IconName; path: string; needs: OrgAction };

/** The race menu. Paths are relative to /org/<slug>. */
export const NAV: NavItem[] = [
  { key: 'home', label: 'Accueil', icon: 'home', path: '', needs: 'view' },
  { key: 'runners', label: 'Coureurs', icon: 'runners', path: '/runners', needs: 'view' },
  { key: 'runs', label: 'Activités', icon: 'activity', path: '/runs', needs: 'view' },
  { key: 'courses', label: 'Parcours et annonces', icon: 'audio', path: '/courses', needs: 'view' },
  { key: 'team', label: 'Équipe', icon: 'team', path: '/team', needs: 'manage_team' },
  { key: 'settings', label: 'Réglages', icon: 'settings', path: '/settings', needs: 'edit_race' },
];

type Props = {
  title: string;
  /** Signed-in person; absent on the sign-in page. */
  email?: string;
  staff?: boolean;
  /** On a race page: the race, what the person may do, which nav item is lit. */
  race?: Race;
  access?: Access;
  current?: NavKey;
  /** `solo` is the narrow centered column of the sign-in page, `wide` the race picker. */
  width?: 'solo' | 'wide';
  /** Extra tags for <head> (a map stylesheet). */
  head?: Child;
  children: Child;
};

const initials = (email: string) => email.slice(0, 2);

/**
 * The organizer admin's document: its own shell, not the public Layout. A top bar with the
 * person's menu, and on race pages the race menu (a tab row on a phone, a sidebar on a laptop).
 */
export const AdminLayout = ({ title, email, staff, race, access, current, width, head, children }: Props) => {
  const base = race ? `/org/${race.slug}` : '/org';
  const themeVars = race ? `--race-primary:${race.theme.primary};--race-on-primary:${race.theme.onPrimary};` : '';
  const role = access?.role ? ROLE_LABELS[access.role] : staff ? 'Équipe Sivoov' : null;
  return (
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{race ? `${title} · ${race.theme.displayName}` : `${title} · Sivoov Run`}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href={FONTS_URL} />
        <style dangerouslySetInnerHTML={{ __html: adminStyles }} />
        {head ?? null}
      </head>
      <body class="admin" style={themeVars}>
        <header class="a-top">
          <a class="a-brand" href="/org">
            Sivoov <span>Run</span>
            <small>Organisateurs</small>
          </a>
          <div class="grow"></div>
          {email ? (
            <details class="a-menu">
              <summary aria-label="Mon compte">
                <span class="avatar">{initials(email)}</span>
              </summary>
              <div class="a-pop">
                <div class="who">
                  {email}
                  {role ? (
                    <>
                      <br />
                      {role}
                    </>
                  ) : null}
                </div>
                <a href="/org">Toutes mes courses</a>
                <a href="/org/signout">Se déconnecter</a>
              </div>
            </details>
          ) : null}
        </header>
        {race && access ? (
          <div class="a-body">
            <nav class="a-nav" aria-label="Menu de la course">
              <div>
                <div class="race">
                  <b>{race.theme.displayName}</b>
                  <span>{race.city}</span>
                </div>
                <ul>
                  {NAV.filter((n) => can(access, n.needs)).map((n) => (
                    <li>
                      <a href={`${base}${n.path}`} class={current === n.key ? 'on' : ''} aria-current={current === n.key ? 'page' : undefined}>
                        <Icon name={n.icon} />
                        {n.label}
                      </a>
                    </li>
                  ))}
                </ul>
                <div class="foot">
                  <a href={`/${race.slug}`} target="_blank" rel="noopener">
                    Page publique ↗
                  </a>
                  <a href={`/${race.slug}/results`} target="_blank" rel="noopener">
                    Résultats publics ↗
                  </a>
                  <a href="/org">Toutes mes courses</a>
                </div>
              </div>
            </nav>
            <main class="a-main">{children}</main>
          </div>
        ) : (
          <main class={width === 'solo' ? 'a-solo' : 'a-wide'}>{children}</main>
        )}
      </body>
    </html>
  );
};
