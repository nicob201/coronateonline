-- ============================================================================
-- 0021 — Audit quick wins
--   1. reigns indexes for title history and public profiles
--   2. ranking_hall_of_fame — aggregated in Postgres (PostgREST caps responses at 1000 rows)
--   3. dethrone_with_coins — also requires a display name (closes the onboarding bypass)
-- ============================================================================

CREATE INDEX reigns_title_started_idx ON public.reigns (title_id, started_at DESC);
CREATE INDEX reigns_user_started_idx  ON public.reigns (user_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.ranking_hall_of_fame(p_limit int DEFAULT 5)
RETURNS TABLE (
  username          text,
  display_name      text,
  avatar_url        text,
  reign_count       int,
  latest_title_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.username, p.display_name, p.avatar_url, count(*)::int,
         (SELECT t.name FROM public.reigns r2 JOIN public.titles t ON t.id = r2.title_id
          WHERE r2.user_id = p.id ORDER BY r2.started_at DESC LIMIT 1)
  FROM public.reigns r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE NOT p.is_bot
  GROUP BY p.id
  ORDER BY count(*) DESC, p.username
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.ranking_hall_of_fame(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ranking_hall_of_fame(int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.dethrone_with_coins(
  p_title_id uuid,
  p_amount integer,
  p_message text DEFAULT NULL
) RETURNS public.reigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_active  public.reigns;
  v_min     integer;
  v_reign   public.reigns;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Onboarding gate: a profile without a display name cannot hold a title.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND display_name IS NOT NULL) THEN
    RAISE EXCEPTION 'Profile incomplete';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  p_message := nullif(btrim(p_message, E' \t\r\n'), '');
  IF p_message IS NOT NULL AND char_length(p_message) > 80 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  -- Serializes every attempt on this title, unclaimed ones included.
  PERFORM 1 FROM public.titles WHERE id = p_title_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Title not found';
  END IF;

  SELECT * INTO v_active
  FROM public.reigns
  WHERE title_id = p_title_id AND ended_at IS NULL;

  IF FOUND THEN
    IF v_active.user_id = v_user_id THEN
      RAISE EXCEPTION 'You already hold this title';
    END IF;
    v_min := public.title_current_price(p_title_id) + 1;
  ELSE
    v_min := 1;
  END IF;

  IF p_amount < v_min THEN
    RAISE EXCEPTION 'Amount must be at least %', v_min;
  END IF;

  -- Serializes this caller's spends so the balance check cannot be raced.
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR NO KEY UPDATE;
  IF public.coin_balance(v_user_id) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.reigns
  SET ended_at = now()
  WHERE title_id = p_title_id AND ended_at IS NULL;

  INSERT INTO public.reigns (title_id, user_id, price_paid, message, dethroned_user_id)
  VALUES (p_title_id, v_user_id, p_amount, p_message, v_active.user_id)
  RETURNING * INTO v_reign;

  INSERT INTO public.coin_ledger (user_id, amount, reason, reign_id)
  VALUES (v_user_id, -p_amount, 'dethrone', v_reign.id);

  IF v_active.user_id IS NOT NULL THEN
    INSERT INTO public.coin_ledger (user_id, amount, reason, reign_id)
    VALUES (v_active.user_id, p_amount, 'dethroned', v_reign.id);
  END IF;

  RETURN v_reign;
END;
$$;
