import * as Sentry from '@sentry/cloudflare';
import type { Hono } from 'hono';
import type { AppEnv, Bindings } from '../env';

/**
 * Error reports to Sentry (ARCHITECTURE.md, Stack). Only with the `SENTRY_DSN` secret: without it
 * (local, the tests, a deployment nobody configured) requests go straight to the app, and
 * `reportError` has no client to send to.
 *
 * Errors only: no tracing (`SENTRY_TRACES_SAMPLE_RATE` would turn it on without a deploy) and
 * nothing about the people behind a request. Sign-in bodies carry emails and codes, headers carry
 * session tokens and cookies: none of them is collected.
 */
const options = (env: Bindings): Sentry.CloudflareOptions => ({
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
  },
});

/** The Worker's handler: the app, wrapped for Sentry when this deployment has a DSN. */
export const withErrorReports = (app: Hono<AppEnv>): ExportedHandler<Bindings> => {
  const reported = Sentry.withSentry(options, { fetch: app.fetch } satisfies ExportedHandler<Bindings>);
  return {
    fetch: (request, env, ctx) => (env.SENTRY_DSN && reported.fetch ? reported.fetch(request, env, ctx) : app.fetch(request, env, ctx)),
  };
};

/** Hono answers a thrown error itself (`app.onError`), so the wrapper never sees it: report it here. */
export const reportError = (err: unknown): void => {
  Sentry.captureException(err);
};
