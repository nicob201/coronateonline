-- supabase/tests/geo_titles_test.sql
-- Verifies migration 0012: 24 province crowns, the geo CHECK / one-crown index,
-- province_leaderboard ranking (active + ended reigns across a province's titles), anon access.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/geo_titles_test.sql
-- Everything runs in one transaction and ROLLBACKs; needs the local seed (rey-de-cordoba, rey-de-la-pizza).

BEGIN;

-- Fixtures (as postgres): Mendoza ('50') gets a city title. now() is frozen inside a transaction,
-- so the active reign is exactly 3 days long.
--   a on the Mendoza crown: 10 days, ended   b on the city: 3 days, active   a on the city: 30 days, ended
-- a also holds a closed 100-day reign on a non-geographic title, which must never show up.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('ec111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'geo_a@coronate.test', '{}', '{}', now(), now()),
  ('ec222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'geo_b@coronate.test', '{}', '{}', now(), now());

INSERT INTO public.titles (slug, name, emoji, description, level, province_code, location)
VALUES ('geo-test-ciudad', 'Rey de la Ciudad de Prueba', '🏙️', 'Fixture.', 'ciudad', '50',
        extensions.st_setsrid(extensions.st_makepoint(-68.8, -32.9), 4326)::extensions.geography);

INSERT INTO public.reigns (title_id, user_id, price_paid, started_at, ended_at) VALUES
  ((SELECT id FROM public.titles WHERE slug = 'rey-de-mendoza'),  'ec111111-1111-4111-8111-111111111111', 1, now() - interval '13 days', now() - interval '3 days'),
  ((SELECT id FROM public.titles WHERE slug = 'geo-test-ciudad'), 'ec222222-2222-4222-8222-222222222222', 1, now() - interval '3 days',  NULL),
  ((SELECT id FROM public.titles WHERE slug = 'geo-test-ciudad'), 'ec111111-1111-4111-8111-111111111111', 1, now() - interval '40 days', now() - interval '10 days'),
  ((SELECT id FROM public.titles WHERE slug = 'rey-de-la-pizza'), 'ec111111-1111-4111-8111-111111111111', 1, now() - interval '120 days', now() - interval '20 days');

DO $$
DECLARE
  ok boolean;
  v_rows record;
BEGIN
  -- Catalogue: 24 provinces, 24 crowns, one per province.
  ASSERT (SELECT count(*) FROM public.provinces) = 24, 'there are 24 provinces';
  ASSERT (SELECT count(*) FROM public.titles WHERE level = 'provincia') = 24, 'there are 24 province crowns';
  ASSERT (SELECT count(DISTINCT province_code) FROM public.titles WHERE level = 'provincia') = 24, 'one crown per province';
  ASSERT EXISTS (
    SELECT 1 FROM public.titles
    WHERE slug = 'rey-de-cordoba' AND level = 'provincia' AND province_code = '14' AND location IS NOT NULL
  ), 'rey-de-cordoba is Córdoba''s crown (survives the seed)';
  ASSERT (SELECT count(*) FROM public.titles WHERE slug = 'rey-de-la-pizza' AND level IS NULL) = 1, 'non-geographic titles stay untouched';

  -- Leaderboard for Mendoza: 30 d (city, ended), 10 d (crown, ended), 3 d (city, active).
  ASSERT (SELECT count(*) FROM public.province_leaderboard(10) WHERE province_code = '50') = 3, 'Mendoza has 3 ranked reigns';
  ASSERT (SELECT array_agg(title_slug ORDER BY rank) FROM public.province_leaderboard(10) WHERE province_code = '50')
    = ARRAY['geo-test-ciudad', 'rey-de-mendoza', 'geo-test-ciudad'], 'ranked by duration across the province''s titles';
  ASSERT (SELECT array_agg(rank ORDER BY rank) FROM public.province_leaderboard(10) WHERE province_code = '50')
    = ARRAY[1, 2, 3]::bigint[], 'ranks are 1..3';
  SELECT * INTO v_rows FROM public.province_leaderboard(10) WHERE province_code = '50' AND rank = 3;
  ASSERT v_rows.ended_at IS NULL, 'the 3-day reign is the active one';
  ASSERT v_rows.holder_username IS NOT NULL, 'holder username is returned';

  -- Limit and exclusions.
  ASSERT (SELECT count(*) FROM public.province_leaderboard(2) WHERE province_code = '50') = 2, 'the limit applies per province';
  ASSERT NOT EXISTS (SELECT 1 FROM public.province_leaderboard(10) WHERE title_slug = 'rey-de-la-pizza'),
    'reigns on non-geographic titles never appear';

  -- Titles view exposes the new columns.
  ASSERT (SELECT province_code FROM public.titles_priced WHERE slug = 'rey-de-cordoba') = '14', 'titles_priced exposes province_code';
  ASSERT (SELECT level FROM public.titles_priced WHERE slug = 'rey-de-cordoba') = 'provincia', 'titles_priced exposes level';
  ASSERT (SELECT round(lon::numeric, 3) FROM public.titles_priced WHERE slug = 'rey-de-cordoba') = -63.562, 'titles_priced exposes lon';
  ASSERT (SELECT round(lat::numeric, 3) FROM public.titles_priced WHERE slug = 'rey-de-cordoba') = -32.104, 'titles_priced exposes lat';
  ASSERT (SELECT lon FROM public.titles_priced WHERE slug = 'rey-de-la-pizza') IS NULL, 'plain titles have no lon';

  -- Geo CHECK: level without a location is rejected.
  ok := false;
  BEGIN
    INSERT INTO public.titles (slug, name, emoji, description, level, province_code)
    VALUES ('geo-test-sin-lugar', 'Sin lugar', '❓', 'Fixture.', 'ciudad', '50');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'level without location must raise check_violation';

  -- One crown per province.
  ok := false;
  BEGIN
    INSERT INTO public.titles (slug, name, emoji, description, level, province_code, location)
    VALUES ('geo-test-segunda-corona', 'Segunda corona', '👑', 'Fixture.', 'provincia', '50',
            extensions.st_setsrid(extensions.st_makepoint(-68.8, -32.9), 4326)::extensions.geography);
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  ASSERT ok, 'a second province crown must raise unique_violation';
END $$;

-- Anonymous clients can read the catalogue and the leaderboard, but not write.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE
  ok boolean := false;
BEGIN
  ASSERT (SELECT count(*) FROM public.provinces) = 24, 'anon reads provinces';
  ASSERT (SELECT count(*) FROM public.province_leaderboard() WHERE province_code = '50') = 3, 'anon calls province_leaderboard';

  BEGIN
    INSERT INTO public.provinces (code, slug, name) VALUES ('99', 'nowhere', 'Nowhere');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'anon must not INSERT into provinces';

  RAISE NOTICE 'geo_titles_test: all assertions passed';
END $$;

ROLLBACK;
