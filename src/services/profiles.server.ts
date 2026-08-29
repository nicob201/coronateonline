import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { DethroneNotice, Profile, ProfileReign, PublicProfile, SocialKey } from "@/types";

const SOCIAL_KEYS: SocialKey[] = ["instagram", "tiktok", "youtube", "x", "twitch", "website"];

const AVATAR_BUCKET = "avatars";
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Fields a user may edit on their own profile.
export type ProfileUpdate = Partial<
  Pick<Profile, "username" | "display_name" | "bio" | "avatar_url" | SocialKey>
>;

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
       reigns!reigns_user_id_fkey ( price_paid, started_at, ended_at, message, titles ( name, emoji, slug ) )`,
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
    message: row.message,
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

// Updates the given editable fields on the current user's own profile.
export async function updateOwnProfile(
  supabase: SupabaseServerClient,
  userId: string,
  updates: ProfileUpdate,
) {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Uploads an avatar image under avatars/{userId}/ and returns its public URL.
export async function uploadAvatar(
  supabase: SupabaseServerClient,
  userId: string,
  file: File,
): Promise<string> {
  const ext = EXT_BY_TYPE[file.type] ?? "png";
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) throw error;

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Best-effort delete of an avatar object given its public URL (used for rollback and replacement).
export async function removeAvatarByUrl(
  supabase: SupabaseServerClient,
  url: string,
): Promise<void> {
  const marker = `/${AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;

  const path = url.slice(index + marker.length);
  await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}

// Returns the latest dethrone notice for a user (last 14 days), or null if none.
export async function getLatestDethrone(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<DethroneNotice | null> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data, error } = await supabase
    .from("reigns")
    .select(
      "started_at, message, profiles!reigns_user_id_fkey ( username, display_name ), titles ( name, emoji, slug )",
    )
    .eq("dethroned_user_id", userId)
    .gt("started_at", fourteenDaysAgo)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.titles) return null;

  const byName = data.profiles?.display_name?.trim() || data.profiles?.username || "Anónimo";
  return {
    titleName: data.titles.name,
    titleEmoji: data.titles.emoji,
    titleSlug: data.titles.slug,
    byName,
    message: data.message,
    at: data.started_at,
  };
}
