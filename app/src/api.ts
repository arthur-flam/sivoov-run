import Constants from 'expo-constants';
import { z } from 'zod';
import { AudioPackSchema, CourseGeometrySchema, CourseSchema, EntrantPublicSchema, RaceSchema, RunSchema, RunTraceSchema } from '@sivoov/shared';
import type { Run, RunTrace } from '@sivoov/shared';

export const API_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'https://run.sivoov.app';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`${status} ${code}`);
  }
}

/** Default for small calls; a phone on a weak signal must fail fast rather than hang. */
const TIMEOUT_MS = 20_000;
/** A marathon trace is about 1 MB: give it longer, but never forever. */
const UPLOAD_TIMEOUT_MS = 120_000;

const request = async <T extends z.ZodType>(path: string, schema: T, init: RequestInit = {}, token?: string, timeoutMs = TIMEOUT_MS): Promise<z.infer<T>> => {
  // fetch has no timeout of its own and React Native's has no read timeout: a stalled
  // request would otherwise hold the upload queue until the app restarts.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? 'unknown');
    return schema.parse(body);
  } catch (e) {
    if (controller.signal.aborted) throw new Error('timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

const VerifySchema = z.object({ token: z.string(), expiresAt: z.string(), entrant: EntrantPublicSchema });
export const MeSchema = z.object({ entrant: EntrantPublicSchema, race: RaceSchema, course: CourseSchema.nullable(), runs: z.array(RunSchema) });
export type Me = z.infer<typeof MeSchema>;

export const api = {
  requestCode: (raceSlug: string, bib: string, email: string) =>
    request('/auth/code', z.object({ sent: z.boolean(), devCode: z.string().optional() }), { method: 'POST', body: JSON.stringify({ raceSlug, bib, email }) }),
  verifyCode: (raceSlug: string, bib: string, email: string, code: string) =>
    request('/auth/verify', VerifySchema, { method: 'POST', body: JSON.stringify({ raceSlug, bib, email, code }) }),
  me: (token: string) => request('/me', MeSchema, {}, token),
  signOut: (token: string) => request('/me/signout', z.object({ ok: z.boolean() }), { method: 'POST' }, token),
  geometry: (courseId: string) => request(`/courses/${courseId}/geometry`, CourseGeometrySchema),
  pack: (courseId: string) => request(`/courses/${courseId}/pack`, AudioPackSchema),
  uploadRun: (token: string, run: Run, trace?: RunTrace) =>
    request(`/runs/${run.id}`, z.object({ ok: z.boolean() }), { method: 'PUT', body: JSON.stringify({ run, trace: trace ? RunTraceSchema.parse(trace) : undefined }) }, token, UPLOAD_TIMEOUT_MS),
};
