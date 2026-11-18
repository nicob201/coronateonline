import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/services/profiles.server";
import { getBalance, getSalaryStatus } from "@/services/wallet.server";
import { getNotifications } from "@/services/notifications.server";
import { NotificationBell } from "@/components/notification-bell";
import { LiveRefresh } from "@/components/live-refresh";
import { AnimatedCoronas } from "@/components/animated-coronas";
import { formatCoronas } from "@/lib/format";
import { SignOutButton } from "@/components/sign-out-button";
import type { Notifications } from "@/types";

// Fetches the authenticated user's profile and renders the site header.
export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let balance: number | null = null;
  let salaryReady = false;
  let notifications: Notifications | null = null;
  if (user) {
    // A failed balance, salary or notifications read hides the chip, its dot or the bell instead of breaking every page.
    const [profile, coins, salary, inbox] = await Promise.all([
      getOwnProfile(supabase, user.id),
      getBalance(supabase, user.id).catch(() => null),
      getSalaryStatus(supabase).catch(() => null),
      getNotifications(supabase, user.id).catch(() => null),
    ]);
    username = profile?.username ?? null;
    balance = coins;
    salaryReady = salary !== null && !salary.claimed_today;
    notifications = inbox;
  }

  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center gap-3 px-4 md:px-16 py-1 h-20 bg-surface/70 backdrop-blur-xl border-b border-outline-variant/30 shadow-md">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="text-base sm:text-body-lg md:text-title-md font-title-md font-black text-primary tracking-tighter uppercase"
        >
          CoronaTeOnline
        </Link>
      </div>

      <ul className="hidden md:flex items-center gap-8">
        <li>
          <Link
            href="/titulos"
            className="text-primary font-bold border-b-2 border-primary pb-1 scale-95 active:scale-90 transition-transform"
          >
            Explorar
          </Link>
        </li>
        <li>
          <Link
            href="/mapa"
            className="text-on-surface-variant font-bold pb-1 hover:text-primary transition-colors"
          >
            Mapa
          </Link>
        </li>
        <li>
          <Link
            href="/rankings"
            className="text-on-surface-variant font-bold pb-1 hover:text-primary transition-colors"
          >
            Rankings
          </Link>
        </li>
      </ul>

      {/* Below md actions collapse to icons (aria-label keeps the name); md:hidden! because unlayered Material Symbols CSS beats Tailwind layers. */}
      <div className="flex items-center gap-1 md:gap-4">
        <Link
          href="/titulos"
          aria-label="Explorar"
          className={`${username ? "hidden" : "md:hidden"} p-2 text-on-surface-variant hover:text-primary transition-colors`}
        >
          <span aria-hidden="true" className="material-symbols-outlined">explore</span>
        </Link>
        {username ? (
          <>
            {balance !== null && (
              <Link
                href="/perfil"
                aria-label={`Saldo: ${formatCoronas(balance)}${salaryReady ? ". Sueldo disponible" : ""}`}
                className="relative px-2 sm:px-3 py-1 rounded-full border border-tertiary/40 text-label-caps font-label-caps text-tertiary hover:bg-tertiary/10 transition-colors whitespace-nowrap"
              >
                <AnimatedCoronas value={balance} />
                {salaryReady && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-tertiary motion-safe:animate-pulse"
                  />
                )}
              </Link>
            )}
            {user && <LiveRefresh filter={`dethroned_user_id=eq.${user.id}`} />}
            {notifications !== null && <NotificationBell initialData={notifications} />}
            <Link
              href={`/@${username}`}
              className="hidden md:block px-4 py-2 text-label-caps font-label-caps text-primary hover:text-primary-fixed transition-colors"
            >
              @{username}
            </Link>
            {/* Below md the balance chip already links to /perfil; showing both overflows a 360px header. */}
            <Link
              href="/perfil"
              aria-label="Perfil"
              className={`${balance !== null ? "hidden md:block" : ""} p-2 md:px-4 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors`}
            >
              <span aria-hidden="true" className="material-symbols-outlined md:hidden!">person</span>
              <span className="hidden md:inline">Perfil</span>
            </Link>
            <SignOutButton isGuest={user?.is_anonymous ?? false} />
          </>
        ) : (
          <Link
            href="/login"
            aria-label="Iniciar sesión"
            className="p-2 md:px-4 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined md:hidden!">login</span>
            <span className="hidden md:inline">Iniciar sesión</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
