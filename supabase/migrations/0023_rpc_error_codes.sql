-- ============================================================================
-- 0023 — Stable SQLSTATE codes for the game's RPC errors
--   Every RAISE EXCEPTION the app interprets now carries its own SQLSTATE in the
--   custom class 'CT', so the actions map errors by code (src/lib/rpc-errors.ts)
--   instead of matching English message fragments. The messages stay unchanged.
--
--   CT0xx  shared        CT001 not authenticated      CT002 profile incomplete
--                        CT003 insufficient balance   CT004 not authorized
--   CT1xx  dethrone      CT101 amount not positive    CT102 message too long
--                        CT103 title not found        CT104 already the holder
--                        CT105 amount below the minimum
--   CT2xx  salary        CT201 already claimed today
--   CT3xx  reactions     CT301 invalid reaction       CT302 reign not active
--                        CT303 own reign              CT304 rate limited
--   CT4xx  proposals     CT401 invalid name           CT402 invalid emoji
--                        CT403 invalid description    CT404 proposal already pending
--                        CT405 title name taken       CT406 proposal not found
--                        CT407 proposal already reviewed
--
--   A custom SQLSTATE is NOT caught by `WHEN raise_exception` (that is P0001
--   only), so bot_tick now also catches the whole class with SQLSTATE 'CT000';
--   otherwise a lost race would abort the cron run instead of skipping the move.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_onboarded(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND display_name IS NOT NULL) THEN
    RAISE EXCEPTION 'Profile incomplete' USING ERRCODE = 'CT002';
  END IF;
