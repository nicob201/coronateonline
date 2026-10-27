import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live-refresh";
import { KingdomMap } from "@/features/map/components/kingdom-map";
import { createClient } from "@/lib/supabase/server";
import { getProvinceSummaries } from "@/services/map.server";

export const metadata: Metadata = {
  title: "Mapa del Reino - CoronaTeOnline",
  description: "Argentina en juego, provincia por provincia.",
};

// Full-height neon map of Argentina with the page heading floating over it.
export default async function MapPage() {
  const provinces = await getProvinceSummaries(await createClient());

  return (
    <main className="relative z-10 flex-1 min-h-[28rem] overflow-hidden">
      <LiveRefresh />
      <KingdomMap initialData={provinces} />
      <div className="glass-panel pointer-events-none absolute top-4 left-4 right-4 sm:right-auto sm:max-w-sm rounded-xl p-4">
        <p className="text-label-caps font-label-caps text-tertiary">MAPA DEL REINO</p>
        <h1 className="text-title-md font-title-md text-on-surface uppercase tracking-tighter">
          Argentina en juego
        </h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant">
          Pasá el mouse por una provincia para ver quién manda. Tocala para ver el ranking completo.
        </p>
      </div>
    </main>
  );
}
