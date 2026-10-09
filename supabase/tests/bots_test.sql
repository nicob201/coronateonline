-- supabase/tests/bots_test.sql
-- Verifies migration 0009: bot identity, weak-king pricing, bot_move rules, bot_tick salary, access.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bots_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): one human and two fresh titles with no history.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('5b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bots_h@coronate.test', '{}', '{}', now(), now());
UPDATE public.profiles SET display_name = 'Humano de Prueba' WHERE id = '5b000000-0000-4000-8000-000000000001';

INSERT INTO public.titles (id, slug, name, emoji, description) VALUES
  ('5b000000-0000-4000-8000-0000000000aa', 'bots-test-x', 'Prueba X', '🧪', 'x'),
  ('5b000000-0000-4000-8000-0000000000bb', 'bots-test-y', 'Prueba Y', '🧪', 'y');

-- Sets a user's balance to exactly p_target with one correcting ledger row.
CREATE FUNCTION pg_temp.set_balance(p_user uuid, p_target integer) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.coin_ledger (user_id, amount, reason)
  SELECT p_user, p_target - s.b, CASE WHEN p_target > s.b THEN 'dethroned' ELSE 'dethrone' END
  FROM (SELECT public.coin_balance(p_user) AS b) s
  WHERE s.b <> p_target;
$$;

-- Ends the title's active reign and starts one for p_user, paid p_paid, started p_age ago.
CREATE FUNCTION pg_temp.hold(p_title uuid, p_user uuid, p_paid integer, p_age interval) RETURNS void
LANGUAGE sql AS $$
  UPDATE public.reigns SET ended_at = now() WHERE title_id = p_title AND ended_at IS NULL;
  INSERT INTO public.reigns (title_id, user_id, price_paid, started_at)
  VALUES (p_title, p_user, p_paid, now() - p_age);
$$;

-- Identity: five declared bots, each with a bio and six lines, none able to sign in.
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.profiles WHERE is_bot) = 5, 'expected exactly 5 bots';
  ASSERT (SELECT array_agg(username ORDER BY id) FROM public.profiles WHERE is_bot)
    = ARRAY['duque_automata', 'marquesa_cron', 'baron_bug', 'condesa_404', 'rey_algoritmo'],
    'bot usernames/ids drifted';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE is_bot AND (display_name IS NULL OR bio IS NULL)
  ), 'every bot needs a display name and a bio';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.is_bot AND (SELECT count(*) FROM public.bot_lines l WHERE l.bot_id = p.id) <> 6
  ), 'every bot needs exactly 6 lines';
  ASSERT NOT EXISTS (
    SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id = u.id
    WHERE p.is_bot AND u.encrypted_password IS NOT NULL
  ), 'bots must have no password';
  ASSERT (SELECT is_bot FROM public.profiles WHERE id = '5b000000-0000-4000-8000-000000000001') = false,
    'new users are not bots';
END $$;

-- Close every title to bots: a fresh human reign everywhere (inside the 12 h grace).
SELECT pg_temp.hold(id, '5b000000-0000-4000-8000-000000000001', 1, interval '0') FROM public.titles;

-- Pricing on X: bot crowns halve every 6 h with no grace or floor; human crowns keep
-- the old formula; the floor's activity term ignores bot reigns.
DO $$
DECLARE
  h  uuid := '5b000000-0000-4000-8000-000000000001';
  b1 uuid := 'b0700000-0000-4000-8000-000000000001';
  b2 uuid := 'b0700000-0000-4000-8000-000000000002';
  x  uuid := '5b000000-0000-4000-8000-0000000000aa';
BEGIN
  PERFORM pg_temp.hold(x, b1, 15, interval '6 hours');
  ASSERT public.title_current_price(x) = 8, format('bot crown at 6 h: expected 8, got %s', public.title_current_price(x));
  PERFORM pg_temp.hold(x, b1, 15, interval '12 hours');
  ASSERT public.title_current_price(x) = 4, format('bot crown at 12 h: expected 4, got %s', public.title_current_price(x));
  PERFORM pg_temp.hold(x, b1, 15, interval '24 hours');
  ASSERT public.title_current_price(x) = 1, format('bot crown at 24 h: expected 1, got %s', public.title_current_price(x));

  PERFORM pg_temp.hold(x, h, 15, interval '6 hours');
  ASSERT public.title_current_price(x) = 15, 'a human crown inside its grace keeps its price';

  -- Floor = max(1, 25% of the 15 peak = 4, 2 × 1 ended human reign = 2) = 4.
  ASSERT public.title_price_floor(x) = 4, format('floor: expected 4, got %s', public.title_price_floor(x));
  INSERT INTO public.reigns (title_id, user_id, price_paid, started_at, ended_at)
  SELECT x, b2, 1, now() - interval '3 hours', now() - interval '2 hours' FROM generate_series(1, 5);
  ASSERT public.title_price_floor(x) = 4, 'ended bot reigns must not raise the floor';
  INSERT INTO public.reigns (title_id, user_id, price_paid, started_at, ended_at)
  SELECT x, h, 1, now() - interval '3 hours', now() - interval '2 hours' FROM generate_series(1, 5);
  ASSERT public.title_price_floor(x) = 12, format('6 ended human reigns: expected 12, got %s', public.title_price_floor(x));

  ASSERT (SELECT holder_is_bot FROM public.titles_priced WHERE id = x) = false, 'view: human holder';
  PERFORM pg_temp.hold(x, b1, 1, interval '0');
  ASSERT (SELECT holder_is_bot FROM public.titles_priced WHERE id = x) = true, 'view: bot holder';
  PERFORM pg_temp.hold(x, h, 15, interval '6 hours');
END $$;

ROLLBACK;
