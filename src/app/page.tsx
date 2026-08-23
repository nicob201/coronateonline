import Link from "next/link";

export default function Home() {
  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-16 pb-32">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center py-20 relative">
        <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface mb-6 uppercase tracking-tighter">
          {"¿QUÉ "}
          <span className="text-gradient-primary">{"QUERÉS SER?"}</span>
        </h1>
        <p className="text-body-lg font-body-lg text-on-surface-variant max-w-2xl mb-12">
          Elegí tu título. Coronate. Hacete conocido. El under digital donde el
          estatus se paga y se defiende.
        </p>
        <div className="flex flex-col sm:flex-row gap-6">
          <Link
            href="/titulos"
            className="btn-gradient px-8 py-4 rounded-xl text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest flex items-center justify-center gap-2"
          >
            VER TITULOS
          </Link>
        </div>
      </section>
    </main>
  );
}
