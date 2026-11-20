-- ============================================================================
-- 0022 — Onboarding gate for every Coronas-spending or social action
--   assert_onboarded() raises 'Profile incomplete' when the profile has no
--   display_name; dethrone_with_coins, react_to_reign, propose_title and
--   claim_salary call it, so no path can skip /onboarding.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_onboarded(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND display_name IS NOT NULL) THEN
    RAISE EXCEPTION 'Profile incomplete';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_onboarded(uuid) FROM PUBLIC, anon, authenticated;

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

  PERFORM public.assert_onboarded(v_user_id);

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

CREATE OR REPLACE FUNCTION public.react_to_reign(p_reign_id uuid, p_kind text)
RETURNS TABLE (tomatoes integer, applause integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_limit   constant integer := 10;
  v_holder  uuid;
  v_totals  record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.assert_onboarded(v_user_id);

  IF p_kind IS NULL OR p_kind NOT IN ('tomato', 'applause') THEN
    RAISE EXCEPTION 'Invalid reaction';
  END IF;

  SELECT g.user_id INTO v_holder
  FROM public.reigns g
  WHERE g.id = p_reign_id AND g.ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reign not active';
  END IF;
  IF v_holder = v_user_id THEN
    RAISE EXCEPTION 'Own reign';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR NO KEY UPDATE;

  IF (SELECT count(*) FROM public.reign_reactions r
      WHERE r.user_id = v_user_id AND r.created_at > now() - interval '1 minute') >= v_limit THEN
    RAISE EXCEPTION 'Rate limited';
  END IF;

  INSERT INTO public.reign_reactions (reign_id, user_id, kind)
  VALUES (p_reign_id, v_user_id, p_kind);

  SELECT * INTO v_totals FROM public.reign_reaction_counts(p_reign_id);

  -- Delivered on commit; realtime.send only warns on failure, so a broadcast never blocks a throw.
  PERFORM realtime.send(
    jsonb_build_object('kind', p_kind, 'tomatoes', v_totals.tomatoes, 'applause', v_totals.applause),
    'reaction',
    'reign:' || p_reign_id,
    true
  );

  RETURN QUERY SELECT v_totals.tomatoes, v_totals.applause;
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_title(
  p_name text,
  p_emoji text,
  p_description text
) RETURNS public.title_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_cost     constant integer := 30;
  v_proposal public.title_proposals;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.assert_onboarded(v_user_id);

  p_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  p_emoji := btrim(coalesce(p_emoji, ''));
  p_description := regexp_replace(btrim(coalesce(p_description, '')), '\s+', ' ', 'g');

  IF char_length(p_name) NOT BETWEEN 3 AND 40 THEN
    RAISE EXCEPTION 'Invalid name';
  END IF;
  IF char_length(p_emoji) NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'Invalid emoji';
  END IF;
  IF char_length(p_description) NOT BETWEEN 3 AND 140 THEN
    RAISE EXCEPTION 'Invalid description';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR NO KEY UPDATE;

  IF EXISTS (SELECT 1 FROM public.title_proposals WHERE user_id = v_user_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Proposal already pending';
  END IF;

  IF EXISTS (SELECT 1 FROM public.titles WHERE lower(name) = lower(p_name))
     OR EXISTS (SELECT 1 FROM public.title_proposals
                WHERE status = 'pending' AND lower(name) = lower(p_name)) THEN
    RAISE EXCEPTION 'Title name taken';
  END IF;

  IF public.coin_balance(v_user_id) < v_cost THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.title_proposals (user_id, name, emoji, description, cost)
  VALUES (v_user_id, p_name, p_emoji, p_description, v_cost)
  RETURNING * INTO v_proposal;

  INSERT INTO public.coin_ledger (user_id, amount, reason)
  VALUES (v_user_id, -v_cost, 'proposal');

  RETURN v_proposal;
END;
$$;

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

  PERFORM public.assert_onboarded(auth.uid());

  INSERT INTO public.coin_ledger (user_id, amount, reason)
  SELECT auth.uid(), s.next_amount, 'salary'
  FROM public.salary_status() s
  RETURNING amount INTO v_amount;

  RETURN v_amount;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Salary already claimed today';
END;
$$;
