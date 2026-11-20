-- supabase/tests/rankings_test.sql
-- Verifies migrations 0014 and 0021: the ranking functions (incl. the hall of fame) order correctly, leave bots out
-- of the people rankings, stop at 10 rows and are callable by anon.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rankings_test.sql
-- Everything runs in one transaction and ROLLBACKs; fixtures are big enough to top any seed data.

BEGIN;

-- Fixtures (as postgres): person a and bot b (each gets the 20 👑 welcome grant from the profile trigger).
--   a: a 900-day ended reign and +100000 👑      b (bot): a 2000-day active reign and +500000 👑
--   "rank-test-disputada" gets 40 reigns, more than any seeded title.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('ed111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'rank_a@coronate.test', '{}', '{}', now(), now()),
  ('ed222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'rank_b@coronate.test', '{}', '{}', now(), now());
UPDATE public.profiles SET username = 'rank_a' WHERE id = 'ed111111-1111-4111-8111-111111111111';
UPDATE public.profiles SET username = 'rank_b', is_bot = true WHERE id = 'ed222222-2222-4222-8222-222222222222';

INSERT INTO public.titles (slug, name, emoji, description) VALUES
  ('rank-test-larga', 'Reinado Largo', '⏳', 'Fixture.'),
  ('rank-test-bot', 'Trono del Bot', '🤖', 'Fixture.'),
  ('rank-test-disputada', 'Corona Disputada', '⚔️', 'Fixture.');

INSERT INTO public.reigns (title_id, user_id, price_paid, started_at, ended_at) VALUES
  ((SELECT id FROM public.titles WHERE slug = 'rank-test-larga'), 'ed111111-1111-4111-8111-111111111111', 1, now() - interval '1000 days', now() - interval '100 days'),
  ((SELECT id FROM public.titles WHERE slug = 'rank-test-bot'),   'ed222222-2222-4222-8222-222222222222', 1, now() - interval '2000 days', NULL);
INSERT INTO public.reigns (title_id, user_id, price_paid, started_at, ended_at)
SELECT (SELECT id FROM public.titles WHERE slug = 'rank-test-disputada'), 'ed111111-1111-4111-8111-111111111111', i,
       now() - (41 - i) * interval '1 hour', CASE WHEN i < 40 THEN now() - (40 - i) * interval '1 hour' END
FROM generate_series(1, 40) AS i;

INSERT INTO public.coin_ledger (user_id, amount, reason) VALUES
  ('ed111111-1111-4111-8111-111111111111', 100000, 'dethroned'),
  ('ed222222-2222-4222-8222-222222222222', 500000, 'dethroned');

-- Anonymous visitors read every ranking.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
BEGIN
  ASSERT (SELECT title_slug FROM public.ranking_longest_reigns() LIMIT 1) = 'rank-test-larga',
    'the 900-day reign tops the longest reigns';
  ASSERT NOT EXISTS (SELECT 1 FROM public.ranking_longest_reigns() WHERE holder_username = 'rank_b'),
    'bot reigns are left out';
  ASSERT (SELECT count(*) FROM public.ranking_longest_reigns()) <= 10, 'longest reigns stop at 10';

  ASSERT (SELECT row(title_slug, reign_count, holder_username) FROM public.ranking_most_contested() LIMIT 1)
    = row('rank-test-disputada'::text, 40, 'rank_a'::text),
    'the 40-reign title tops the most contested, with its current king';
  ASSERT (SELECT count(*) FROM public.ranking_most_contested()) <= 10, 'most contested stops at 10';

  ASSERT (SELECT row(username, balance) FROM public.ranking_magnates() LIMIT 1) = row('rank_a'::text, 100020),
    'the richest person tops the magnates with welcome grant + credit';
  ASSERT NOT EXISTS (SELECT 1 FROM public.ranking_magnates() WHERE username = 'rank_b'), 'bots are not magnates';
  ASSERT (SELECT count(*) FROM public.ranking_magnates()) <= 10, 'magnates stop at 10';

  ASSERT (SELECT row(username, reign_count, latest_title_name) FROM public.ranking_hall_of_fame() LIMIT 1)
    = row('rank_a'::text, 41, 'Corona Disputada'::text),
    'the person with most reigns tops the hall of fame, with their latest title';
  ASSERT NOT EXISTS (SELECT 1 FROM public.ranking_hall_of_fame(100) WHERE username = 'rank_b'),
    'bots are not in the hall of fame';
  ASSERT (SELECT count(*) FROM public.ranking_hall_of_fame(1)) = 1, 'the limit argument is honoured';

  RAISE NOTICE 'rankings_test: all assertions passed';
END $$;

ROLLBACK;
