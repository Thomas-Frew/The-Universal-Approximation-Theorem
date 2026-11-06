import * as Sentry from "@sentry/node";

/**
 * Errors nobody expected: a route that crashed, Judge0 failing. They are
 * logged, and with SENTRY_DSN set also sent to Sentry, which groups repeats
 * and emails when a new kind appears. Problems the player is meant to see
 * (`GameError`) are not errors in this sense and never come here.
 *
 * Sentry's defaults collect nearly everything around an error, and here that
 * would include players' code (request bodies), hidden tests (the request to
 * Judge0, and local variables in `judge.ts`), and session cookies. None of it
 * may leave the server, so each kind is switched off below; an error report
 * carries only the error, its stack trace and the route.
 */

/** Turns Sentry on. Without a DSN, `reportError` only logs. */
export function startReporting(dsn: string | null, environment: string): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    dataCollection: {
      userInfo: false,
      cookies: false,
      // Only enough to tell browsers apart; never Cookie or anything else.
      httpHeaders: { request: { allow: ["user-agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    // A second guard, in case a later SDK version attaches a body some other way.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      return event;
    },
  });
}

/** Logs an unexpected error and, if Sentry is on, sends it there. */
export function reportError(error: unknown): void {
  console.error(error);
  Sentry.captureException(error);
}
