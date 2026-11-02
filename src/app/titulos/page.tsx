import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTitlesWithCurrentReign } from "@/services/titles.server";
import { TitleCard } from "@/components/title-card";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata: Metadata = {
  title: "Explorar títulos - CoronaTeOnline",
  description: "Todos los títulos en juego. Encontrá tu corona.",
};

// Grid of every title with its current holder and price.
export default async function TitlesPage() {
  const supabase = await createClient();
  const titles = await getTitlesWithCurrentReign(supabase);

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-16 pb-32">
      <LiveRefresh />
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface uppercase tracking-tighter">
          Encontrá tu <span className="text-gradient-primary">corona</span>
        </h1>
        <Link
          href="/titulos/nuevo"
          className="btn-gradient px-6 py-3 rounded-xl text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest"
        >
          + CREAR TÍTULO
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {titles.map((title) => (
          <TitleCard key={title.id} title={title} />
        ))}
      </div>
    </main>
  );
}
