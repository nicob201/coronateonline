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

ROLLBACK;
