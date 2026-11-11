import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";

// Starts Sentry in the server runtimes; without a DSN (CI, tests) it stays off.
export function register(): void {
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1,
  });
}

// Reports errors thrown by Server Components, Server Actions, route handlers and the proxy.
export const onRequestError = Sentry.captureRequestError;
