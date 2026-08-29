import Link from "next/link";

// Global site footer: brand, primary link and tagline.
export function SiteFooter() {
  return (
    <footer className="w-full px-5 md:px-16 py-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-surface-container-lowest border-t border-outline-variant/20 relative z-10">
      <span className="text-title-md font-title-md text-on-surface font-black tracking-tighter uppercase">
        CoronaTeOnline
      </span>
      <Link
        href="/titulos"
        className="text-label-caps font-label-caps text-outline hover:text-primary transition-colors"
      >
        Explorar títulos
      </Link>
      <span className="text-body-sm font-body-sm text-tertiary text-center md:text-right">
        Coronate si podés.
      </span>
    </footer>
  );
}
