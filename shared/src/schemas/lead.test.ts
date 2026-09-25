import { describe, expect, it } from 'vitest';
import { LeadInputSchema } from './lead';

describe('organizer lead', () => {
  const base = { name: 'Claire Dubois', email: 'claire@example.com', race: 'Trail des Falaises' };

  it('normalizes the email and keeps names on one line', () => {
    const lead = LeadInputSchema.parse({ ...base, email: ' Claire@Example.COM ', name: '  Claire\n  Dubois ' });
    expect(lead.email).toBe('claire@example.com');
    expect(lead.name).toBe('Claire Dubois');
  });
  it('treats an empty message as no message', () => {
    expect(LeadInputSchema.parse({ ...base, message: '   ' }).message).toBeUndefined();
    expect(LeadInputSchema.parse({ ...base, message: ' Bonjour ' }).message).toBe('Bonjour');
  });
  it('requires a name, a valid email and the race', () => {
    const result = LeadInputSchema.safeParse({ name: ' ', email: 'claire@', race: '' });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((i) => i.path[0]).sort();
    expect(fields).toEqual(['email', 'name', 'race']);
  });
});
