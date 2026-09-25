import { DeviceInfoSchema } from '../schemas/run';
import type { DeviceInfo } from '../schemas/run';

/**
 * The `X-Sivoov-Client` header the app sends with every API call, so the organizer can see
 * who reached the app and on which phone: `app/2.0.0 (android 16; samsung SM-S911B)`.
 * Built by the app from what React Native already knows (no native module), parsed by the
 * Worker into `sessions.device`. The parser accepts anything and returns null when it cannot
 * tell the platform: a header is a hint, never a reason to fail a request.
 */
export const CLIENT_HEADER = 'X-Sivoov-Client';

/** Nothing a header carries needs more; a longer value is cut, not refused. */
const MAX = { header: 200, version: 20, model: 60 } as const;

/** Printable ASCII only (a header value must be), single spaces, none of the header's own `();`. */
const clean = (s: string | undefined, max: number): string | undefined => {
  const out = (s ?? '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[();]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return out === '' ? undefined : out;
};

export const formatClientHeader = (device: DeviceInfo): string => {
  const os = [device.platform, clean(device.osVersion, MAX.version)].filter(Boolean).join(' ');
  const model = clean(device.model, MAX.model);
  const version = clean(device.appVersion, MAX.version)?.replace(/\s/g, '');
  return `app${version ? `/${version}` : ''} (${model ? `${os}; ${model}` : os})`;
};

const PLATFORMS: Array<[DeviceInfo['platform'], RegExp]> = [
  ['android', /^android$/],
  ['ios', /^(ios|iphone ?os|ipados|iphone|ipad)$/],
  ['web', /^web$/],
];

/** `app/2.0.0 (android 16; SM-S911B)` -> { platform, osVersion, model, appVersion }, or null. */
export const parseClientHeader = (value: string | null | undefined): DeviceInfo | null => {
  const header = (value ?? '').slice(0, MAX.header);
  const m = /^\s*[\w.-]*\/?([^\s(]*)\s*\(([^)]*)\)?/.exec(header);
  if (!m) return null;
  const [system = '', model] = (m[2] ?? '').split(';').map((s) => s.trim());
  const words = system.split(/\s+/);
  const versionAt = words.findIndex((w) => /^\d/.test(w));
  const name = (versionAt === -1 ? words : words.slice(0, versionAt)).join(' ').toLowerCase();
  const platform = PLATFORMS.find(([, re]) => re.test(name))?.[0];
  if (!platform) return null;
  const parsed = DeviceInfoSchema.safeParse({
    platform,
    osVersion: versionAt === -1 ? undefined : clean(words[versionAt], MAX.version),
    model: clean(model, MAX.model),
    appVersion: clean(m[1], MAX.version),
  });
  return parsed.success ? parsed.data : null;
};

/** A session's last visit is written at most this often, so an app polling the API costs one write per ten minutes. */
export const SEEN_EVERY_MS = 10 * 60 * 1000;

const sameDevice = (a: DeviceInfo | null, b: DeviceInfo): boolean =>
  a !== null && a.platform === b.platform && a.osVersion === b.osVersion && a.model === b.model && a.appVersion === b.appVersion;

/** Whether a request should update its session: first visit, ten minutes since the last one, or a new phone or app version. */
export const shouldRecordVisit = (session: { lastSeenAt: string | null; device: DeviceInfo | null }, device: DeviceInfo | null, now: Date): boolean =>
  session.lastSeenAt === null || now.getTime() - new Date(session.lastSeenAt).getTime() >= SEEN_EVERY_MS || (device !== null && !sameDevice(session.device, device));
