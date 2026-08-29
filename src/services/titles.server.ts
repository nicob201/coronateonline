import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { rarity } from "@/lib/titles";
import type {
  Coronation,
  HallOfFameEntry,
  TitleCard,
  TitleDetail,
  TitleHolder,
} from "@/types";

const TITLE_WITH_REIGNS = `
  id, slug, name, emoji, description, created_at,
  reigns ( id, price_paid, started_at, ended_at,
    profiles ( username, display_name, avatar_url ) )
`;

const titlesQuery = (supabase: SupabaseServerClient) =>
  supabase.from("titles").select(TITLE_WITH_REIGNS);
type TitleRow = QueryData<ReturnType<typeof titlesQuery>>[number];

const coronationsQuery = (supabase: SupabaseServerClient) =>
  supabase
    .from("reigns")
    .select(
      "id, price_paid, started_at, titles ( name, emoji, slug ), profiles ( username, display_name )",
    );
type CoronationRow = QueryData<ReturnType<typeof coronationsQuery>>[number];

const hallOfFameQuery = (supabase: SupabaseServerClient) =>
  supabase
    .from("reigns")
    .select("started_at, profiles ( username, display_name, avatar_url ), titles ( name )");
type HallOfFameRow = QueryData<ReturnType<typeof hallOfFameQuery>>[number];

function displayName(profile: TitleHolder | Pick<TitleHolder, "username" | "display_name"> | null): string {
  return profile?.display_name?.trim() || profile?.username || "Anónimo";
}

// Flattens a title + its reigns into the card shape (current holder/price derived from the active reign).
function toTitleCard(row: TitleRow): TitleCard {
  const active = row.reigns.find((r) => r.ended_at === null) ?? null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    created_at: row.created_at,
    holder: active?.profiles ?? null,
    price: active?.price_paid ?? null,
    reignStartedAt: active?.started_at ?? null,
    rarity: rarity(active?.price_paid ?? null),
  };
}

// Fetches every title with its current holder and price, ordered by creation.
export async function getTitlesWithCurrentReign(
  supabase: SupabaseServerClient,
): Promise<TitleCard[]> {
  const { data, error } = await titlesQuery(supabase)
    .is("reigns.ended_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(toTitleCard);
}

// Fetches one title by slug plus its full reign history (most recent first), or null if not found.
export async function getTitleBySlug(
  supabase: SupabaseServerClient,
  slug: string,
): Promise<TitleDetail | null> {
  const { data, error } = await titlesQuery(supabase).eq("slug", slug).maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const card = toTitleCard(data);
  const pastReigns = data.reigns
    .filter((r) => r.ended_at !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map((r) => ({
      id: r.id,
      holderName: displayName(r.profiles),
      pricePaid: r.price_paid,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    }));

  return {
    ...card,
    holderName: card.holder ? displayName(card.holder) : null,
    pastReigns,
  };
}

// Fetches the latest coronations for the activity ticker.
export async function getRecentCoronations(
  supabase: SupabaseServerClient,
  limit: number,
): Promise<Coronation[]> {
  const { data, error } = await coronationsQuery(supabase)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows: CoronationRow[] = data;
  return rows
    .filter((r): r is CoronationRow & { titles: NonNullable<CoronationRow["titles"]> } =>
      r.titles !== null,
    )
    .map((r) => ({
      id: r.id,
      pricePaid: r.price_paid,
      titleName: r.titles.name,
      titleEmoji: r.titles.emoji,
      titleSlug: r.titles.slug,
      holderName: displayName(r.profiles),
    }));
}

// Ranks users by total number of reigns held (all-time), most reigns first.
export async function getHallOfFame(
  supabase: SupabaseServerClient,
  limit: number,
): Promise<HallOfFameEntry[]> {
  const { data, error } = await hallOfFameQuery(supabase).order("started_at", {
    ascending: false,
  });

  if (error) throw error;

  const rows: HallOfFameRow[] = data;

  // ponytail: in-JS aggregation over all reigns; move to a view/RPC if reign volume grows.
  const byUser = new Map<string, HallOfFameEntry>();
  for (const row of rows) {
    if (!row.profiles) continue;
    const key = row.profiles.username;
    const existing = byUser.get(key);
    if (existing) {
      existing.reignCount += 1;
    } else {
      byUser.set(key, {
        username: row.profiles.username,
        name: displayName(row.profiles),
        avatarUrl: row.profiles.avatar_url,
        reignCount: 1,
        latestTitleName: row.titles?.name ?? "",
      });
    }
  }

  return [...byUser.values()]
    .sort((a, b) => b.reignCount - a.reignCount)
    .slice(0, limit);
}
