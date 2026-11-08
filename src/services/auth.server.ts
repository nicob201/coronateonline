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

// Returns the signed-in admin (profiles.is_admin, read from the database); anyone else gets a 404 so the page never leaks.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await getOwnProfile(supabase, user.id) : null;

  if (!profile?.is_admin) {
    notFound();
  }

  return { supabase };
}

// Gives a new guest its courtly display name, which skips onboarding; a guest that already has one keeps it.
export async function nameGuest(
  supabase: SupabaseServerClient,
  userId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId)
    .is("display_name", null);

  if (error) throw error;
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
