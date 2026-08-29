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
          className="text-title-md font-title-md font-black text-primary tracking-tighter uppercase"
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

      <div className="flex items-center gap-4">
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
              className="hidden md:block px-4 py-2 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
            >
              Perfil
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="hidden md:block px-4 py-2 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
              >
                Salir
              </button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            className="hidden md:block px-4 py-2 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
          >
            Iniciar sesión
          </Link>
        )}
      </div>
    </nav>
  );
}
