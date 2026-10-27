import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live-refresh";
import { RankingTable } from "@/features/rankings/components/ranking-table";
import { createClient } from "@/lib/supabase/server";
import { getRankings } from "@/services/rankings.server";

export const metadata: Metadata = {
  title: "Rankings - CoronaTeOnline",
  description: "Las coronas más caras, las más disputadas, los reinados más largos y los magnates.",
};

// Four top-10 tables: priciest crowns, most contested titles, longest reigns and richest players.
export default async function RankingsPage() {
  const rankings = await getRankings(await createClient());

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-16 pb-32">
      <LiveRefresh />
      <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface mb-10 uppercase tracking-tighter">
        Los que <span className="text-gradient-primary">mandan</span>
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RankingTable icon="diamond" title="MÁS CARAS" empty="Todavía no hay coronas con dueño." entries={rankings.priciest} />
        <RankingTable icon="swords" title="MÁS DISPUTADAS" empty="Todavía nadie se coronó." entries={rankings.contested} />
        <RankingTable icon="hourglass_top" title="REINADOS MÁS LARGOS" empty="Todavía no hay reinados." entries={rankings.longest} />
        <RankingTable icon="savings" title="MAGNATES" empty="Todavía no hay magnates." entries={rankings.magnates} />
      </div>
    </main>
  );
}
