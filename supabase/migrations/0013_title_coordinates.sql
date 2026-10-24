-- ============================================================================
-- 0013_title_coordinates.sql — D13 crown pins on /mapa
--   titles_priced appends lon/lat of a geographic title (NULL for plain titles),
--   so the app never has to decode the PostGIS column.
-- ============================================================================

CREATE OR REPLACE VIEW public.titles_priced
WITH (security_invoker = true) AS
SELECT
  t.id, t.slug, t.name, t.emoji, t.description, t.created_at,
  public.title_current_price(t.id) AS current_price,
  public.title_price_floor(t.id)   AS price_floor,
  r.id          AS reign_id,
  r.user_id     AS holder_user_id,
  r.price_paid  AS holder_paid,
  r.started_at  AS reign_started_at,
  p.username     AS holder_username,
  p.display_name AS holder_display_name,
  p.avatar_url   AS holder_avatar_url,
  r.message      AS holder_message,
  p.is_bot       AS holder_is_bot,
  t.level,
  t.province_code,
  extensions.st_x(t.location::extensions.geometry) AS lon,
  extensions.st_y(t.location::extensions.geometry) AS lat
FROM public.titles t
LEFT JOIN public.reigns   r ON r.title_id = t.id AND r.ended_at IS NULL
LEFT JOIN public.profiles p ON p.id = r.user_id;
