import Link from "next/link";

// 404 page for unknown routes and notFound() calls (missing titles or profiles).
export default function NotFound() {
  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] py-24 flex flex-col items-center text-center">
      <span aria-hidden="true" className="text-[6rem] md:text-[8rem] leading-none mb-8 grayscale opacity-60">
        👑
      </span>
      <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface mb-6 uppercase tracking-tighter">
        {"ESTE TRONO "}
        <span className="text-gradient-primary block sm:inline">NO EXISTE</span>
      </h1>
      <p className="text-body-lg font-body-lg text-on-surface-variant max-w-xl mb-12">
        El título o perfil que buscás no está en el reino. Capaz se lo llevó el
        viento, capaz nunca existió.
      </p>
      <Link
        href="/titulos"
        className="btn-gradient px-8 py-4 rounded-xl text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest"
      >
        👑 VER TÍTULOS
      </Link>
    </main>
  );
}
