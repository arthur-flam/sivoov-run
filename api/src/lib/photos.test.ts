import { describe, expect, it } from 'vitest';
import type { Bindings } from '../env';
import { remixDeps, remixEnabled } from './photos';

const env = (over: Partial<Bindings>) => ({ FILES: {}, CF_ACCOUNT_ID: 'acc', AI_GATEWAY: 'gw', ...over }) as unknown as Bindings;

describe('who the image model works for', () => {
  it('makes real pictures for real runners where the key is set', () => {
    const deps = remixDeps(env({ ENVIRONMENT: 'production', GEMINI_API_KEY: 'k' }), 'marc.dupont@gmail.com');
    expect(deps.gemini).toBeDefined();
    expect(deps.standIn).toBe(false);
  });
  it('gives a test account (App Review’s public sign-in) its own photo back, never a paid picture', () => {
    const deps = remixDeps(env({ ENVIRONMENT: 'production', GEMINI_API_KEY: 'k' }), 'review@example.com');
    expect(deps.gemini).toBeUndefined();
    expect(deps.standIn).toBe(true);
  });
  it('is off for everyone where no key is set, test accounts included', () => {
    expect(remixEnabled(remixDeps(env({ ENVIRONMENT: 'production' }), 'review@example.com'))).toBe(false);
    expect(remixEnabled(remixDeps(env({ ENVIRONMENT: 'production' }), 'marc.dupont@gmail.com'))).toBe(false);
  });
  it('stands in on a local Worker with no key, for the pages and the screenshots', () => {
    expect(remixDeps(env({ ENVIRONMENT: 'local' }), 'lea@example.com').standIn).toBe(true);
  });
});
