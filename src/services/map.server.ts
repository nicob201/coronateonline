import { formatReignDuration } from "@/lib/format";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { ProvinceReign, ProvinceSummary } from "@/types";
import { displayName, getProvinceCrowns } from "./titles.server";

const LEADERBOARD_SIZE = 10;

// Builds one summary per province: its crown plus its longest reigns across every title in it.
export async function getProvinceSummaries(
  supabase: SupabaseServerClient,
): Promise<ProvinceSummary[]> {
  const [provinces, crowns, leaderboard] = await Promise.all([
    supabase.from("provinces").select("code, slug, name"),
    getProvinceCrowns(supabase),
    supabase.rpc("province_leaderboard", { p_limit: LEADERBOARD_SIZE }),
  ]);

  if (provinces.error) throw provinces.error;
  if (leaderboard.error) throw leaderboard.error;

  // The rpc comes back ordered by province then rank, so pushing keeps rank order.
  const reignsByProvince = new Map<string, ProvinceReign[]>();
  for (const row of leaderboard.data) {
    const reigns = reignsByProvince.get(row.province_code) ?? [];
    reigns.push({
      id: row.reign_id,
      holderName: displayName({
        username: row.holder_username,
        display_name: row.holder_display_name,
      }),
      holderIsBot: row.holder_is_bot,
      titleName: row.title_name,
      titleEmoji: row.title_emoji,
      titleSlug: row.title_slug,
      durationLabel: formatReignDuration(row.started_at, row.ended_at),
      // Generated function types mark ended_at as non-null, but active reigns return null.
      isActive: row.ended_at === null,
    });
    reignsByProvince.set(row.province_code, reigns);
  }

  return provinces.data
    .map((p) => ({
      code: p.code,
      slug: p.slug,
      name: p.name,
      crown: crowns.get(p.code) ?? null,
      reigns: reignsByProvince.get(p.code) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
