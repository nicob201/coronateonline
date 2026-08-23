import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Creates a Supabase client for Server Components, Server Actions, and Route Handlers.
export async function createClient() {
  const { cookies } = await import("next/headers");
  const { env } = await import("@/lib/env");

  const cookieStore = await cookies();

  return createSSRServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll is called from a Server Component — ignore cookies write errors
          // (this only happens when middleware has not refreshed the session).
        }
      },
    },
  });
}
