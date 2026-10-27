-- ============================================================================
-- 0014_rankings.sql — D16 /rankings, top 10 each
--   1. ranking_longest_reigns: people's longest reigns, active ones measured to now()
--   2. ranking_most_contested: titles by how many reigns (coronations) they have had, with their current king
--   3. ranking_magnates: people by Coronas balance — SECURITY DEFINER because
--      coin_ledger is owner-only; only the top 10 balances become public, by design
--   Bots are left out of the people rankings, like the Hall of Fame.
--   The priciest crowns are a plain titles_priced query. Additive.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ranking_longest_reigns()
RETURNS TABLE (
  reign_id            uuid,
  title_slug          text,
  title_name          text,
  title_emoji         text,
  holder_username     text,
  holder_display_name text,
  started_at          timestamptz,
  ended_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT r.id, t.slug, t.name, t.emoji, p.username, p.display_name, r.started_at, r.ended_at
  FROM public.reigns r
  JOIN public.titles t ON t.id = r.title_id
  JOIN public.profiles p ON p.id = r.user_id
  WHERE NOT p.is_bot
  ORDER BY coalesce(r.ended_at, now()) - r.started_at DESC, r.started_at
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.ranking_most_contested()
RETURNS TABLE (
  title_slug          text,
  title_name          text,
  title_emoji         text,
  reign_count         int,
  holder_username     text,
  holder_display_name text,
  holder_is_bot       boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT t.slug, t.name, t.emoji, count(*)::int, p.username, p.display_name, p.is_bot
  FROM public.titles t
  JOIN public.reigns r ON r.title_id = t.id
  LEFT JOIN public.reigns cur ON cur.title_id = t.id AND cur.ended_at IS NULL
  LEFT JOIN public.profiles p ON p.id = cur.user_id
  GROUP BY t.id, p.id
  ORDER BY count(*) DESC, t.created_at
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.ranking_magnates()
RETURNS TABLE (
  username     text,
  display_name text,
  balance      int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.username, p.display_name, sum(l.amount)::int
  FROM public.profiles p
  JOIN public.coin_ledger l ON l.user_id = p.id
  WHERE NOT p.is_bot
  GROUP BY p.id
  ORDER BY sum(l.amount) DESC, p.username
  LIMIT 10;
$$;
