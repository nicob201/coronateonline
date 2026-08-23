// Fetches the current user's own profile.
export async function getOwnProfile(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
}

// Fetches a profile by username.
export async function getProfileByUsername(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  username: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (error) throw error;
  return data;
}

// Updates the current user's own profile (username + display_name).
export async function updateOwnProfile(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  userId: string,
  updates: { username: string; display_name: string },
) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ username: updates.username, display_name: updates.display_name })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
