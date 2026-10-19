import type { Metadata } from "next";
import { KingdomMap } from "@/features/map/components/kingdom-map";

export const metadata: Metadata = {
  title: "Mapa del Reino - CoronaTeOnline",
  description: "Argentina en juego, provincia por provincia.",
};

// Full-height neon map of Argentina with the page heading floating over it.
export default function MapPage() {
  return (
    <main className="relative z-10 flex-1 min-h-[28rem] overflow-hidden">
      <KingdomMap />
      <div className="glass-panel pointer-events-none absolute top-4 left-4 right-4 sm:right-auto sm:max-w-sm rounded-xl p-4">
        <p className="text-label-caps font-label-caps text-tertiary">MAPA DEL REINO</p>
        <h1 className="text-title-md font-title-md text-on-surface uppercase tracking-tighter">
          Argentina en juego
        </h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant">
          Mové el mapa y elegí tu provincia. Las coronas de cada territorio llegan pronto.
        </p>
      </div>
    </main>
  );
}
