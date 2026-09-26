import type { OrgRole } from '../schemas/organizer';

/**
 * Who may do what in the organizer admin. One pure table, used by the Worker to guard every
 * route and by the pages to hide what a person cannot use. Sivoov staff may do everything, on
 * every race, including creating one.
 */
export const ORG_ACTIONS = [
  'view', // see runners, activities, results; download the lists
  'edit_runners', // add, edit, import runners
  'review_runs', // set a time aside or bring it back
  'edit_audio', // courses, GPX, the announcements, publishing
  'edit_race', // name, dates, colors, status, support email
  'manage_team', // invite, change roles, remove
  'create_race', // staff only
  'see_leads', // staff only: organizers who asked to hear more
] as const;
export type OrgAction = (typeof ORG_ACTIONS)[number];

/** What the Worker knows about the person on a race page: staff, and their role on that race. */
export type Access = { email: string; staff: boolean; role: OrgRole | null };

const BY_ROLE: Record<OrgRole, readonly OrgAction[]> = {
  viewer: ['view'],
  editor: ['view', 'edit_runners', 'review_runs', 'edit_audio'],
  owner: ['view', 'edit_runners', 'review_runs', 'edit_audio', 'edit_race', 'manage_team'],
};

export const can = (access: Access, action: OrgAction): boolean =>
  access.staff || (access.role !== null && BY_ROLE[access.role].includes(action));

/** "a@x.fr, B@y.fr" -> a set of lowercased addresses. The STAFF_EMAILS var. */
export const parseStaffEmails = (value: string | undefined): ReadonlySet<string> =>
  new Set(
    (value ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes('@')),
  );
