import { describe, expect, it } from 'vitest';
import { batteryCheck, canStart, gpsCheck, packCheck, permissionCheck } from './preflight';

describe('pre-flight checks', () => {
  it('locks GPS on a fix under 30 m and keeps the best accuracy seen', () => {
    expect(gpsCheck(null, 0).status).toBe('pending');
    expect(gpsCheck(80, 5_000).status).toBe('pending');
    expect(gpsCheck(12.4, 5_000)).toEqual({ status: 'ok', key: 'prepare.check.gps.ok', params: { accuracy: 12 } });
  });
  it('warns after 30 s without a lock, naming the accuracy when there was a fix', () => {
    expect(gpsCheck(null, 30_000)).toEqual({ status: 'warn', key: 'prepare.check.gps.timeout' });
    expect(gpsCheck(65, 31_000)).toEqual({ status: 'warn', key: 'prepare.check.gps.weak', params: { accuracy: 65 } });
  });
  it('wants the "always" permission on Android and accepts the web foreground one', () => {
    expect(permissionCheck(null, 'android').status).toBe('pending');
    expect(permissionCheck('always', 'android').status).toBe('ok');
    expect(permissionCheck('web', 'web').status).toBe('ok');
    expect(permissionCheck('foreground', 'android')).toMatchObject({ status: 'warn', key: 'prepare.check.permission.foreground' });
    expect(permissionCheck('denied', 'android')).toMatchObject({ status: 'warn', key: 'prepare.check.permission.denied' });
  });
  it('takes "while using" on an iPhone: iOS keeps a run started on screen measuring when it locks', () => {
    expect(permissionCheck('foreground', 'ios')).toEqual({ status: 'ok', key: 'prepare.check.permission.whileUsing' });
    expect(permissionCheck('always', 'ios').status).toBe('ok');
    expect(permissionCheck('denied', 'ios')).toMatchObject({ status: 'warn', key: 'prepare.check.permission.denied' });
    expect(canStart({ gps: gpsCheck(10, 1000), permission: permissionCheck('foreground', 'ios') })).toBe(true);
  });
  it('warns under 50 % battery and shrugs when the platform cannot tell', () => {
    expect(batteryCheck(undefined).status).toBe('pending');
    expect(batteryCheck(0.82)).toEqual({ status: 'ok', key: 'prepare.check.battery.ok', params: { level: 82 } });
    expect(batteryCheck(0.31)).toEqual({ status: 'warn', key: 'prepare.check.battery.low', params: { level: 31 } });
    expect(batteryCheck(-1).status).toBe('ok');
  });
  it('enables the start only with a GPS lock and the permission ok', () => {
    expect(canStart({ gps: gpsCheck(10, 1000), permission: permissionCheck('always', 'android') })).toBe(true);
    expect(canStart({ gps: gpsCheck(10, 1000), permission: permissionCheck('foreground', 'android') })).toBe(false);
    expect(canStart({ gps: gpsCheck(null, 1000), permission: permissionCheck('always', 'android') })).toBe(false);
  });
  it('says the audio pack is on the phone, and how big it is', () => {
    expect(packCheck({ status: 'ready', bytes: 1_850_000 }, 'fr')).toEqual({ status: 'ok', key: 'prepare.check.pack.ok', params: { size: '1,9 Mo' } });
    expect(packCheck({ status: 'ready', bytes: 1_850_000 }, 'en').params).toEqual({ size: '1.9 MB' });
    expect(packCheck({ status: 'loading', bytes: 0 }, 'fr')).toEqual({ status: 'pending', key: 'prepare.check.pack.loading' });
    expect(packCheck({ status: 'idle', bytes: 0 }, 'fr').status).toBe('pending');
  });
  it('warns when the pack did not come down or does not exist, and never holds the start for it', () => {
    expect(packCheck({ status: 'error', bytes: 0 }, 'fr')).toEqual({ status: 'warn', key: 'prepare.check.pack.error' });
    expect(packCheck({ status: 'none', bytes: 0 }, 'fr')).toEqual({ status: 'warn', key: 'prepare.check.pack.none' });
    const checks = { gps: gpsCheck(10, 1000), permission: permissionCheck('always', 'android'), pack: packCheck({ status: 'error', bytes: 0 }, 'fr') };
    expect(canStart(checks)).toBe(true);
  });
});
