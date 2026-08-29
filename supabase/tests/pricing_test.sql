-- supabase/tests/pricing_test.sql
-- Verifies the pricing functions from migration 0004.
-- Run (local stack):  npx supabase db execute --file supabase/tests/pricing_test.sql
--     (any Postgres):  psql "$SUPABASE_DB_URL" -f supabase/tests/pricing_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- session_replication_role = replica bypasses FK/triggers so we can seed a
-- profile + reigns without an auth.users row. Requires table-owner / superuser
-- (true for `supabase db execute` and the local `postgres` role).
SET LOCAL session_replication_role = replica;

-- Pin config so assertions are deterministic regardless of the live row.
UPDATE pricing_config SET
  decay_rate_daily = 0.007, grace_days = 3,
  peak_floor_fraction = 0.25, peak_window_days = 90, activity_floor_unit = 2000
WHERE id = 1;

DO $$
DECLARE
  u1     uuid := gen_random_uuid();
  t_held uuid := gen_random_uuid();
  t_none uuid := gen_random_uuid();
  t_peak uuid := gen_random_uuid();
  t_act  uuid := gen_random_uuid();
  p integer;
  f integer;
BEGIN
  INSERT INTO profiles (id, username)
    VALUES (u1, 'decaytest_' || substr(u1::text, 1, 8));

  INSERT INTO titles (id, slug, name, emoji, description) VALUES
    (t_held, 'dt-held-' || substr(t_held::text, 1, 8), 'H', '👑', 'x'),
    (t_none, 'dt-none-' || substr(t_none::text, 1, 8), 'N', '👑', 'x'),
    (t_peak, 'dt-peak-' || substr(t_peak::text, 1, 8), 'P', '👑', 'x'),
    (t_act,  'dt-act-'  || substr(t_act::text,  1, 8), 'A', '👑', 'x');

  -- Case 1: within grace (held 1 day) -> price == price_paid
  INSERT INTO reigns (title_id, user_id, price_paid, started_at)
    VALUES (t_held, u1, 50000, now() - interval '1 day');
  p := title_current_price(t_held);
  ASSERT p = 50000, format('within grace: expected 50000, got %s', p);

  -- Case 2: after grace (held 10 days) -> 50000 * 0.993^7, rounded to nearest 1000
  UPDATE reigns SET started_at = now() - interval '10 days' WHERE title_id = t_held;
  p := title_current_price(t_held);
  ASSERT p = 48000, format('after grace 10d: expected 48000, got %s', p);

  -- Case 6: monotonic non-increase -> 40 days held <= 10 days held
  UPDATE reigns SET started_at = now() - interval '40 days' WHERE title_id = t_held;
  ASSERT title_current_price(t_held) <= 48000,
    format('monotonic: 40d (%s) must be <= 10d (48000)', title_current_price(t_held));

  -- Case 5: unclaimed title -> NULL price, floor == 1000
  ASSERT title_current_price(t_none) IS NULL, 'unclaimed: price must be NULL';
  ASSERT title_price_floor(t_none) = 1000, 'unclaimed: floor must be 1000';

  -- Case 3: floored by 25% of the recent peak.
  --   Past reign at 200000 within 90d; current reign old + tiny so decay bottoms out.
  INSERT INTO reigns (title_id, user_id, price_paid, started_at, ended_at)
    VALUES (t_peak, u1, 200000, now() - interval '20 days', now() - interval '15 days');
  INSERT INTO reigns (title_id, user_id, price_paid, started_at)
    VALUES (t_peak, u1, 60000, now() - interval '300 days');
  f := title_price_floor(t_peak);
  ASSERT f = 50000, format('peak floor: expected 25%% of 200000 = 50000, got %s', f);
  p := title_current_price(t_peak);
  ASSERT p = 50000, format('peak-floored price: expected 50000, got %s', p);

  -- Case 4: floored by activity. 3 reigns started in last 30d -> 2000 * 3 = 6000;
  --   peak within 90d is only 5000 so the activity term dominates.
  INSERT INTO reigns (title_id, user_id, price_paid, started_at, ended_at) VALUES
    (t_act, u1, 3000, now() - interval '25 days', now() - interval '20 days'),
    (t_act, u1, 4000, now() - interval '18 days', now() - interval '12 days');
  INSERT INTO reigns (title_id, user_id, price_paid, started_at)
    VALUES (t_act, u1, 5000, now() - interval '5 days');
  f := title_price_floor(t_act);
  ASSERT f = 6000, format('activity floor: expected 2000*3 = 6000, got %s', f);

  RAISE NOTICE 'pricing_test: all assertions passed';
END $$;

ROLLBACK;
