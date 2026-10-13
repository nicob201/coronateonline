-- supabase/tests/notifications_test.sql
-- Verifies migration 0011: notification_seen is owner-readable and client-read-only,
-- mark_notifications_seen upserts only the caller's row with server time, access rules.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/notifications_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): a has a row from an hour ago, b has a row from a day ago, c has none.
-- now() is frozen inside a transaction, so "moves forward" is checked against a backdated row.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('ea111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'notif_a@coronate.test', '{}', '{}', now(), now()),
  ('ea222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'notif_b@coronate.test', '{}', '{}', now(), now()),
  ('ea333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'notif_c@coronate.test', '{}', '{}', now(), now());

INSERT INTO public.notification_seen (user_id, seen_at) VALUES
  ('ea111111-1111-4111-8111-111111111111', now() - interval '1 hour'),
  ('ea222222-2222-4222-8222-222222222222', now() - interval '1 day');

-- Act as a.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"ea111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE
  ok boolean;
BEGIN
  ASSERT (SELECT count(*) FROM public.notification_seen) = 1, 'a sees only their own row';
  ASSERT (SELECT user_id FROM public.notification_seen) = 'ea111111-1111-4111-8111-111111111111', 'a sees a''s row, not b''s';

  PERFORM public.mark_notifications_seen();
  ASSERT (SELECT seen_at FROM public.notification_seen) = now(), 'a: seen_at moves to the server time';

  ok := false;
  BEGIN
    INSERT INTO public.notification_seen (user_id, seen_at)
      VALUES ('ea111111-1111-4111-8111-111111111111', now());
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'authenticated must not INSERT directly';

  ok := false;
  BEGIN
    UPDATE public.notification_seen SET seen_at = now() + interval '1 year';
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'authenticated must not UPDATE directly';

  ok := false;
  BEGIN
    DELETE FROM public.notification_seen;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'authenticated must not DELETE directly';
END $$;

-- Act as c, who has no row yet: the call creates exactly their row.
SELECT set_config('request.jwt.claims',
  '{"sub":"ea333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.notification_seen) = 0, 'c starts with no row';
  PERFORM public.mark_notifications_seen();
  ASSERT (SELECT user_id FROM public.notification_seen) = 'ea333333-3333-4333-8333-333333333333', 'c: the row is created for c';
END $$;

-- An authenticated role without a user id is rejected.
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
DO $$
DECLARE
  ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.mark_notifications_seen();
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'Not authenticated';
  END;
  ASSERT ok, 'no auth.uid() must raise Not authenticated';
END $$;

-- Back as postgres: b's row is untouched by a's and c's calls.
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT seen_at FROM public.notification_seen WHERE user_id = 'ea222222-2222-4222-8222-222222222222')
    < now() - interval '23 hours', 'b''s row must not change';
END $$;

-- Anonymous clients can neither read the table nor call the RPC.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE
  ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.mark_notifications_seen();
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'anon must not call mark_notifications_seen';

  ok := false;
  BEGIN
    PERFORM count(*) FROM public.notification_seen;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'anon must not read notification_seen';

  RAISE NOTICE 'notifications_test: all assertions passed';
END $$;

ROLLBACK;
