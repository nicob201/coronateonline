import { formatCoronas, formatReignDuration } from "@/lib/format";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Rankings } from "@/types";
import { displayName, getPriciestTitles } from "./titles.server";

// Fetches the four /rankings tables: priciest crowns, most contested titles, longest reigns and magnates.
export async function getRankings(supabase: SupabaseServerClient): Promise<Rankings> {
  const [priciest, contested, longest, magnates] = await Promise.all([
    getPriciestTitles(supabase, 10),
    supabase.rpc("ranking_most_contested"),
    supabase.rpc("ranking_longest_reigns"),
    supabase.rpc("ranking_magnates"),
  ]);

  if (contested.error) throw contested.error;
  if (longest.error) throw longest.error;
  if (magnates.error) throw magnates.error;

  return {
    priciest: priciest.map((t) => ({
      id: t.id,
      href: `/t/${t.slug}`,
      name: `${t.emoji} ${t.name}`,
      detail: `👑 ${displayName(t.holder)}`,
      detailIsBot: t.holder?.is_bot ?? false,
      value: formatCoronas(t.price ?? 0),
    })),
    contested: contested.data.map((t) => ({
      id: t.title_slug,
      href: `/t/${t.title_slug}`,
      name: `${t.title_emoji} ${t.title_name}`,
      // Generated function types mark the holder as non-null, but a title can lose it when its king deletes the account.
      detail: t.holder_username
        ? `👑 ${displayName({ username: t.holder_username, display_name: t.holder_display_name })}`
        : "Trono vacío",
      detailIsBot: t.holder_is_bot ?? false,
      value: `${t.reign_count}×`,
    })),
    longest: longest.data.map((r) => ({
      id: r.reign_id,
      href: `/${r.holder_username}`,
      name: displayName({ username: r.holder_username, display_name: r.holder_display_name }),
      // Generated function types mark ended_at as non-null, but active reigns return null.
      detail: `${r.title_emoji} ${r.title_name}${r.ended_at === null ? " · en curso" : ""}`,
      detailIsBot: false,
      value: formatReignDuration(r.started_at, r.ended_at),
    })),
    magnates: magnates.data.map((m) => ({
      id: m.username,
      href: `/${m.username}`,
      name: displayName(m),
      detail: `@${m.username}`,
      detailIsBot: false,
      value: formatCoronas(m.balance),
    })),
  };
}
