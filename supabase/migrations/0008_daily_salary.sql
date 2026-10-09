-- ============================================================================
-- 0008_daily_salary.sql — daily salary with streak
--   1. coin_ledger: 'salary' reason, one salary per user per Argentine day
--   2. salary_status — the caller's streak and next amount, derived from the ledger
--   3. claim_salary — credits today's salary
-- ============================================================================

-- Calendar date in Argentina: the salary day turns over at midnight there.
CREATE OR REPLACE FUNCTION public.ar_date(p_at timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (p_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;

-- ---------------------------------------------------------------------------
-- 1. LEDGER — salary is a credit, so the sign rule (only 'dethrone' is
--    negative) already covers it.
-- ---------------------------------------------------------------------------
ALTER TABLE coin_ledger DROP CONSTRAINT coin_ledger_reason_check;
ALTER TABLE coin_ledger
  ADD CONSTRAINT coin_ledger_reason_check
    CHECK (reason IN ('welcome', 'dethrone', 'dethroned', 'salary'));

-- One salary per user per day, enforced by the database (races included).
CREATE UNIQUE INDEX IF NOT EXISTS coin_ledger_one_salary_per_day
  ON coin_ledger (user_id, public.ar_date(created_at))
  WHERE reason = 'salary';

-- ---------------------------------------------------------------------------
-- 2. salary_status — streak = consecutive days claimed, ending today or
--    yesterday (0 once a day is skipped). The next claim pays 5 👑 on day 1,
--    +1 per streak day, capped at 11 from day 7.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salary_status()
RETURNS TABLE (claimed_today boolean, streak integer, next_amount integer)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_today date := public.ar_date(now());
  v_last  date;
BEGIN
  SELECT max(public.ar_date(l.created_at)) INTO v_last
  FROM public.coin_ledger l
  WHERE l.user_id = auth.uid() AND l.reason = 'salary';

  claimed_today := v_last IS NOT DISTINCT FROM v_today;
  streak := 0;

  IF v_last >= v_today - 1 THEN
    -- Along a run of consecutive days, day + rank (newest first) is constant.
    SELECT count(*) INTO streak
    FROM (
      SELECT public.ar_date(l.created_at)
             + row_number() OVER (ORDER BY l.created_at DESC)::integer AS run
      FROM public.coin_ledger l
      WHERE l.user_id = auth.uid() AND l.reason = 'salary'
    ) r
    WHERE r.run = v_last + 1;
  END IF;

  next_amount := 4 + LEAST(streak + 1, 7);
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.salary_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.salary_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. claim_salary — credits the caller's next_amount. A second claim the same
--    day (concurrent ones too) hits the unique index. Returns the amount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_salary()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.coin_ledger (user_id, amount, reason)
  SELECT auth.uid(), s.next_amount, 'salary'
  FROM public.salary_status() s
  RETURNING amount INTO v_amount;

  RETURN v_amount;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Salary already claimed today';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_salary() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_salary() TO authenticated;
