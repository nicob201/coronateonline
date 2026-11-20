import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { computeBadges, type BadgeReign } from "@/lib/badges";
import { SOCIAL_KEYS } from "@/lib/socials";
import { REIGN_FETCH_CAP } from "@/lib/titles";
import type { Profile, ProfileReign, PublicProfile, SocialKey } from "@/types";

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

const publicProfileQuery = (supabase: SupabaseServerClient, username: string) =>
  supabase
    .from("profiles")
    .select(
      `username, display_name, avatar_url, bio, is_bot,
       instagram, tiktok, youtube, x, twitch, website,
       reigns!reigns_user_id_fkey ( price_paid, started_at, ended_at, message,
         titles ( name, emoji, slug, level ),
         dethroned:profiles!reigns_dethroned_user_id_fkey ( is_bot ) ),
       times_dethroned:reigns!reigns_dethroned_user_id_fkey ( count )`,
    )
    .eq("username", username)
    // ponytail: badges read the newest REIGN_FETCH_CAP reigns; an exact count over a longer history needs a SQL aggregate.
    .order("started_at", { ascending: false, referencedTable: "reigns" })
    .limit(REIGN_FETCH_CAP, { referencedTable: "reigns" })
    .maybeSingle();
type PublicProfileRow = QueryData<ReturnType<typeof publicProfileQuery>>;
type ProfileReignRow = NonNullable<PublicProfileRow>["reigns"][number];

// Reduces a joined reign row to the fields the badge rules need.
function toBadgeReign(row: ProfileReignRow): BadgeReign {
  return {
    titleSlug: row.titles?.slug ?? "",
    pricePaid: row.price_paid,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    isProvince: row.titles?.level === "provincia",
    dethroned: row.dethroned === null ? "none" : row.dethroned.is_bot ? "bot" : "human",
  };
}

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
    isBot: data.is_bot,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    socials,
    currentReigns: reigns.filter((r) => r.endedAt === null),
    pastReigns: reigns
      .filter((r) => r.endedAt !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    badges: computeBadges(
      data.reigns.map(toBadgeReign),
      data.times_dethroned[0]?.count ?? 0,
      Date.now(),
    ),
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
