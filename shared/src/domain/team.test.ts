import { describe, expect, it } from 'vitest';
import { removalProblem, roleChangeProblem } from './team';

const alone = [
  { email: 'boss@example.com', role: 'owner' as const },
  { email: 'crew@example.com', role: 'editor' as const },
];
const two = [...alone, { email: 'second@example.com', role: 'owner' as const }];

describe('a race team', () => {
  it('always keeps one owner: the last one can be neither demoted nor removed', () => {
    expect(roleChangeProblem(alone, 'boss@example.com', 'editor')).toBe('last_owner');
    expect(removalProblem(alone, 'boss@example.com')).toBe('last_owner');
    expect(roleChangeProblem(alone, 'boss@example.com', 'owner')).toBeNull();
  });
  it('lets an owner step down once someone else is owner too', () => {
    expect(roleChangeProblem(two, 'boss@example.com', 'viewer')).toBeNull();
    expect(removalProblem(two, 'boss@example.com')).toBeNull();
  });
  it('changes or removes anyone else freely', () => {
    expect(roleChangeProblem(alone, 'crew@example.com', 'viewer')).toBeNull();
    expect(roleChangeProblem(alone, 'crew@example.com', 'owner')).toBeNull();
    expect(removalProblem(alone, 'crew@example.com')).toBeNull();
  });
  it('knows nobody outside the team, whatever the case of the address', () => {
    expect(removalProblem(alone, 'stranger@example.com')).toBe('not_member');
    expect(roleChangeProblem(alone, 'stranger@example.com', 'viewer')).toBe('not_member');
    expect(removalProblem(alone, ' Crew@Example.com ')).toBeNull();
  });
});
