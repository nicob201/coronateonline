import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";

// Fetches the authenticated user's profile and renders the site header.
export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <SiteHeader />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  return <SiteHeader username={profile?.username ?? null} />;
}
