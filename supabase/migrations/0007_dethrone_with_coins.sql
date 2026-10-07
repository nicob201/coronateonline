-- ============================================================================
-- 0007_dethrone_with_coins.sql — dethroning spends Coronas
--   1. Retire the manual claim flow (claims table + its RPCs)
--   2. coin_ledger: reign reference, dethrone/dethroned reasons, sign rule
--   3. dethrone_with_coins — the atomic, zero-sum crown transfer
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RETIRE THE MANUAL FLOW (production has 0 claims; plain DROPs fail loudly
--    if a signature drifted, rolling back the whole migration)
-- ---------------------------------------------------------------------------
DROP FUNCTION public.create_claim(uuid, integer, text);
DROP FUNCTION public.apply_claim(uuid, boolean);
DROP FUNCTION public.reject_claim(uuid);
DROP TABLE public.claims;

-- ---------------------------------------------------------------------------
-- 2. LEDGER — reign reference + reasons + sign rule. reign_id stays nullable:
--    deleting an account cascades to its reigns and must not block or rewrite
--    other users' balances.
-- ---------------------------------------------------------------------------
ALTER TABLE coin_ledger
  ADD COLUMN reign_id uuid REFERENCES reigns(id) ON DELETE SET NULL;

ALTER TABLE coin_ledger DROP CONSTRAINT coin_ledger_reason_check;
ALTER TABLE coin_ledger
  ADD CONSTRAINT coin_ledger_reason_check
    CHECK (reason IN ('welcome', 'dethrone', 'dethroned')),
  ADD CONSTRAINT coin_ledger_amount_sign
    CHECK ((reason = 'dethrone') = (amount < 0));

-- ---------------------------------------------------------------------------
-- 3. dethrone_with_coins — the caller pays p_amount Coronas for the title.
--    Validates the live price and the balance, ends the active reign, starts
--    the caller's, debits the caller and credits the dethroned holder with the
--    full amount (zero-sum). On an unclaimed title the coins are burned.
--    Lock order: title row, then the caller's profile row.
-- ---------------------------------------------------------------------------
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

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  p_message := nullif(btrim(p_message), '');
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
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;
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

REVOKE EXECUTE ON FUNCTION public.dethrone_with_coins(uuid, integer, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dethrone_with_coins(uuid, integer, text) TO authenticated;
