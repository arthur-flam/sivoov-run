import type { Child } from 'hono/jsx';
import type { Organizer, Race } from '@sivoov/shared';

type Props = { race: Race; organizer: Organizer; current: 'home' | 'import'; children: Child };

/** Admin chrome inside the shared Layout: race name, the nav, who is signed in. */
export const OrgShell = ({ race, organizer, current, children }: Props) => {
  const base = `/org/${race.slug}`;
  return (
    <section class="section" style="border-bottom:0">
      <div class="eyebrow">Espace organisateur</div>
      <h2>{race.theme.displayName}</h2>
      <nav class="org-nav" aria-label="Administration">
        <a href={base} class={current === 'home' ? 'current' : ''}>Inscrits</a>
        <a href={`${base}/import`} class={current === 'import' ? 'current' : ''}>Importer un CSV</a>
        <a href={`${base}/export/entrants.csv`}>Export inscrits</a>
        <a href={`${base}/export/results.csv`}>Export résultats</a>
        <span style="color:var(--muted)">{organizer.email}</span>
        <a href={`${base}/signout`}>Se déconnecter</a>
      </nav>
      {children}
    </section>
  );
};
