import type { Lead } from '@sivoov/shared';
import { ago } from './format';
import { Badge, Card, Chips, Empty, Flash, Icon, PageHead, Row, Rows } from './ui';

export type LeadFilter = 'open' | 'handled' | 'all';

export const LEADS_DONE: Record<string, string> = {
  handled: 'Demande marquée comme traitée.',
  reopened: 'Demande remise à traiter.',
};

const EMPTY: Record<LeadFilter, { title: string; text?: string }> = {
  open: { title: 'Aucune demande à traiter.', text: 'Les organisateurs qui remplissent le formulaire de la page Organisateurs apparaissent ici.' },
  handled: { title: 'Aucune demande traitée pour le moment.' },
  all: { title: 'Aucune demande reçue pour le moment.', text: 'Les organisateurs qui remplissent le formulaire de la page Organisateurs apparaissent ici.' },
};

type Props = { leads: Lead[]; filter: LeadFilter; done?: string; now?: Date };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2);

const mailto = (lead: Lead) => `mailto:${lead.email}?subject=${encodeURIComponent(`Sivoov Run${lead.race ? ` pour ${lead.race}` : ''}`)}`;

const LeadRow = ({ lead, now, badge }: { lead: Lead; now: Date; badge: boolean }) => {
  // Only the "Toutes" list mixes both kinds; the others say it in their name.
  const state = lead.handledAt ? <Badge tone="good">Traitée</Badge> : <Badge tone="info">À traiter</Badge>;
  const sub = [lead.email, lead.race, ago(lead.createdAt, now), lead.locale === 'en' ? 'en anglais' : undefined].filter(Boolean).join(' · ');
  return (
    <Row lead={<span class="avatar">{initials(lead.name)}</span>} title={lead.name} sub={sub} dim={Boolean(lead.handledAt)} aside={badge ? state : undefined}>
      {lead.message ? <p>{lead.message}</p> : null}
      <div class="form-actions">
        <a class="btn btn-sm" href={mailto(lead)}>
          Répondre par email
        </a>
        <form method="post" action={`/org/leads/${encodeURIComponent(lead.id)}/${lead.handledAt ? 'reopen' : 'handled'}`} class="inline">
          <button class={lead.handledAt ? 'btn btn-sm btn-quiet' : 'btn btn-sm btn-primary'} type="submit">
            {lead.handledAt ? (
              'Rouvrir'
            ) : (
              <>
                <Icon name="check" /> Marquer comme traité
              </>
            )}
          </button>
        </form>
      </div>
    </Row>
  );
};

/** Staff only: the organizers who asked to hear more, newest first. */
export const OrgLeadsPage = ({ leads, filter, done, now = new Date() }: Props) => {
  const open = leads.filter((l) => !l.handledAt);
  const handled = leads.filter((l) => l.handledAt);
  const shown = filter === 'open' ? open : filter === 'handled' ? handled : leads;
  const empty = EMPTY[filter];
  return (
    <>
      <PageHead title="Demandes reçues" back={{ href: '/org', label: 'Vos courses' }} sub="Les organisateurs qui ont écrit depuis la page Organisateurs." />
      {done && LEADS_DONE[done] ? <Flash tone="good">{LEADS_DONE[done]}</Flash> : null}
      <div class="toolbar">
        <Chips
          label="Afficher"
          items={[
            { label: 'À traiter', href: '/org/leads', on: filter === 'open', count: open.length },
            { label: 'Traitées', href: '/org/leads?show=handled', on: filter === 'handled', count: handled.length },
            { label: 'Toutes', href: '/org/leads?show=all', on: filter === 'all', count: leads.length },
          ]}
        />
      </div>
      <Card>
        {shown.length === 0 ? (
          <Empty title={empty.title}>{empty.text}</Empty>
        ) : (
          <Rows>
            {shown.map((l) => (
              <LeadRow lead={l} now={now} badge={filter === 'all'} />
            ))}
          </Rows>
        )}
      </Card>
    </>
  );
};
