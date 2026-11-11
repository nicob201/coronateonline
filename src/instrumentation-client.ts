import * as Sentry from "@sentry/nextjs";

// Read directly (not via lib/env) so Next inlines them into the client bundle; without a DSN Sentry stays off.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
});

// Traces client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
