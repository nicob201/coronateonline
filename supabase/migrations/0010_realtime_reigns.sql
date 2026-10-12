-- 0010_realtime_reigns.sql — D8: broadcast new reigns over Supabase Realtime.
-- Clients listen to INSERT on reigns (one row per dethrone/coronation) and re-render.
-- No new exposure: reigns is already publicly readable (RLS "Reigns are viewable by
-- everyone" + SELECT grant), and Realtime applies that RLS to each subscriber.

ALTER PUBLICATION supabase_realtime ADD TABLE public.reigns;
