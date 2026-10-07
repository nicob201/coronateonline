import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { guestIdentity } from "@/lib/auth";
import { getOwnProfile, updateOwnProfile } from "@/services/profiles.server";

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

// Starts an anonymous session with a random courtly name; the display name skips onboarding.
export async function signInAsGuest(supabase: SupabaseServerClient): Promise<void> {
  const { username, displayName } = guestIdentity();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { username } },
  });

  if (error) throw error;
  if (!data.user) throw new Error("Anonymous sign-in returned no user");

  await updateOwnProfile(supabase, data.user.id, { display_name: displayName });
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
