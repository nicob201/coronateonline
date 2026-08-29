import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/services/profiles.server";

// Returns the authenticated user, or redirects to /login if there is no session.
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

// Returns the authenticated user plus a completed profile, redirecting to onboarding if incomplete.
export async function requireOnboardedUser() {
  const { supabase, user } = await requireUser();
  const profile = await getOwnProfile(supabase, user.id);

  if (!profile?.display_name) {
    redirect("/onboarding");
  }

  return { supabase, user, profile };
}

// Returns the authenticated user, or redirects with a generic 404 if they are not an admin.
export async function requireAdmin() {
  const { supabase, user } = await requireUser();
  const profile = await getOwnProfile(supabase, user.id);

  if (!profile?.is_admin) {
    // Fail securely: do not reveal that /admin exists.
    notFound();
  }

  return { supabase, user, profile };
}

// Post-login redirect: sends the user to onboarding if the profile is incomplete, else to `next`.
export async function getPostLoginRedirectPath(
  supabase: SupabaseServerClient,
  next: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return "/login?error=no_session";
  }

  const profile = await getOwnProfile(supabase, user.id);

  if (!profile?.display_name) {
    return "/onboarding";
  }

  return next;
}
