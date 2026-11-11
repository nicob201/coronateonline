"use client";

import ErrorPage from "./error";
import "./globals.css";

// Last-resort boundary when the root layout itself fails: same page (and Sentry report) inside its own document.
export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-AR">
      <body className="bg-background text-on-background min-h-dvh">
        <ErrorPage {...props} />
      </body>
    </html>
  );
}
