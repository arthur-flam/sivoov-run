import type { OrgRole } from '../schemas/organizer';

/**
 * The rules of a race's team. A race always keeps at least one owner ("Responsable"): nobody,
 * not even that owner, can remove or demote the last one. Anything else is allowed to whoever
 * may manage the team (see `can(access, 'manage_team')`).
 */

type Member = { email: string; role: OrgRole };
export type TeamProblem = 'not_member' | 'last_owner';

const owners = (members: readonly Member[]): number => members.filter((m) => m.role === 'owner').length;
const find = (members: readonly Member[], email: string): Member | undefined => members.find((m) => m.email === email.trim().toLowerCase());

/** Why `email` cannot get `role` on this team, or null when it can. */
export const roleChangeProblem = (members: readonly Member[], email: string, role: OrgRole): TeamProblem | null => {
  const member = find(members, email);
  if (!member) return 'not_member';
  return member.role === 'owner' && role !== 'owner' && owners(members) <= 1 ? 'last_owner' : null;
};

/** Why `email` cannot leave this team, or null when it can. */
export const removalProblem = (members: readonly Member[], email: string): TeamProblem | null => {
  const member = find(members, email);
  if (!member) return 'not_member';
  return member.role === 'owner' && owners(members) <= 1 ? 'last_owner' : null;
};
