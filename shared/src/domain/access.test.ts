import { describe, expect, it } from 'vitest';
import { ORG_ACTIONS, can, parseStaffEmails } from './access';
import { OrganizerSchema } from '../schemas/organizer';
import type { Access } from './access';

const person = (role: Access['role'], staff = false): Access => ({ email: 'x@example.com', staff, role });

describe('organizer access', () => {
  it('lets a viewer look and download, nothing else', () => {
    expect(ORG_ACTIONS.filter((a) => can(person('viewer'), a))).toEqual(['view']);
  });
  it('lets an editor work on runners, activities and the audio, not on the race or the team', () => {
    const editor = person('editor');
    expect(can(editor, 'edit_runners') && can(editor, 'review_runs') && can(editor, 'edit_audio')).toBe(true);
    expect(can(editor, 'edit_race') || can(editor, 'manage_team')).toBe(false);
  });
  it('lets an owner run their race but not create races or read leads', () => {
    const owner = person('owner');
    expect(can(owner, 'edit_race') && can(owner, 'manage_team')).toBe(true);
    expect(can(owner, 'create_race') || can(owner, 'see_leads')).toBe(false);
  });
  it('lets staff do everything, even on a race they are not a member of', () => {
    expect(ORG_ACTIONS.every((a) => can(person(null, true), a))).toBe(true);
  });
  it('gives nothing to someone who is neither a member nor staff', () => {
    expect(ORG_ACTIONS.some((a) => can(person(null), a))).toBe(false);
  });
  it('reads the staff list from a comma-separated var, case-insensitively', () => {
    expect([...parseStaffEmails(' Arthur@Example.com, ,staff@example.com ')]).toEqual(['arthur@example.com', 'staff@example.com']);
    expect(parseStaffEmails(undefined).size).toBe(0);
  });
  it('makes an organizer without a role an owner, as every organizer was before roles existed', () => {
    expect(OrganizerSchema.parse({ id: 'o', raceId: 'r', email: 'A@B.fr' })).toMatchObject({ role: 'owner', email: 'a@b.fr' });
  });
});
