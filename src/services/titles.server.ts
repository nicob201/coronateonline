import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { BASE_PRICE, type ReignForRanking, rankReignsByDuration, rarity } from "@/lib/titles";
import type {
  Coronation,
  HallOfFameEntry,
  PastReign,
  TitleCard,
  TitleDetail,
  TitleHolder,
} from "@/types";

const coronationsQuery = (supabase: SupabaseServerClient) =>
  supabase
    .from("reigns")
    .select(
      "id, price_paid, started_at, titles ( name, emoji, slug ), profiles!reigns_user_id_fkey ( username, display_name, is_bot ), dethroned:profiles!reigns_dethroned_user_id_fkey ( username, display_name, is_bot )",
    );
type CoronationRow = QueryData<ReturnType<typeof coronationsQuery>>[number];

// Bots play ~12 times a day; the Hall of Fame is for people (filtered in the
// database so bot rows never use up PostgREST's row limit).
const hallOfFameQuery = (supabase: SupabaseServerClient) =>
  supabase
    .from("reigns")
    .select("started_at, profiles!reigns_user_id_fkey!inner ( username, display_name, avatar_url ), titles ( name )")
    .eq("profiles.is_bot", false);
type HallOfFameRow = QueryData<ReturnType<typeof hallOfFameQuery>>[number];

const pricedQuery = (supabase: SupabaseServerClient) =>
  supabase.from("titles_priced").select("*");
type PricedRow = QueryData<ReturnType<typeof pricedQuery>>[number];

const pastReignsQuery = (supabase: SupabaseServerClient, titleId: string) =>
  supabase
    .from("reigns")
    .select("id, price_paid, started_at, ended_at, message, profiles!reigns_user_id_fkey ( username, display_name, is_bot )")
    .eq("title_id", titleId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false });
type PastReignRow = QueryData<ReturnType<typeof pastReignsQuery>>[number];

// Resolves a holder's best display name, or a fallback.
export function displayName(
  profile: Pick<TitleHolder, "username" | "display_name"> | null,
): string {
  return profile?.display_name?.trim() || profile?.username || "Anónimo";
}

// Flattens a titles_priced row into the card shape.
function toTitleCard(row: PricedRow): TitleCard {
  if (
    row.id === null || row.slug === null || row.name === null ||
    row.emoji === null || row.description === null || row.created_at === null
  ) {
    throw new Error("titles_priced row is missing base title columns");
  }

  const holder: TitleHolder | null = row.holder_username
    ? {
        username: row.holder_username,
        display_name: row.holder_display_name,
        avatar_url: row.holder_avatar_url,
        is_bot: row.holder_is_bot ?? false,
      }
    : null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    created_at: row.created_at,
    holder,
    holderUserId: row.holder_user_id,
    price: row.current_price,
    priceFloor: row.price_floor ?? BASE_PRICE,
    reignStartedAt: row.reign_started_at,
    rarity: rarity(row.current_price),
    point: row.lon !== null && row.lat !== null ? [row.lon, row.lat] : null,
  };
}

// Fetches every title with its effective current price and holder, oldest first.
export async function getTitlesWithCurrentReign(
  supabase: SupabaseServerClient,
): Promise<TitleCard[]> {
  const { data, error } = await pricedQuery(supabase).order("created_at", {
    ascending: true,
  });

  if (error) throw error;
  return data.map(toTitleCard);
}

// Fetches the held titles with the highest current price, priciest first.
export async function getPriciestTitles(
  supabase: SupabaseServerClient,
  limit: number,
): Promise<TitleCard[]> {
  const { data, error } = await pricedQuery(supabase)
    .not("current_price", "is", null)
    .order("current_price", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data.map(toTitleCard);
}

// Fetches the 24 province crowns as cards, keyed by province code.
export async function getProvinceCrowns(
  supabase: SupabaseServerClient,
): Promise<Map<string, TitleCard>> {
  const { data, error } = await pricedQuery(supabase).eq("level", "provincia");

  if (error) throw error;

  const crowns = new Map<string, TitleCard>();
  for (const row of data) {
    if (row.province_code !== null) crowns.set(row.province_code, toTitleCard(row));
  }
  return crowns;
}

// Fetches one title by slug with its effective price and full past-reign history.
export async function getTitleBySlug(
  supabase: SupabaseServerClient,
  slug: string,
): Promise<TitleDetail | null> {
  const { data, error } = await pricedQuery(supabase).eq("slug", slug).maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const card = toTitleCard(data);

  const { data: pastRows, error: pastError } = await pastReignsQuery(supabase, card.id);
  if (pastError) throw pastError;

  const rows: PastReignRow[] = pastRows ?? [];
  const pastReigns: PastReign[] = rows.map((r) => ({
    id: r.id,
    holderName: displayName(r.profiles),
    holderIsBot: r.profiles?.is_bot ?? false,
    pricePaid: r.price_paid,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    message: r.message,
  }));

  const closed: ReignForRanking[] = pastReigns.map((r) => ({
    id: r.id,
    holderName: r.holderName,
    holderIsBot: r.holderIsBot,
    pricePaid: r.pricePaid,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
  }));

  const activeReign: ReignForRanking | null =
    data.reign_id && data.holder_paid !== null && data.reign_started_at
      ? {
          id: data.reign_id,
          holderName: card.holder ? displayName(card.holder) : "Anónimo",
          holderIsBot: card.holder?.is_bot ?? false,
          pricePaid: data.holder_paid,
          startedAt: data.reign_started_at,
          endedAt: null,
        }
      : null;

  const allReigns = activeReign ? [...closed, activeReign] : closed;

  const priceHistory = [
    ...[...closed].reverse().map((r) => r.pricePaid),
    ...(activeReign ? [activeReign.pricePaid] : []),
  ];

  return {
    ...card,
    holderName: card.holder ? displayName(card.holder) : null,
    holderPaid: data.holder_paid,
    pastReigns,
    holderMessage: data.holder_message,
    longestReigns: rankReignsByDuration(allReigns, 5),
    priceHistory,
    pricePeak: Math.max(BASE_PRICE, ...priceHistory),
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
      holderIsBot: r.profiles?.is_bot ?? false,
      dethronedName: r.dethroned ? displayName(r.dethroned) : null,
      dethronedIsBot: r.dethroned?.is_bot ?? false,
    }));
}

// Ranks human users by total number of reigns held (all-time), most reigns first.
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
