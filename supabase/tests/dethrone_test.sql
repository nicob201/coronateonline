-- supabase/tests/dethrone_test.sql
-- Verifies migration 0007: dethrone_with_coins (zero-sum transfer, burn on unclaimed titles,
-- rejections, exact-balance boundary) and that deleting an account keeps other balances intact.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dethrone_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): holder h and challenger c through the real signup trigger chain
-- (20 👑 each); t_held held by h at 10 (inside grace -> current 10, minimum 11); two free titles.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'dethrone_h@coronate.test', '{}', '{}', now(), now()),
  ('d2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'dethrone_c@coronate.test', '{}', '{}', now(), now()),
  ('d6666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'dethrone_n@coronate.test', '{}', '{}', now(), now());
-- h and c finished onboarding; n (no display name) did not.
UPDATE public.profiles SET display_name = 'Dethrone Titular' WHERE id = 'd1111111-1111-4111-8111-111111111111';
UPDATE public.profiles SET display_name = 'Dethrone Retador' WHERE id = 'd2222222-2222-4222-8222-222222222222';

INSERT INTO titles (id, slug, name, emoji, description) VALUES
  ('d3333333-3333-4333-8333-333333333333', 'dethrone-held',  'H',  '👑', 'x'),
  ('d4444444-4444-4444-8444-444444444444', 'dethrone-free',  'F',  '👑', 'x'),
  ('d5555555-5555-4555-8555-555555555555', 'dethrone-free2', 'F2', '👑', 'x');

INSERT INTO reigns (title_id, user_id, price_paid, started_at)
  VALUES ('d3333333-3333-4333-8333-333333333333', 'd1111111-1111-4111-8111-111111111111', 10, now());

-- No caller: anon has no EXECUTE, and a session without a sub is rejected by the function itself.
SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.dethrone_with_coins('d4444444-4444-4444-8444-444444444444', 1);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'anon must not execute dethrone_with_coins';
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.dethrone_with_coins('d4444444-4444-4444-8444-444444444444', 1);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Not authenticated'; END;
  ASSERT ok, 'a session without a sub must be rejected as not authenticated';
END $$;
RESET ROLE;

-- A profile without a display name cannot dethrone, even with coins and a valid price.
SELECT set_config('request.jwt.claims',
  '{"sub":"d6666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.dethrone_with_coins('d4444444-4444-4444-8444-444444444444', 1);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Profile incomplete'; END;
  ASSERT ok, 'a profile without a display name must be rejected';
END $$;
RESET ROLE;

-- Act as the challenger c.
SELECT set_config('request.jwt.claims',
  '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  c      uuid := 'd2222222-2222-4222-8222-222222222222';
  h      uuid := 'd1111111-1111-4111-8111-111111111111';
  t_held uuid := 'd3333333-3333-4333-8333-333333333333';
  t_free uuid := 'd4444444-4444-4444-8444-444444444444';
  t_fr2  uuid := 'd5555555-5555-4555-8555-555555555555';
  r      public.reigns;
  ok     boolean;
BEGIN
  -- Rejections: nothing may move.
  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 10);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Amount must be at least 11'; END;
  ASSERT ok, 'paying the current price (10) must be rejected with minimum 11';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 21);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Insufficient balance'; END;
  ASSERT ok, 'paying more than the balance (21 > 20) must be rejected';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 11, repeat('a', 81));
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Message too long'; END;
  ASSERT ok, 'an 81-char message must be rejected';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 0);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Amount must be positive'; END;
  ASSERT ok, 'a zero amount must be rejected';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(gen_random_uuid(), 5);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Title not found'; END;
  ASSERT ok, 'an unknown title must be rejected';

  ASSERT public.coin_balance(c) = 20, 'rejections must not move coins';

  -- Held title: the crown moves, the message is trimmed, the challenger pays.
  r := public.dethrone_with_coins(t_held, 12, '  Llegó el nuevo rey  ');
  ASSERT r.user_id = c AND r.price_paid = 12 AND r.dethroned_user_id = h,
    format('new reign wrong: %s', r);
  ASSERT r.message = 'Llegó el nuevo rey', format('message must be trimmed, got %L', r.message);
  ASSERT public.coin_balance(c) = 8,
    format('challenger: expected 20 - 12 = 8, got %s', public.coin_balance(c));
  ASSERT (SELECT count(*) FROM public.reigns WHERE title_id = t_held AND ended_at IS NULL) = 1,
    'exactly one active reign';
  ASSERT (SELECT user_id FROM public.reigns WHERE title_id = t_held AND ended_at IS NULL) = c,
    'the crown must belong to the challenger';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 13);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'You already hold this title'; END;
  ASSERT ok, 'dethroning yourself must be rejected';

  -- Unclaimed title, whitespace-only message -> NULL; only the debit (burn).
  r := public.dethrone_with_coins(t_free, 1, '   ');
  ASSERT r.dethroned_user_id IS NULL, 'unclaimed: no dethroned user';
  ASSERT r.message IS NULL, format('whitespace-only message must be NULL, got %L', r.message);
  ASSERT public.coin_balance(c) = 7,
    format('challenger: expected 8 - 1 = 7, got %s', public.coin_balance(c));

  -- Exact balance: paying all 7 succeeds and leaves 0; tabs/newlines-only message -> NULL.
  r := public.dethrone_with_coins(t_fr2, 7, E'\t\n ');
  ASSERT public.coin_balance(c) = 0,
    format('exact balance: expected 0, got %s', public.coin_balance(c));
  ASSERT r.message IS NULL, format('tab/newline-only message must be NULL, got %L', r.message);

  -- Clients still cannot write the ledger directly.
  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason) VALUES (c, 100, 'dethroned');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'clients must not write the ledger';
END $$;

RESET ROLE;

DO $$
DECLARE
  c      uuid := 'd2222222-2222-4222-8222-222222222222';
  h      uuid := 'd1111111-1111-4111-8111-111111111111';
  t_held uuid := 'd3333333-3333-4333-8333-333333333333';
  t_free uuid := 'd4444444-4444-4444-8444-444444444444';
BEGIN
  -- Zero-sum: the dethroned holder got exactly what the challenger paid.
  ASSERT public.coin_balance(h) = 32,
    format('holder: expected 20 + 12 = 32, got %s', public.coin_balance(h));
  ASSERT (SELECT sum(l.amount) FROM public.coin_ledger l
          JOIN public.reigns r ON r.id = l.reign_id
          WHERE r.title_id = t_held AND r.ended_at IS NULL) = 0,
    'a held-title dethrone must net to zero across both ledger rows';

  -- Burn: the unclaimed title produced exactly one ledger row (the debit).
  ASSERT (SELECT count(*) FROM public.coin_ledger l
          JOIN public.reigns r ON r.id = l.reign_id
          WHERE r.title_id = t_free) = 1,
    'an unclaimed-title claim must only debit';

  -- Deleting the challenger's account cascades to their reigns; the holder's
  -- 'dethroned' credit survives with reign_id NULL and the balance is unchanged.
  DELETE FROM auth.users WHERE id = c;
  ASSERT public.coin_balance(h) = 32,
    format('after deleting the challenger, holder balance must stay 32, got %s', public.coin_balance(h));
  ASSERT EXISTS (SELECT 1 FROM public.coin_ledger
                 WHERE user_id = h AND reason = 'dethroned' AND reign_id IS NULL),
    'the dethroned credit must survive with reign_id set to NULL';

  RAISE NOTICE 'dethrone_test: all assertions passed';
END $$;

ROLLBACK;
