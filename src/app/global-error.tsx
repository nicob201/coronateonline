"use client";

import ErrorPage from "./error";
import "./globals.css";

// Last-resort boundary for errors in the root layout itself (header, bell): renders its own document.
export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-AR">
      <body className="bg-background text-on-background min-h-dvh">
        <title>Algo se rompió · CoronaTeOnline</title>
        <ErrorPage {...props} />
      </body>
    </html>
  );
}
