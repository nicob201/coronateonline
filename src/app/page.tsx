import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getHallOfFame,
  getRecentCoronations,
  getTitlesWithCurrentReign,
} from "@/services/titles.server";
import { CoronationTicker } from "@/components/coronation-ticker";
import { LiveRefresh } from "@/components/live-refresh";
import { LiveFlash } from "@/components/live-flash";
import { HallOfFame } from "@/components/hall-of-fame";
import { TrendingTitle } from "@/components/trending-title";
import { GuestLoginButton } from "@/features/auth/components/guest-login-button";

// Landing: activity ticker, hero, trending titles (top by current price), Hall of Fame.
export default async function Home() {
  const supabase = await createClient();
  const [coronations, titles, hallOfFame, { data: { user } }] = await Promise.all([
    getRecentCoronations(supabase, 6),
    getTitlesWithCurrentReign(supabase),
    getHallOfFame(supabase, 5),
    supabase.auth.getUser(),
  ]);

  const trending = titles
    .filter((t) => t.price !== null)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    .slice(0, 3);

  return (
    <>
      <LiveRefresh />
      <LiveFlash value={coronations[0]?.id ?? null} className="block">
        <CoronationTicker coronations={coronations} />
      </LiveFlash>

      <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-16 pb-32">
        <section className="flex flex-col items-center justify-center text-center py-16 md:py-20 relative">
          <div className="relative mb-8 flex items-center justify-center w-56 h-56 md:w-72 md:h-72">
            <div className="absolute inset-0 bg-tertiary blur-[100px] opacity-20 rounded-full" />
            <span
              aria-hidden="true"
              className="relative select-none text-[8rem] md:text-[11rem] leading-none crown-float"
            >
              👑
            </span>
          </div>
          <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface mb-6 uppercase tracking-tighter">
            {"¿QUÉ "}
            <span className="text-gradient-primary block sm:inline">
              {"QUERÉS SER?"}
            </span>
          </h1>
          <p className="text-body-lg font-body-lg text-on-surface-variant max-w-2xl mb-12">
            Elegí tu título. Coronate. Hacete conocido. El under digital donde el
            estatus se paga y se defiende.
          </p>
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <Link
              href="/titulos"
              className="block w-full text-center btn-gradient px-8 py-4 rounded-xl text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest"
            >
              👑 VER TÍTULOS
            </Link>
            {user ? null : <GuestLoginButton />}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
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
              trending.map((title) => (
                <TrendingTitle key={title.id} title={title} />
              ))
            ) : (
              <p className="text-body-sm font-body-sm text-on-surface-variant glass-panel rounded-2xl p-6">
                Todavía nadie se coronó.{" "}
                <Link href="/titulos" className="text-primary hover:underline">
                  Sé el primero.
                </Link>
              </p>
            )}
          </section>

          <aside className="lg:col-span-4 lg:sticky lg:top-28 lg:self-start">
            <HallOfFame entries={hallOfFame} />
          </aside>
        </div>
      </main>
    </>
  );
}
