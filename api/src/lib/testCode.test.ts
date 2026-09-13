import { describe, expect, it } from 'vitest';
import { acceptsTestCode, isTestAccount } from './testCode';

describe('test code sign-in', () => {
  it('accepts the fixed code for test accounts outside production', () => {
    expect(acceptsTestCode({ ENVIRONMENT: 'preview', TEST_CODE: '000000' }, 'marc@example.com', '000000')).toBe(true);
    expect(acceptsTestCode({ ENVIRONMENT: 'local', TEST_CODE: '000000' }, 'lea@example.com', '000000')).toBe(true);
  });
  it('never applies to real people, production, a wrong code or a missing var', () => {
    expect(acceptsTestCode({ ENVIRONMENT: 'preview', TEST_CODE: '000000' }, 'arthur.flam@gmail.com', '000000')).toBe(false);
    expect(acceptsTestCode({ ENVIRONMENT: 'production', TEST_CODE: '000000' }, 'marc@example.com', '000000')).toBe(false);
    expect(acceptsTestCode({ ENVIRONMENT: 'preview', TEST_CODE: '000000' }, 'marc@example.com', '123456')).toBe(false);
    expect(acceptsTestCode({ ENVIRONMENT: 'preview' }, 'marc@example.com', '000000')).toBe(false);
    expect(isTestAccount('someone@gmail.com')).toBe(false);
  });
});
