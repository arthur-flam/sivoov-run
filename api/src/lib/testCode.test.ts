import { describe, expect, it } from 'vitest';
import { acceptsReviewCode, acceptsTestCode, isTestAccount, mayRehearse, maySpendCredit } from './testCode';
import { allowedRecipient } from './mailer';

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

describe('the App Review code', () => {
  const demo = { demoOf: 'r-champs' };
  it('opens a test account of a demo race, production included', () => {
    expect(acceptsReviewCode({ REVIEW_CODE: '424242' }, 'review@example.com', demo, '424242')).toBe(true);
  });
  it('never opens a real race, a real person, a wrong code, or anything when unset', () => {
    expect(acceptsReviewCode({ REVIEW_CODE: '424242' }, 'review@example.com', {}, '424242')).toBe(false);
    expect(acceptsReviewCode({ REVIEW_CODE: '424242' }, 'organizer@gmail.com', demo, '424242')).toBe(false);
    expect(acceptsReviewCode({ REVIEW_CODE: '424242' }, 'review@example.com', demo, '000000')).toBe(false);
    expect(acceptsReviewCode({}, 'review@example.com', demo, '424242')).toBe(false);
  });
});

describe('what a test account may do outside local', () => {
  it('cannot spend voice credit on preview or production, and can on local', () => {
    expect(maySpendCredit({ ENVIRONMENT: 'preview' }, 'orga@example.com')).toBe(false);
    expect(maySpendCredit({ ENVIRONMENT: 'production' }, 'orga@example.com')).toBe(false);
    expect(maySpendCredit({ ENVIRONMENT: 'preview' }, 'arthur.flam@gmail.com')).toBe(true);
    expect(maySpendCredit({ ENVIRONMENT: 'local' }, 'orga@example.com')).toBe(true);
  });
});

describe('who is offered a rehearsal before the race opens', () => {
  const race = {};
  const demo = { demoOf: 'r-deauville' };
  it('everyone on the test builds, test accounts and demo races in production', () => {
    expect(mayRehearse({ ENVIRONMENT: 'preview' }, 'arthur.flam@gmail.com', race)).toBe(true);
    expect(mayRehearse({ ENVIRONMENT: 'local' }, 'someone@gmail.com', race)).toBe(true);
    expect(mayRehearse({ ENVIRONMENT: 'production' }, 'review@example.com', race)).toBe(true);
    expect(mayRehearse({ ENVIRONMENT: 'production' }, 'organizer@gmail.com', demo)).toBe(true);
  });
  it('never a real runner of a real race in production', () => {
    expect(mayRehearse({ ENVIRONMENT: 'production' }, 'runner@gmail.com', race)).toBe(false);
  });
});

describe('the preview mail allowlist', () => {
  it('lets through listed addresses and domains only, whatever the case', () => {
    const list = 'arthur.flam@gmail.com, @sivoov.app';
    expect(allowedRecipient(list, 'Arthur.Flam@gmail.com')).toBe(true);
    expect(allowedRecipient(list, 'run@sivoov.app')).toBe(true);
    expect(allowedRecipient(list, 'victim@gmail.com')).toBe(false);
    expect(allowedRecipient(list, 'x@notsivoov.app')).toBe(false);
  });
});
