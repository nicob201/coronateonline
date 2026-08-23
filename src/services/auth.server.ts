import type { SupabaseServerClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/services/profiles.server";

// Post-login redirect: checks if user needs onboarding then returns the destination path.
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
