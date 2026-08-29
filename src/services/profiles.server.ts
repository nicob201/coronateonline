import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileReign, PublicProfile, SocialKey } from "@/types";

const SOCIAL_KEYS: SocialKey[] = ["instagram", "tiktok", "youtube", "x", "twitch", "website"];

// Fetches the current user's own profile, or null if none exists.
export async function getOwnProfile(
  supabase: SupabaseServerClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Fetches a profile by username.
export async function getProfileByUsername(
  supabase: SupabaseServerClient,
  username: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  return data;
}

const publicProfileQuery = (supabase: SupabaseServerClient, username: string) =>
  supabase
    .from("profiles")
    .select(
      `username, display_name, avatar_url, bio,
       instagram, tiktok, youtube, x, twitch, website,
       reigns ( price_paid, started_at, ended_at, titles ( name, emoji, slug ) )`,
    )
    .eq("username", username)
    .maybeSingle();
type PublicProfileRow = QueryData<ReturnType<typeof publicProfileQuery>>;
type ProfileReignRow = NonNullable<PublicProfileRow>["reigns"][number];

// Flattens a joined reign row into the public profile shape.
function toProfileReign(row: ProfileReignRow): ProfileReign {
  return {
    titleName: row.titles?.name ?? "",
    titleEmoji: row.titles?.emoji ?? "👑",
    titleSlug: row.titles?.slug ?? "",
    pricePaid: row.price_paid,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

// Fetches a public profile by username with its reign history, or null if not found.
export async function getPublicProfile(
  supabase: SupabaseServerClient,
  username: string,
): Promise<PublicProfile | null> {
  const { data, error } = await publicProfileQuery(supabase, username);

  if (error) throw error;
  if (!data) return null;

  const reigns = data.reigns.map(toProfileReign);
  const socials: Partial<Record<SocialKey, string>> = {};
  for (const key of SOCIAL_KEYS) {
    const value = data[key]?.trim();
    if (value) socials[key] = value;
  }

  return {
    username: data.username,
    displayName: data.display_name?.trim() || data.username,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    socials,
    currentReigns: reigns.filter((r) => r.endedAt === null),
    pastReigns: reigns
      .filter((r) => r.endedAt !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  };
}

// Updates the current user's own profile (username + display_name).
export async function updateOwnProfile(
  supabase: SupabaseServerClient,
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
