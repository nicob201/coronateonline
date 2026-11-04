-- supabase/tests/reactions_test.sql
-- Verifies migration 0017: react_to_reign rules (active reign, not your own, 10 per minute),
-- public totals, owner-only rows, the Realtime broadcast, access rules.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reactions_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): h holds the active reign, a and b throw. b has 10 throws from
-- 2 minutes ago (on the ended reign) that must not count against the limit.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('fa111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'react_h@coronate.test', '{}', '{}', now(), now()),
  ('fa222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'react_a@coronate.test', '{}', '{}', now(), now()),
  ('fa333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'react_b@coronate.test', '{}', '{}', now(), now());

INSERT INTO titles (id, slug, name, emoji, description) VALUES
  ('fb000000-0000-4000-8000-000000000000', 'reactions-test', 'Rey del Tomate', '🍅', 'x');

INSERT INTO reigns (id, title_id, user_id, price_paid, started_at, ended_at) VALUES
  ('fc111111-1111-4111-8111-111111111111', 'fb000000-0000-4000-8000-000000000000',
   'fa333333-3333-4333-8333-333333333333', 1, now() - interval '1 day', now() - interval '1 hour'),
  ('fc222222-2222-4222-8222-222222222222', 'fb000000-0000-4000-8000-000000000000',
   'fa111111-1111-4111-8111-111111111111', 2, now() - interval '1 hour', NULL);

INSERT INTO reign_reactions (reign_id, user_id, kind, created_at)
SELECT 'fc111111-1111-4111-8111-111111111111', 'fa333333-3333-4333-8333-333333333333', 'tomato',
       now() - interval '2 minutes'
FROM generate_series(1, 10);

-- Anon sees totals but can neither throw nor read rows.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE
  c  record;
  ok boolean := false;
BEGIN
  SELECT * INTO c FROM public.reign_reaction_counts('fc111111-1111-4111-8111-111111111111');
  ASSERT (c.tomatoes, c.applause) = (10, 0), format('anon totals of the ended reign: got %s', c);

  BEGIN PERFORM public.react_to_reign('fc222222-2222-4222-8222-222222222222', 'tomato');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'anon must not call react_to_reign';

  ok := false;
  BEGIN PERFORM count(*) FROM public.reign_reactions;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'anon must not read reign_reactions';
END $$;
RESET ROLE;

-- h cannot react to their own reign.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"fa111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.react_to_reign('fc222222-2222-4222-8222-222222222222', 'applause');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Own reign'; END;
  ASSERT ok, 'h must not react to their own reign';
END $$;

-- a: bad input, ended or unknown reigns, then 10 throws and the 11th is rate limited.
SELECT set_config('request.jwt.claims', '{"sub":"fa222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
DO $$
DECLARE
  active uuid := 'fc222222-2222-4222-8222-222222222222';
  c      record;
  ok     boolean;
BEGIN
  ok := false;
  BEGIN PERFORM public.react_to_reign(active, 'egg');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Invalid reaction'; END;
  ASSERT ok, 'an unknown kind must be rejected';

  ok := false;
  BEGIN PERFORM public.react_to_reign('fc111111-1111-4111-8111-111111111111', 'tomato');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Reign not active'; END;
  ASSERT ok, 'an ended reign must be rejected';

  ok := false;
  BEGIN PERFORM public.react_to_reign(gen_random_uuid(), 'tomato');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Reign not active'; END;
  ASSERT ok, 'an unknown reign must be rejected';

  FOR i IN 1..7 LOOP
    SELECT * INTO c FROM public.react_to_reign(active, 'tomato');
  END LOOP;
  FOR i IN 1..3 LOOP
    SELECT * INTO c FROM public.react_to_reign(active, 'applause');
  END LOOP;
  ASSERT (c.tomatoes, c.applause) = (7, 3), format('a: totals after 10 throws, got %s', c);

  ok := false;
  BEGIN PERFORM public.react_to_reign(active, 'tomato');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Rate limited'; END;
  ASSERT ok, 'a: the 11th throw within a minute must be rate limited';

  ASSERT (SELECT count(*) FROM public.reign_reactions) = 10, 'a sees only their own 10 rows';

  ok := false;
  BEGIN
    INSERT INTO public.reign_reactions (reign_id, user_id, kind)
      VALUES (active, 'fa222222-2222-4222-8222-222222222222', 'tomato');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'authenticated must not INSERT directly';
END $$;

-- b: 10 throws from 2 minutes ago do not count, so b can still throw.
SELECT set_config('request.jwt.claims', '{"sub":"fa333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.react_to_reign('fc222222-2222-4222-8222-222222222222', 'tomato');
  ASSERT (c.tomatoes, c.applause) = (8, 3), format('b: totals after b''s throw, got %s', c);
END $$;
RESET ROLE;

-- Every throw was broadcast on the reign's private topic; the last one carries the final totals.
DO $$
DECLARE m record;
BEGIN
  ASSERT (SELECT count(*) FROM realtime.messages
          WHERE topic = 'reign:fc222222-2222-4222-8222-222222222222') = 11,
    'each of the 11 throws must be broadcast';

  SELECT * INTO m FROM realtime.messages
  WHERE topic = 'reign:fc222222-2222-4222-8222-222222222222'
  ORDER BY inserted_at DESC, (payload->>'tomatoes')::int DESC
  LIMIT 1;
  ASSERT m.event = 'reaction' AND m.private AND m.extension = 'broadcast', format('broadcast shape, got %s', m);
  ASSERT (m.payload->>'kind', (m.payload->>'tomatoes')::int, (m.payload->>'applause')::int) = ('tomato', 8, 3),
    format('broadcast payload, got %s', m.payload);

  RAISE NOTICE 'reactions_test: all assertions passed';
END $$;

ROLLBACK;
