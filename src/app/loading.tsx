// ponytail: streaming turns notFound() into a soft 404 (200 + noindex); check existence in proxy if real 404 status matters.
// Instant loading state shown while a page's server data streams in.
export default function Loading() {
  return (
    <main role="status" className="relative z-10 flex-1 min-h-dvh flex flex-col items-center justify-center py-32 gap-6">
      <span aria-hidden="true" className="text-[8rem] leading-none crown-float">
        👑
      </span>
      <span className="text-label-caps font-label-caps text-on-surface-variant tracking-widest">
        CARGANDO EL REINO…
      </span>
    </main>
  );
}
