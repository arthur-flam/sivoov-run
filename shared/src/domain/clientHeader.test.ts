import { describe, expect, it } from 'vitest';
import { formatClientHeader, parseClientHeader, shouldRecordVisit } from './clientHeader';

describe('the app header', () => {
  it('reads what the app sends: platform, system version, phone and app version', () => {
    expect(parseClientHeader('app/2.0.0 (android 16; SM-S911B)')).toEqual({ platform: 'android', osVersion: '16', model: 'SM-S911B', appVersion: '2.0.0' });
    expect(parseClientHeader('app/2.1.0 (ios 18.2; iPhone)')).toEqual({ platform: 'ios', osVersion: '18.2', model: 'iPhone', appVersion: '2.1.0' });
  });

  it('writes a header it can read back', () => {
    const device = { platform: 'android', osVersion: '16', model: 'samsung SM-S911B', appVersion: '2.0.0' } as const;
    expect(formatClientHeader(device)).toBe('app/2.0.0 (android 16; samsung SM-S911B)');
    expect(parseClientHeader(formatClientHeader(device))).toEqual(device);
    expect(formatClientHeader({ platform: 'web' })).toBe('app (web)');
    expect(parseClientHeader('app (web)')).toEqual({ platform: 'web' });
  });

  it('keeps the header readable whatever the phone reports', () => {
    const header = formatClientHeader({ platform: 'android', osVersion: '16', model: 'Pixel (8); Pro\u00e9\n', appVersion: '2.0.0' });
    expect(header).toBe('app/2.0.0 (android 16; Pixel 8 Pro)');
    expect(/^[\x20-\x7E]+$/.test(header)).toBe(true);
  });

  it('tolerates partial and odd headers', () => {
    expect(parseClientHeader('app/2.0.0 (Android)')).toEqual({ platform: 'android', appVersion: '2.0.0' });
    expect(parseClientHeader('Sivoov/3 (iPhone OS 17.5)')).toEqual({ platform: 'ios', osVersion: '17.5', appVersion: '3' });
    expect(parseClientHeader(`app/2.0.0 (android 16; ${'x'.repeat(500)})`)?.model).toHaveLength(60);
  });

  it('returns nothing when it cannot tell the platform', () => {
    expect(parseClientHeader(undefined)).toBeNull();
    expect(parseClientHeader('')).toBeNull();
    expect(parseClientHeader('Mozilla/5.0')).toBeNull();
    expect(parseClientHeader('app/2.0.0 (windows 11)')).toBeNull();
    expect(parseClientHeader('(((;;;')).toBeNull();
  });
});

describe('recording a visit', () => {
  const now = new Date('2026-11-14T09:00:00Z');
  const phone = { platform: 'android', osVersion: '16', model: 'SM-S911B', appVersion: '2.0.0' } as const;
  it('writes at most once every ten minutes', () => {
    expect(shouldRecordVisit({ lastSeenAt: null, device: null }, null, now)).toBe(true);
    expect(shouldRecordVisit({ lastSeenAt: '2026-11-14T08:55:00Z', device: phone }, phone, now)).toBe(false);
    expect(shouldRecordVisit({ lastSeenAt: '2026-11-14T08:50:00Z', device: phone }, phone, now)).toBe(true);
    expect(shouldRecordVisit({ lastSeenAt: '2026-11-14T08:59:00Z', device: phone }, null, now)).toBe(false);
  });
  it('writes at once when the phone or the app version changes', () => {
    expect(shouldRecordVisit({ lastSeenAt: '2026-11-14T08:59:00Z', device: null }, phone, now)).toBe(true);
    expect(shouldRecordVisit({ lastSeenAt: '2026-11-14T08:59:00Z', device: phone }, { ...phone, appVersion: '2.0.1' }, now)).toBe(true);
  });
});
