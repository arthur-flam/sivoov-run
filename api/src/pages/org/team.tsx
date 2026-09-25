import { OrgRoleSchema, removalProblem } from '@sivoov/shared';
import type { Access, Organizer, Race } from '@sivoov/shared';
import { ROLE_HINTS, ROLE_LABELS, dateFr, plural } from './format';
import { TextField } from './settingsFields';
import type { FormState } from './settingsFields';
import { Badge, Card, Choices, ConfirmButton, Disclose, Empty, Flash, PageHead, Row, Rows } from './ui';
import type { ChoiceOption } from './ui';

export const TEAM_DONE: Record<string, string> = {
  invited: 'Invitation envoyée. La personne peut entrer dès maintenant avec son adresse email.',
  reinvited: 'Déjà dans l’équipe : son rôle est mis à jour et l’invitation envoyée à nouveau.',
  role: 'Le rôle est modifié.',
  removed: 'La personne est retirée de l’équipe. Elle n’a plus accès à cette course.',
};

export const TEAM_PROBLEMS: Record<string, string> = {
  last_owner: 'Une course garde toujours au moins un responsable. Nommez d’abord une autre personne Responsable.',
  not_member: 'Cette personne ne fait plus partie de l’équipe.',
};

const ROLE_OPTIONS: ChoiceOption[] = OrgRoleSchema.options.map((role) => ({ value: role, label: ROLE_LABELS[role], hint: ROLE_HINTS[role] }));

const initials = (m: Organizer): string =>
  (m.name
    ? m.name
        .split(/\s+/)
        .map((w) => w[0] ?? '')
        .join('')
    : m.email
  ).slice(0, 2);

type Props = { race: Race; access: Access; members: Organizer[]; done?: string; problem?: string; invite?: FormState; now?: Date };

/** What the list says about how someone joined: who invited them and when. */
const joined = (m: Organizer, members: Organizer[], timeZone: string): string | undefined => {
  const by = m.invitedBy ? (members.find((o) => o.email === m.invitedBy)?.name ?? m.invitedBy) : undefined;
  const when = m.createdAt ? dateFr(m.createdAt, timeZone) : undefined;
  if (by && when) return `Invitation de ${by}, le ${when}`;
  if (by) return `Invitation de ${by}`;
  return when ? `Dans l’équipe depuis le ${when}` : undefined;
};

const MemberRow = ({ race, member, members, me }: { race: Race; member: Organizer; members: Organizer[]; me: string }) => {
  const base = `/org/${race.slug}/team`;
  const last = removalProblem(members, member.email) === 'last_owner';
  const who = member.name ?? member.email;
  const line = [member.name ? member.email : undefined, joined(member, members, race.timezone)].filter(Boolean).join(' · ');
  return (
    <Row
      lead={<span class="avatar">{initials(member)}</span>}
      title={who}
      sub={line || undefined}
      aside={
        <>
          {member.email === me ? <Badge>Vous</Badge> : null}
          <Badge tone={member.role === 'owner' ? 'info' : 'neutral'}>{ROLE_LABELS[member.role]}</Badge>
        </>
      }
    >
      <Disclose label="Modifier">
        {last ? (
          <p class="small">C’est le seul responsable de la course. Pour changer son rôle ou le retirer, nommez d’abord une autre personne Responsable.</p>
        ) : (
          <>
            <form method="post" action={`${base}/role`}>
              <input type="hidden" name="email" value={member.email} />
              <Choices name="role" legend="Rôle" options={ROLE_OPTIONS} selected={[member.role]} />
              <button class="btn btn-primary btn-sm" type="submit">
                Changer le rôle
              </button>
            </form>
            <hr class="sep" />
            <form method="post" action={`${base}/remove`}>
              <input type="hidden" name="email" value={member.email} />
              <ConfirmButton class="btn btn-danger btn-sm" message={`Retirer ${who} de l’équipe ? Cette personne n’aura plus accès à la course.`}>
                Retirer de l’équipe
              </ConfirmButton>
            </form>
          </>
        )}
      </Disclose>
    </Row>
  );
};

const InviteCard = ({ race, invite }: { race: Race; invite: FormState }) => (
  <Card id="invite" title="Inviter quelqu’un" sub="La personne reçoit un email avec le lien pour entrer.">
    <form method="post" action={`/org/${race.slug}/team/invite#invite`}>
      <TextField
        name="email"
        type="email"
        label="Adresse email"
        autocomplete="off"
        required
        values={invite.values}
        errors={invite.errors}
        focus={Boolean(invite.errors.email)}
      />
      <TextField name="name" label="Nom" hint="Facultatif." values={invite.values} errors={invite.errors} />
      <Choices name="role" legend="Rôle" options={ROLE_OPTIONS} selected={[invite.values.role || 'editor']} error={invite.errors.role} />
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">
          Envoyer l’invitation
        </button>
      </div>
    </form>
    <p class="small muted" style="margin-top:12px">
      Inviter une personne déjà dans l’équipe met simplement son rôle à jour.
    </p>
  </Card>
);

/** The race's team: who is in it and with which role, and the invitation form. */
export const OrgTeamPage = ({ race, access, members, done, problem, invite = { values: {}, errors: {} } }: Props) => (
  <>
    <PageHead title="Équipe" sub="Chaque personne entre avec son adresse email et un code reçu par email. Il n’y a pas de mot de passe." />
    {done && TEAM_DONE[done] ? <Flash tone="good">{TEAM_DONE[done]}</Flash> : null}
    {problem ? <Flash tone="bad">{problem}</Flash> : null}
    <div class="grid main-side">
      <div>
        <Card title="Membres" sub={plural(members.length, 'personne', 'personnes')}>
          {members.length === 0 ? (
            <Empty title="Personne dans l’équipe pour le moment.">Invitez le responsable de la course avec le formulaire.</Empty>
          ) : (
            <Rows>
              {members.map((m) => (
                <MemberRow race={race} member={m} members={members} me={access.email} />
              ))}
            </Rows>
          )}
          {access.staff && !access.role ? (
            <p class="small muted" style="margin-top:12px">
              Vous voyez cette équipe en tant que membre de l’équipe Sivoov. Vous n’apparaissez pas dans la liste.
            </p>
          ) : null}
        </Card>
      </div>
      <div>
        <InviteCard race={race} invite={invite} />
      </div>
    </div>
  </>
);
