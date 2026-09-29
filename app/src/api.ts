import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { z } from 'zod';
import {
  AudioPackSchema,
  CLIENT_HEADER,
  CourseGeometrySchema,
  CourseSchema,
  EntrantPublicSchema,
  LiveVoiceSchema,
  PersonalVoicesSchema,
  RaceSchema,
  RunSchema,
  RunTraceSchema,
  SignInAmbiguitySchema,
  formatClientHeader,
} from '@sivoov/shared';
import type { CodeRequest, LiveVoiceRequest, Locale, Run, RunTrace, SignInAmbiguity } from '@sivoov/shared';

export const API_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'https://run.sivoov.app';

/**
 * `app/2.0.0 (android 16; samsung SM-S911B)` on every call, so the organizer can see who reached
 * the app and on which phone. Only what React Native already knows: no native module.
 */
const constants = Platform.constants as { Release?: string; Brand?: string; Model?: string };
const model = Platform.OS === 'android' ? [constants.Brand, constants.Model].filter(Boolean).join(' ') : Platform.OS === 'ios' ? ((Platform as { isPad?: boolean }).isPad ? 'iPad' : 'iPhone') : undefined;
const CLIENT = formatClientHeader({
  platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
  osVersion: Platform.OS === 'android' ? constants.Release : Platform.OS === 'ios' ? String(Platform.Version) : undefined,
  model,
  appVersion: Constants.expoConfig?.version,
});

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** The answer's body, for the errors that carry more than a code (a 409 `ambiguous` sign-in). */
    public body: unknown = null,
  ) {
    super(`${status} ${code}`);
  }
}

/** The races or the bib a sign-in must name, when the email holds more than one entry. */
export const ambiguityOf = (e: unknown): SignInAmbiguity | null =>
  e instanceof ApiError && e.status === 409 ? (SignInAmbiguitySchema.safeParse(e.body).data ?? null) : null;

/** Default for small calls; a phone on a weak signal must fail fast rather than hang. */
const TIMEOUT_MS = 20_000;
/** A marathon trace is about 1 MB: give it longer, but never forever. */
const UPLOAD_TIMEOUT_MS = 120_000;
/** The runner's own lines are written (AI) and recorded on the spot: a few seconds each. */
const VOICES_TIMEOUT_MS = 60_000;
/**
 * A live line is worth waiting for only while it is still news: past this, the offline version
 * plays. A Gemini voice takes about 3 s to render a split, so 4 s was too tight (2026-09-27).
 */
export const LIVE_VOICE_TIMEOUT_MS = 7_000;

const request = async <T extends z.ZodType>(path: string, schema: T, init: RequestInit = {}, token?: string, timeoutMs = TIMEOUT_MS): Promise<z.infer<T>> => {
  // fetch has no timeout of its own and React Native's has no read timeout: a stalled
  // request would otherwise hold the upload queue until the app restarts.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', [CLIENT_HEADER]: CLIENT, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? 'unknown', body);
    return schema.parse(body);
  } catch (e) {
    if (controller.signal.aborted) throw new Error('timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

const VerifySchema = z.object({ token: z.string(), expiresAt: z.string(), entrant: EntrantPublicSchema });
/** `map`: the Mapbox public token for the run screen's map; null (or an older cache without it) draws the course diagram. */
export const MeSchema = z.object({
  entrant: EntrantPublicSchema,
  race: RaceSchema,
  course: CourseSchema.nullable(),
  runs: z.array(RunSchema),
  map: z.object({ token: z.string().min(1) }).nullable().default(null),
});
export type Me = z.infer<typeof MeSchema>;

export const api = {
  /** The email, and the race or the bib once the server asked for them (`ambiguityOf`). */
  requestCode: (who: CodeRequest) => request('/auth/code', z.object({ sent: z.boolean(), devCode: z.string().optional() }), { method: 'POST', body: JSON.stringify(who) }),
  verifyCode: (who: CodeRequest, code: string) => request('/auth/verify', VerifySchema, { method: 'POST', body: JSON.stringify({ ...who, code }) }),
  /** « Supprimer mes données »: the runs, traces and sessions go; the entry stays with the organizer. */
  deleteMe: (token: string) => request('/me', z.object({ ok: z.boolean(), runs: z.number() }), { method: 'DELETE' }, token),
  me: (token: string) => request('/me', MeSchema, {}, token),
  /** The runner's language: the app's screens and their emails from now on. */
  setLocale: (token: string, locale: Locale) => request('/me/locale', z.object({ ok: z.boolean() }), { method: 'PUT', body: JSON.stringify({ locale }) }, token),
  signOut: (token: string) => request('/me/signout', z.object({ ok: z.boolean() }), { method: 'POST' }, token),
  geometry: (courseId: string) => request(`/courses/${courseId}/geometry`, CourseGeometrySchema),
  pack: (courseId: string) => request(`/courses/${courseId}/pack`, AudioPackSchema),
  /** The runner's own versions of the pack's personal lines; the position only picks the weather. */
  myVoices: (token: string, here?: { lat: number; lng: number }) =>
    request('/me/voices', PersonalVoicesSchema, { method: 'POST', body: JSON.stringify(here ?? {}) }, token, VOICES_TIMEOUT_MS),
  liveVoice: (token: string, req: LiveVoiceRequest) => request('/me/voices/live', LiveVoiceSchema, { method: 'POST', body: JSON.stringify(req) }, token, LIVE_VOICE_TIMEOUT_MS),
  uploadRun: (token: string, run: Run, trace?: RunTrace) =>
    request(`/runs/${run.id}`, z.object({ ok: z.boolean() }), { method: 'PUT', body: JSON.stringify({ run, trace: trace ? RunTraceSchema.parse(trace) : undefined }) }, token, UPLOAD_TIMEOUT_MS),
};
