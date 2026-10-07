-- supabase/tests/pricing_test.sql
-- Verifies the pricing functions (migration 0004, rescaled to Coronas in 0006).
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
  peak_floor_fraction = 0.25, peak_window_days = 90, activity_floor_unit = 2
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
    VALUES (t_held, u1, 50, now() - interval '1 day');
  p := title_current_price(t_held);
  ASSERT p = 50, format('within grace: expected 50, got %s', p);

  -- Case 2: after grace (held 10 days) -> 50 * 0.993^7 = 47.6, rounded to 48
  UPDATE reigns SET started_at = now() - interval '10 days' WHERE title_id = t_held;
  p := title_current_price(t_held);
  ASSERT p = 48, format('after grace 10d: expected 48, got %s', p);

  -- Case 6: monotonic non-increase -> 40 days held <= 10 days held
  UPDATE reigns SET started_at = now() - interval '40 days' WHERE title_id = t_held;
  ASSERT title_current_price(t_held) <= 48,
    format('monotonic: 40d (%s) must be <= 10d (48)', title_current_price(t_held));

  -- Case 5: unclaimed title -> NULL price, floor == 1
  ASSERT title_current_price(t_none) IS NULL, 'unclaimed: price must be NULL';
  ASSERT title_price_floor(t_none) = 1, 'unclaimed: floor must be 1';

  -- Case 3: floored by 25% of the recent peak.
  --   Past reign at 200 within 90d; current reign old + tiny so decay bottoms out.
  INSERT INTO reigns (title_id, user_id, price_paid, started_at, ended_at)
    VALUES (t_peak, u1, 200, now() - interval '20 days', now() - interval '15 days');
  INSERT INTO reigns (title_id, user_id, price_paid, started_at)
    VALUES (t_peak, u1, 60, now() - interval '300 days');
  f := title_price_floor(t_peak);
  ASSERT f = 50, format('peak floor: expected 25%% of 200 = 50, got %s', f);
  p := title_current_price(t_peak);
  ASSERT p = 50, format('peak-floored price: expected 50, got %s', p);

  -- Case 4: floored by activity. 2 ended reigns (dethrones) in last 30d -> 2 * 2 = 4;
  --   peak within 90d is only 4; active reign old so its decayed value bottoms out
  --   well below the floor, so the activity term dominates the price too.
  INSERT INTO reigns (title_id, user_id, price_paid, started_at, ended_at) VALUES
    (t_act, u1, 3, now() - interval '25 days', now() - interval '20 days'),
    (t_act, u1, 4, now() - interval '18 days', now() - interval '12 days');
  INSERT INTO reigns (title_id, user_id, price_paid, started_at)
    VALUES (t_act, u1, 5, now() - interval '200 days');
  f := title_price_floor(t_act);
  ASSERT f = 4, format('activity floor: expected 2*2 = 4, got %s', f);
  ASSERT title_current_price(t_act) = 4,
    format('activity-floored price: expected 4, got %s', title_current_price(t_act));

  RAISE NOTICE 'pricing_test: all assertions passed';
END $$;

ROLLBACK;
