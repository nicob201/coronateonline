-- supabase/tests/salary_test.sql
-- Verifies migration 0008: salary amounts, streak, one claim per day, access.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/salary_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): u never claimed, v claimed the last 2 days, w skipped
-- yesterday, x claimed the last 8 days. Past claims are backdated ledger rows.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('5a111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'salary_u@coronate.test', '{}', '{}', now(), now()),
  ('5a222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'salary_v@coronate.test', '{}', '{}', now(), now()),
  ('5a333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'salary_w@coronate.test', '{}', '{}', now(), now()),
  ('5a444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'salary_x@coronate.test', '{}', '{}', now(), now());
-- Fixture users finished onboarding; the extra one (no display name) did not.
UPDATE public.profiles SET display_name = 'Fixture ' || left(id::text, 8)
WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'salary\_%@coronate.test');
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('5a555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'salary_unnamed@coronate.test', '{}', '{}', now(), now());

INSERT INTO public.coin_ledger (user_id, amount, reason, created_at)
SELECT '5a222222-2222-4222-8222-222222222222'::uuid, 5, 'salary', now() - make_interval(days => d)
FROM generate_series(1, 2) d
UNION ALL
SELECT '5a333333-3333-4333-8333-333333333333'::uuid, 5, 'salary', now() - make_interval(days => d)
FROM generate_series(2, 3) d
UNION ALL
SELECT '5a444444-4444-4444-8444-444444444444'::uuid, 5, 'salary', now() - make_interval(days => d)
FROM generate_series(1, 8) d;

DO $$
DECLARE
  ok boolean;
BEGIN
  ASSERT public.ar_date('2026-10-09 02:59:59+00') = '2026-10-08', 'before 00:00 ART is the previous day';
  ASSERT public.ar_date('2026-10-09 03:00:00+00') = '2026-10-09', 'the salary day turns over at 00:00 ART';

  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason)
      VALUES ('5a111111-1111-4111-8111-111111111111', -5, 'salary');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'a negative salary must be rejected';
END $$;

-- Act as an authenticated client; each block below picks its user.
SET LOCAL ROLE authenticated;

-- u: first ever claim pays 5, then the day is closed.
SELECT set_config('request.jwt.claims',
  '{"sub":"5a111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE
  s  record;
  ok boolean;
BEGIN
  SELECT * INTO s FROM public.salary_status();
  ASSERT (s.claimed_today, s.streak, s.next_amount) = (false, 0, 5),
    format('u before: expected (f,0,5), got %s', s);

  ASSERT public.claim_salary() = 5, 'u: the first claim pays 5';
  ASSERT public.coin_balance('5a111111-1111-4111-8111-111111111111') = 25, 'u: 20 welcome + 5 salary';

  SELECT * INTO s FROM public.salary_status();
  ASSERT (s.claimed_today, s.streak, s.next_amount) = (true, 1, 6),
    format('u after: expected (t,1,6), got %s', s);

  ok := false;
  BEGIN
    PERFORM public.claim_salary();
  EXCEPTION WHEN OTHERS THEN ok := SQLSTATE = 'CT201' AND SQLERRM = 'Salary already claimed today';
  END;
  ASSERT ok, 'u: a second claim the same day must be rejected';
END $$;

-- v: a 2-day streak continues — the claim pays 7 and the streak reaches 3.
SELECT set_config('request.jwt.claims',
  '{"sub":"5a222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
DO $$
DECLARE
  s record;
BEGIN
  SELECT * INTO s FROM public.salary_status();
  ASSERT (s.claimed_today, s.streak, s.next_amount) = (false, 2, 7),
    format('v before: expected (f,2,7), got %s', s);
  ASSERT public.claim_salary() = 7, 'v: day 3 pays 7';
  SELECT * INTO s FROM public.salary_status();
  ASSERT (s.claimed_today, s.streak, s.next_amount) = (true, 3, 8),
    format('v after: expected (t,3,8), got %s', s);
END $$;

-- w: skipping yesterday resets the streak.
SELECT set_config('request.jwt.claims',
  '{"sub":"5a333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
DO $$
DECLARE
  s record;
BEGIN
  SELECT * INTO s FROM public.salary_status();
  ASSERT (s.claimed_today, s.streak, s.next_amount) = (false, 0, 5),
    format('w: expected (f,0,5), got %s', s);
END $$;

-- x: an 8-day streak pays the 11 cap.
SELECT set_config('request.jwt.claims',
  '{"sub":"5a444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
DO $$
DECLARE
  s record;
BEGIN
  SELECT * INTO s FROM public.salary_status();
  ASSERT (s.claimed_today, s.streak, s.next_amount) = (false, 8, 11),
    format('x: expected (f,8,11), got %s', s);
END $$;

-- Anonymous clients cannot read or claim a salary.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE
  ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_salary();
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'anon must not claim a salary';

  RAISE NOTICE 'salary_test: all assertions passed';
END $$;

-- A profile without a display name is rejected before anything else happens.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"5a555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.claim_salary();
  EXCEPTION WHEN SQLSTATE 'CT002' THEN ok := SQLERRM = 'Profile incomplete'; END;
  ASSERT ok, 'a profile without a display name must be rejected';
END $$;

ROLLBACK;
