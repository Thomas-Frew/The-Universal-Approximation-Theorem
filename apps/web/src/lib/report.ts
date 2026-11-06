import * as Sentry from "@sentry/react";

/**
 * Crashes in players' browsers, sent to Sentry (the `uat-web` project): an
 * exception nothing caught, a promise rejection nobody handled, or a React
 * render error that would otherwise leave a blank page. The API's own errors
 * are reported by the API (`apps/api/src/report.ts`).
 *
 * The DSN is built in by Vite from VITE_SENTRY_DSN (a Docker build argument).
 * Without it, as in local development, nothing is sent.
 *
 * Kept out of reports: request bodies (players' code and query inputs),
 * cookies, and query strings, since `?admin=<token>` sits in the address for
 * a moment on an admin's first visit. The `#machine/3` part is kept: it says
 * which screen the player was on.
 */

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** `https://x/?admin=secret#machine/3` becomes `https://x/#machine/3`. */
const withoutQuery = (url: string) => url.replace(/\?[^#]*/, "");

/** Turns Sentry on, before the app first renders. */
export function startReporting(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.DEV ? "development" : "production",
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    // A second guard on the address, which Sentry records in several places.
    beforeSend(event) {
      if (event.request?.url) event.request.url = withoutQuery(event.request.url);
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data;
      if (data) {
        for (const key of ["url", "from", "to"]) {
          if (typeof data[key] === "string") data[key] = withoutQuery(data[key]);
        }
      }
      return breadcrumb;
    },
  });
}

/** Tags every later report with which game this is, once the API has said. */
export function reportMode(demo: boolean): void {
  Sentry.setTag("mode", demo ? "demo" : "live");
}

/** For `createRoot`: a React render error nothing caught. */
export const onUncaughtError = Sentry.reactErrorHandler();
