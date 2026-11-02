import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTitlesWithCurrentReign } from "@/services/titles.server";
import { getBalance } from "@/services/wallet.server";
import { TitleCard } from "@/components/title-card";
import { LiveRefresh } from "@/components/live-refresh";
import { TitleFilters } from "@/features/titles/components/title-filters";
import { filterTitles } from "@/features/titles/lib/filter-titles";
import { titleFiltersSchema } from "@/features/titles/schemas/title-filters.schema";

export const metadata: Metadata = {
  title: "Explorar títulos - CoronaTeOnline",
  description: "Todos los títulos en juego. Encontrá tu corona.",
};

// Grid of every title with its current holder and price, narrowed by the search, category, sort and "Me alcanza" in the URL.
export default async function TitlesPage({ searchParams }: PageProps<"/titulos">) {
  const filters = titleFiltersSchema.parse(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [titles, balance] = await Promise.all([
    getTitlesWithCurrentReign(supabase),
    user ? getBalance(supabase, user.id) : null,
  ]);
  const viewer = user && balance !== null ? { id: user.id, balance } : null;
  const { results, counts } = filterTitles(titles, filters, viewer);

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-16 pb-32">
      <LiveRefresh />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
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

      <div className="mb-8">
        <TitleFilters filters={filters} counts={counts} signedIn={viewer !== null} />
      </div>

      {results.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 flex flex-col items-center text-center gap-3">
          <p className="text-title-md font-title-md text-on-surface">No hay títulos así.</p>
          <Link
            href="/titulos/nuevo"
            className="text-label-caps font-label-caps text-primary hover:text-tertiary transition-colors"
          >
            ¿Lo creás vos?
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((title) => (
            <TitleCard key={title.id} title={title} />
          ))}
        </div>
      )}
    </main>
  );
}
