import { describe, expect, it } from 'vitest';
import { batteryCheck, canStart, gpsCheck, permissionCheck } from './preflight';

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
  it('wants the "always" permission on device and accepts the web foreground one', () => {
    expect(permissionCheck(null).status).toBe('pending');
    expect(permissionCheck('always').status).toBe('ok');
    expect(permissionCheck('web').status).toBe('ok');
    expect(permissionCheck('foreground')).toMatchObject({ status: 'warn', key: 'prepare.check.permission.foreground' });
    expect(permissionCheck('denied')).toMatchObject({ status: 'warn', key: 'prepare.check.permission.denied' });
  });
  it('warns under 50 % battery and shrugs when the platform cannot tell', () => {
    expect(batteryCheck(undefined).status).toBe('pending');
    expect(batteryCheck(0.82)).toEqual({ status: 'ok', key: 'prepare.check.battery.ok', params: { level: 82 } });
    expect(batteryCheck(0.31)).toEqual({ status: 'warn', key: 'prepare.check.battery.low', params: { level: 31 } });
    expect(batteryCheck(-1).status).toBe('ok');
  });
  it('enables the start only with a GPS lock and the permission ok', () => {
    expect(canStart({ gps: gpsCheck(10, 1000), permission: permissionCheck('always') })).toBe(true);
    expect(canStart({ gps: gpsCheck(10, 1000), permission: permissionCheck('foreground') })).toBe(false);
    expect(canStart({ gps: gpsCheck(null, 1000), permission: permissionCheck('always') })).toBe(false);
  });
});
