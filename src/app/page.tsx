import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getHallOfFame,
  getRecentCoronations,
  getTitlesWithCurrentReign,
} from "@/services/titles.server";
import { CoronationTicker } from "@/components/coronation-ticker";
import { HallOfFame } from "@/components/hall-of-fame";
import { TitleCard } from "@/components/title-card";

// Landing: activity ticker, hero, trending titles (top by current price), Hall of Fame.
export default async function Home() {
  const supabase = await createClient();
  const [coronations, titles, hallOfFame] = await Promise.all([
    getRecentCoronations(supabase, 6),
    getTitlesWithCurrentReign(supabase),
    getHallOfFame(supabase, 5),
  ]);

  const trending = titles
    .filter((t) => t.price !== null)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    .slice(0, 4);

  return (
    <>
      <CoronationTicker coronations={coronations} />

      <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-16 pb-32">
        <section className="flex flex-col items-center justify-center text-center py-20 relative">
          <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface mb-6 uppercase tracking-tighter">
            {"¿QUÉ "}
            <span className="text-gradient-primary">{"QUERÉS SER?"}</span>
          </h1>
          <p className="text-body-lg font-body-lg text-on-surface-variant max-w-2xl mb-12">
            Elegí tu título. Coronate. Hacete conocido. El under digital donde el
            estatus se paga y se defiende.
          </p>
          <Link
            href="/titulos"
            className="btn-gradient px-8 py-4 rounded-xl text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest flex items-center justify-center gap-2"
          >
            VER TÍTULOS
          </Link>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <section className="lg:col-span-8 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-title-md font-title-md text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">
                  local_fire_department
                </span>
                TÍTULOS EN TENDENCIA
              </h2>
              <Link
                href="/titulos"
                className="text-label-caps font-label-caps text-primary hover:underline"
              >
                Ver todos
              </Link>
            </div>

            {trending.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {trending.map((title) => (
                  <TitleCard key={title.id} title={title} />
                ))}
              </div>
            ) : (
              <p className="text-body-sm font-body-sm text-on-surface-variant glass-panel rounded-2xl p-6">
                Todavía nadie se coronó.{" "}
                <Link href="/titulos" className="text-primary hover:underline">
                  Sé el primero.
                </Link>
              </p>
            )}
          </section>

          <aside className="lg:col-span-4">
            <HallOfFame entries={hallOfFame} />
          </aside>
        </div>
      </main>
    </>
  );
}
