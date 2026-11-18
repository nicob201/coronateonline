import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { DethroneNotice, Notifications } from "@/types";

const WINDOW_DAYS = 14;
const LIMIT = 10;

const dethronesQuery = (supabase: SupabaseServerClient, userId: string, since: string) =>
  supabase
    .from("reigns")
    .select(
      "id, started_at, price_paid, message, profiles!reigns_user_id_fkey ( username, display_name, is_bot ), titles ( name, emoji, slug )",
    )
    .eq("dethroned_user_id", userId)
    .gt("started_at", since)
    .order("started_at", { ascending: false })
    .limit(LIMIT);
type DethroneRow = QueryData<ReturnType<typeof dethronesQuery>>[number];

// Flattens joined reigns into notices; a row without its title join is dropped.
function toNotices(rows: DethroneRow[]): DethroneNotice[] {
  return rows.flatMap((row) => {
    if (!row.titles) return [];
    return [
      {
        id: row.id,
        titleName: row.titles.name,
        titleEmoji: row.titles.emoji,
        titleSlug: row.titles.slug,
        byName: row.profiles?.display_name?.trim() || row.profiles?.username || "Anónimo",
        byBot: row.profiles?.is_bot ?? false,
        pricePaid: row.price_paid,
        message: row.message,
        at: row.started_at,
      },
    ];
  });
}

// Returns the user's dethrones of the last 14 days (newest first, max 10) and how many are newer than their last bell opening.
export async function getNotifications(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Notifications> {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const [reigns, seen] = await Promise.all([
    dethronesQuery(supabase, userId, since),
    supabase.from("notification_seen").select("seen_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (reigns.error) throw reigns.error;
  if (seen.error) throw seen.error;

  const items = toNotices(reigns.data);
  // ponytail: Date.parse is millisecond precision; a reign inside the same ms as seen_at reads as seen. Compare in SQL if that ever matters.
  const seenAt = seen.data ? Date.parse(seen.data.seen_at) : null;
  const unread =
    seenAt === null ? items.length : items.filter((item) => Date.parse(item.at) > seenAt).length;
  return { items, unread };
}

// Records that the signed-in user has opened their bell (server time, set by the RPC).
export async function markNotificationsSeen(supabase: SupabaseServerClient): Promise<void> {
  const { error } = await supabase.rpc("mark_notifications_seen");
  if (error) throw error;
}
