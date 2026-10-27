import Link from "next/link";

// Global site footer: brand, primary links and tagline.
export function SiteFooter() {
  return (
    <footer className="w-full px-5 md:px-16 py-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-surface-container-lowest border-t border-outline-variant/20 relative z-10">
      <span className="text-title-md font-title-md text-on-surface font-black tracking-tighter uppercase">
        CoronaTeOnline
      </span>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 whitespace-nowrap">
        <Link
          href="/titulos"
          className="text-label-caps font-label-caps text-outline hover:text-primary transition-colors"
        >
          Explorar títulos
        </Link>
        <Link
          href="/mapa"
          className="text-label-caps font-label-caps text-outline hover:text-primary transition-colors"
        >
          Mapa del Reino
        </Link>
        <Link
          href="/rankings"
          className="text-label-caps font-label-caps text-outline hover:text-primary transition-colors"
        >
          Rankings
        </Link>
      </div>
      <span className="text-body-sm font-body-sm text-tertiary text-center md:text-right">
        Coronate si podés.
      </span>
    </footer>
  );
}
