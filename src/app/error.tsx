"use client";

import Link from "next/link";

// Error boundary for every page: lets the user retry the failed segment or go home.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] py-24 flex flex-col items-center text-center">
      <span aria-hidden="true" className="text-[6rem] md:text-[8rem] leading-none mb-8">
        💥
      </span>
      <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface mb-6 uppercase tracking-tighter">
        {"ALGO SE ROMPIÓ "}
        <span className="text-gradient-primary block sm:inline">EN EL REINO</span>
      </h1>
      <p className="text-body-lg font-body-lg text-on-surface-variant max-w-xl mb-12">
        No pudimos cargar esta página. Probá de nuevo en un toque.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <button
          type="button"
          onClick={() => retry()}
          className="btn-gradient px-8 py-4 rounded-xl text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest"
        >
          REINTENTAR
        </button>
        <Link href="/" className="text-label-caps font-label-caps text-primary hover:underline">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