END;
$$;

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
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'CT001';
  END IF;

  PERFORM public.assert_onboarded(v_user_id);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = 'CT101';
  END IF;

  p_message := nullif(btrim(p_message, E' \t\r\n'), '');
  IF p_message IS NOT NULL AND char_length(p_message) > 80 THEN
    RAISE EXCEPTION 'Message too long' USING ERRCODE = 'CT102';
  END IF;

  -- Serializes every attempt on this title, unclaimed ones included.
  PERFORM 1 FROM public.titles WHERE id = p_title_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Title not found' USING ERRCODE = 'CT103';
  END IF;

  SELECT * INTO v_active
  FROM public.reigns
  WHERE title_id = p_title_id AND ended_at IS NULL;

  IF FOUND THEN
    IF v_active.user_id = v_user_id THEN
      RAISE EXCEPTION 'You already hold this title' USING ERRCODE = 'CT104';
    END IF;
    v_min := public.title_current_price(p_title_id) + 1;
  ELSE
    v_min := 1;
  END IF;

  IF p_amount < v_min THEN
    RAISE EXCEPTION 'Amount must be at least %', v_min USING ERRCODE = 'CT105';
  END IF;

  -- Serializes this caller's spends so the balance check cannot be raced.
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR NO KEY UPDATE;
  IF public.coin_balance(v_user_id) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'CT003';
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
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'CT001';
  END IF;

  PERFORM public.assert_onboarded(v_user_id);

  IF p_kind IS NULL OR p_kind NOT IN ('tomato', 'applause') THEN
    RAISE EXCEPTION 'Invalid reaction' USING ERRCODE = 'CT301';
  END IF;

  SELECT g.user_id INTO v_holder
  FROM public.reigns g
  WHERE g.id = p_reign_id AND g.ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reign not active' USING ERRCODE = 'CT302';
  END IF;
  IF v_holder = v_user_id THEN
    RAISE EXCEPTION 'Own reign' USING ERRCODE = 'CT303';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR NO KEY UPDATE;

  IF (SELECT count(*) FROM public.reign_reactions r
      WHERE r.user_id = v_user_id AND r.created_at > now() - interval '1 minute') >= v_limit THEN
    RAISE EXCEPTION 'Rate limited' USING ERRCODE = 'CT304';
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
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'CT001';
  END IF;

  PERFORM public.assert_onboarded(v_user_id);

  p_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  p_emoji := btrim(coalesce(p_emoji, ''));
  p_description := regexp_replace(btrim(coalesce(p_description, '')), '\s+', ' ', 'g');

  IF char_length(p_name) NOT BETWEEN 3 AND 40 THEN
    RAISE EXCEPTION 'Invalid name' USING ERRCODE = 'CT401';
  END IF;
  IF char_length(p_emoji) NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'Invalid emoji' USING ERRCODE = 'CT402';
  END IF;
  IF char_length(p_description) NOT BETWEEN 3 AND 140 THEN
    RAISE EXCEPTION 'Invalid description' USING ERRCODE = 'CT403';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR NO KEY UPDATE;

  IF EXISTS (SELECT 1 FROM public.title_proposals WHERE user_id = v_user_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Proposal already pending' USING ERRCODE = 'CT404';
  END IF;

  IF EXISTS (SELECT 1 FROM public.titles WHERE lower(name) = lower(p_name))
     OR EXISTS (SELECT 1 FROM public.title_proposals
                WHERE status = 'pending' AND lower(name) = lower(p_name)) THEN
    RAISE EXCEPTION 'Title name taken' USING ERRCODE = 'CT405';
  END IF;

  IF public.coin_balance(v_user_id) < v_cost THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'CT003';
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
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'CT001';
  END IF;

  PERFORM public.assert_onboarded(auth.uid());

  INSERT INTO public.coin_ledger (user_id, amount, reason)
  SELECT auth.uid(), s.next_amount, 'salary'
  FROM public.salary_status() s
  RETURNING amount INTO v_amount;

  RETURN v_amount;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Salary already claimed today' USING ERRCODE = 'CT201';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'CT001';
  END IF;

  INSERT INTO public.notification_seen (user_id, seen_at)
  VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET seen_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.review_title_proposal(
  p_proposal_id uuid,
  p_approve boolean
) RETURNS public.title_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proposal public.title_proposals;
  v_base     text;
  v_slug     text;
  v_n        integer := 1;
  v_title_id uuid;
BEGIN
  IF NOT coalesce((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'CT004';
  END IF;

  SELECT * INTO v_proposal FROM public.title_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'CT406';
  END IF;
  IF v_proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'Proposal already reviewed' USING ERRCODE = 'CT407';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.title_proposals
    SET status = 'rejected', reviewed_at = now()
    WHERE id = p_proposal_id
    RETURNING * INTO v_proposal;

    INSERT INTO public.coin_ledger (user_id, amount, reason)
    VALUES (v_proposal.user_id, v_proposal.cost, 'proposal_refund');

    RETURN v_proposal;
  END IF;

  IF EXISTS (SELECT 1 FROM public.titles WHERE lower(name) = lower(v_proposal.name)) THEN
    RAISE EXCEPTION 'Title name taken' USING ERRCODE = 'CT405';
  END IF;

  v_base := btrim(regexp_replace(
    translate(lower(v_proposal.name), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
    '[^a-z0-9]+', '-', 'g'), '-');
  IF v_base = '' THEN
    v_base := 'titulo';
  END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.titles WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;

  INSERT INTO public.titles (slug, name, emoji, description, created_by)
  VALUES (v_slug, v_proposal.name, v_proposal.emoji, v_proposal.description, v_proposal.user_id)
  RETURNING id INTO v_title_id;

  INSERT INTO public.reigns (title_id, user_id, price_paid)
  VALUES (v_title_id, v_proposal.user_id, 1);

  UPDATE public.title_proposals
  SET status = 'approved', title_id = v_title_id, reviewed_at = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_proposal;

  RETURN v_proposal;
END;
$$;

CREATE OR REPLACE FUNCTION public.bot_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bot uuid;
BEGIN
  FOR v_bot IN SELECT id FROM public.profiles WHERE is_bot LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_bot, 'role', 'authenticated')::text, true);
    IF NOT (SELECT s.claimed_today FROM public.salary_status() s) THEN
      PERFORM public.claim_salary();
    END IF;
  END LOOP;

  IF random() >= 1.0 / 6 THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM public.bot_move();
  EXCEPTION WHEN raise_exception OR SQLSTATE 'CT000' THEN
    -- A human moved first (price or holder changed): skip the move, keep the
    -- salaries. CT000 matches every game error code (CT001, CT105, ...).
    -- Any other error fails the run, visible in cron.job_run_details.
    RAISE WARNING 'bot_move skipped: %', SQLERRM;
  END;
END;
$$;
