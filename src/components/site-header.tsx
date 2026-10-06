import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/services/profiles.server";
import { signOut } from "@/actions/auth";

// Fetches the authenticated user's profile and renders the site header.
export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const profile = await getOwnProfile(supabase, user.id);
    username = profile?.username ?? null;
  }

  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-4 md:px-16 py-1 h-20 bg-surface/70 backdrop-blur-xl border-b border-outline-variant/30 shadow-md">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="text-body-lg md:text-title-md font-title-md font-black text-primary tracking-tighter uppercase"
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
      </ul>

      {/* Below md actions collapse to icons (aria-label keeps the name); md:hidden! because unlayered Material Symbols CSS beats Tailwind layers. */}
      <div className="flex items-center gap-1 md:gap-4">
        <Link
          href="/titulos"
          aria-label="Explorar"
          className="md:hidden p-2 text-on-surface-variant hover:text-primary transition-colors"
        >
          <span aria-hidden="true" className="material-symbols-outlined">explore</span>
        </Link>
        {username ? (
          <>
            <Link
              href={`/@${username}`}
              className="hidden md:block px-4 py-2 text-label-caps font-label-caps text-primary hover:text-primary-fixed transition-colors"
            >
              @{username}
            </Link>
            <Link
              href="/perfil"
              aria-label="Perfil"
              className="p-2 md:px-4 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined md:hidden!">person</span>
              <span className="hidden md:inline">Perfil</span>
            </Link>
            <form action={signOut} className="flex">
              <button
                type="submit"
                aria-label="Salir"
                className="p-2 md:px-4 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
              >
                <span aria-hidden="true" className="material-symbols-outlined md:hidden!">logout</span>
                <span className="hidden md:inline">Salir</span>
              </button>
            </form>
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
