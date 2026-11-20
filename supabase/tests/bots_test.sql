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
  PERFORM pg_temp.hold(x, b1, 15, interval '400 days');
  ASSERT public.title_current_price(x) = 1, 'a long-held bot crown bottoms at 1 (no power() underflow)';

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

-- bot_move on Y, the only title open to bots. Cases run in order on one title.
DO $$
DECLARE
  h        uuid := '5b000000-0000-4000-8000-000000000001';
  y        uuid := '5b000000-0000-4000-8000-0000000000bb';
  r        public.reigns;
  expected integer;
  h_before integer;
  bot      uuid;
BEGIN
  PERFORM pg_temp.set_balance(id, 50) FROM public.profiles WHERE is_bot;

  -- (a) a human crown younger than 12 h is closed to bots
  PERFORM pg_temp.hold(y, h, 5, interval '11 hours');
  ASSERT public.bot_move() IS NULL, '(a) human crown inside the 12 h grace must be skipped';

  -- (b) a human crown priced above the cap is closed to bots
  PERFORM pg_temp.hold(y, h, 20, interval '13 hours');
  ASSERT public.bot_move() IS NULL, '(b) min bid above 15 must be skipped';

  -- (c) no bot can afford the minimum
  PERFORM pg_temp.hold(y, h, 5, interval '13 hours');
  expected := public.title_current_price(y) + 1;
  PERFORM pg_temp.set_balance(id, expected - 1) FROM public.profiles WHERE is_bot;
  ASSERT public.bot_move() IS NULL, '(c) unaffordable title must be skipped';

  -- (d) an eligible human crown: a bot pays exactly price + 1, zero-sum, with a message
  PERFORM pg_temp.set_balance(id, 50) FROM public.profiles WHERE is_bot;
  h_before := public.coin_balance(h);
  r := public.bot_move();
  ASSERT r.title_id = y, '(d) the bot must take Y';
  ASSERT (SELECT is_bot FROM public.profiles WHERE id = r.user_id), '(d) the new holder is a bot';
  ASSERT r.price_paid = expected, format('(d) expected bid %s, got %s', expected, r.price_paid);
  ASSERT r.dethroned_user_id = h, '(d) the human is the dethroned holder';
  ASSERT public.coin_balance(h) = h_before + expected, '(d) the human is paid the full bid';
  ASSERT public.coin_balance(r.user_id) = 50 - expected, '(d) the bot pays the bid';
  ASSERT r.message IS NOT NULL AND char_length(r.message) <= 80 AND position('{victim}' IN r.message) = 0,
    format('(d) bad message: %s', r.message);
  bot := r.user_id;

  -- (e) a bot never plays its own title, even when it is the only one that can pay
  PERFORM pg_temp.set_balance(id, 1) FROM public.profiles WHERE is_bot AND id <> bot;
  PERFORM pg_temp.set_balance(bot, 50);
  ASSERT public.bot_move() IS NULL, '(e) a bot must not dethrone itself';

  -- (f) an unclaimed title is claimed for 1 👑 (burned) with a victim-less line
  UPDATE public.reigns SET ended_at = now() WHERE title_id = y AND ended_at IS NULL;
  PERFORM pg_temp.set_balance(id, 50) FROM public.profiles WHERE is_bot;
  r := public.bot_move();
  ASSERT r.title_id = y AND r.price_paid = 1 AND r.dethroned_user_id IS NULL, '(f) claim Y for 1';
  ASSERT public.coin_balance(r.user_id) = 49, '(f) the claim burns 1 👑';
  ASSERT r.message IS NOT NULL AND position('{victim}' IN r.message) = 0, format('(f) bad message: %s', r.message);

  -- (g) a very long victim name still yields a message within 80 chars
  UPDATE public.profiles SET display_name = left('Humano con un nombre larguísimo para probar los mensajes de los bots', 50)
  WHERE id = h;
  PERFORM pg_temp.hold(y, h, 5, interval '13 hours');
  PERFORM pg_temp.set_balance(id, 50) FROM public.profiles WHERE is_bot;
  r := public.bot_move();
  ASSERT r.title_id = y AND r.dethroned_user_id = h, '(g) the bot must take Y';
  ASSERT r.message IS NOT NULL AND char_length(r.message) <= 80, format('(g) bad message: %s', r.message);
END $$;

-- bot_tick: every bot ends up with today's salary (a random move may also happen).
DO $$
BEGIN
  PERFORM public.bot_tick();
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.is_bot AND NOT EXISTS (
      SELECT 1 FROM public.coin_ledger l
      WHERE l.user_id = p.id AND l.reason = 'salary'
        AND public.ar_date(l.created_at) = public.ar_date(now())
    )
  ), 'bot_tick must claim every bot''s salary';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bot-tick' AND schedule = '*/20 * * * *'),
    'the bot-tick cron job must be scheduled';
END $$;

-- bot_tick swallows only lost races (the game's CT error codes); any other error must fail the run.
CREATE TEMP SEQUENCE bot_move_calls;
DO $$
DECLARE
  ok boolean := false;
BEGIN
  PERFORM setseed(0.15);
  CREATE OR REPLACE FUNCTION public.bot_move() RETURNS public.reigns LANGUAGE plpgsql AS $f$
  BEGIN
    PERFORM nextval('pg_temp.bot_move_calls');
    RAISE EXCEPTION 'Amount must be at least 99' USING ERRCODE = 'CT105';
  END $f$;
  FOR i IN 1..30 LOOP
    PERFORM public.bot_tick();
  END LOOP;
  ASSERT (SELECT is_called FROM pg_temp.bot_move_calls), 'the lost-race stub must have run at least once';

  CREATE OR REPLACE FUNCTION public.bot_move() RETURNS public.reigns LANGUAGE plpgsql AS $f$
  BEGIN
    PERFORM 1 / 0;
    RETURN NULL;
  END $f$;
  FOR i IN 1..30 LOOP
    BEGIN
      PERFORM public.bot_tick();
    EXCEPTION WHEN division_by_zero THEN
      ok := true;
    END;
    EXIT WHEN ok;
  END LOOP;
  ASSERT ok, 'bot_tick must not hide a broken bot_move';
END $$;

-- Clients cannot run the bots, mark themselves as bots, or read the lines.
SELECT set_config('request.jwt.claims',
  '{"sub":"5b000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  ok boolean;
BEGIN
  ok := false;
  BEGIN PERFORM public.bot_move(); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'clients must not run bot_move';

  ok := false;
  BEGIN PERFORM public.bot_tick(); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'clients must not run bot_tick';

  ok := false;
  BEGIN
    UPDATE public.profiles SET is_bot = true WHERE id = '5b000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'clients must not set is_bot';

  ok := false;
  BEGIN PERFORM 1 FROM public.bot_lines; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'bot_lines must be private';

  RAISE NOTICE 'bots_test: all assertions passed';
END $$;

ROLLBACK;
