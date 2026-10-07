-- supabase/tests/coronas_test.sql
-- Verifies migration 0006: welcome grant, one-welcome rule, balance + RLS.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/coronas_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): two users through the real signup trigger chain + one held title.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'coronas_u@coronate.test', '{}', '{}', now(), now()),
  ('c2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'coronas_v@coronate.test', '{}', '{}', now(), now());

DO $$
DECLARE
  u  uuid := 'c1111111-1111-4111-8111-111111111111';
  ok boolean;
BEGIN
  ASSERT public.coin_balance(u) = 20,
    format('welcome: expected 20, got %s', public.coin_balance(u));
  ASSERT public.coin_balance(gen_random_uuid()) = 0, 'no ledger rows: balance must be 0';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.coin_ledger l WHERE l.user_id = p.id AND l.reason = 'welcome'
    )
  ), 'every profile must have its welcome grant';

  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason) VALUES (u, 20, 'welcome');
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  ASSERT ok, 'a second welcome grant must be rejected';

  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason) VALUES (u, 0, 'welcome');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'a zero-amount movement must be rejected';
END $$;

-- Act as u: an authenticated client.
SELECT set_config('request.jwt.claims',
  '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  ok boolean;
BEGIN
  ASSERT public.coin_balance('c1111111-1111-4111-8111-111111111111') = 20,
    'owner must see their own balance';
  ASSERT public.coin_balance('c2222222-2222-4222-8222-222222222222') = 0,
    'RLS: another user''s balance must read as 0';

  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason)
      VALUES ('c1111111-1111-4111-8111-111111111111', 5, 'welcome');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'clients must not write the ledger';

  RAISE NOTICE 'coronas_test: all assertions passed';
END $$;

ROLLBACK;
