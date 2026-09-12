import type { Race } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { fmtDate } from './dates';

/** run.sivoov.app root: the open races. */
export const HomePage = ({ races, locale }: { races: Race[]; locale: Locale }) => (
  <>
    <section class="hero">
      <div class="eyebrow">Sivoov Run</div>
      <h1>{locale === 'fr' ? 'Des courses réelles, courues où vous êtes.' : 'Real races, run wherever you are.'}</h1>
      <p class="lede">
        {locale === 'fr'
          ? 'Une entrée virtuelle qui est une vraie course : le départ, le parcours raconté, l’arrivée, un temps officiel, la médaille.'
          : 'A virtual entry that is a real race: the start, the narrated course, the finish, an official time, the medal.'}
      </p>
    </section>
    <section class="section" style="border-bottom:0">
      <h2>{locale === 'fr' ? 'Courses ouvertes' : 'Open races'}</h2>
      {races.length === 0 ? <p class="empty">{locale === 'fr' ? 'Bientôt.' : 'Soon.'}</p> : null}
      <div class="steps">
        {races.map((r) => (
          <a class="fact" href={`/${r.slug}`} style={`text-decoration:none;--race-primary:${r.theme.primary}`}>
            <div class="k">{r.city}</div>
            <div style="font-family:var(--font-display);font-size:22px;margin:6px 0">{r.theme.displayName}</div>
            <div class="s">{fmtDate(r.dateStart, locale, r.timezone, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </a>
        ))}
      </div>
    </section>
  </>
);
