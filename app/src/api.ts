import Constants from 'expo-constants';
import { z } from 'zod';
import { CourseGeometrySchema, CourseSchema, EntrantPublicSchema, RaceSchema, RunSchema, RunTraceSchema } from '@sivoov/shared';
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

const request = async <T extends z.ZodType>(path: string, schema: T, init: RequestInit = {}, token?: string): Promise<z.infer<T>> => {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? 'unknown');
  return schema.parse(body);
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
  uploadRun: (token: string, run: Run, trace?: RunTrace) =>
    request(`/runs/${run.id}`, z.object({ ok: z.boolean() }), { method: 'PUT', body: JSON.stringify({ run, trace: trace ? RunTraceSchema.parse(trace) : undefined }) }, token),
};
