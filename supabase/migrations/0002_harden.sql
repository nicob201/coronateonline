-- ============================================================================
-- 0002_harden.sql — Foundation hardening
--   1. Anti-spam guard in create_claim (one pending claim per user per title)
--   2. Explicit table privileges (make "client writes are impossible" self-documenting)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_claim — reject a second pending claim for the same title
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_claim(p_title_id uuid, p_amount integer)
RETURNS public.claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_active_reign record;
  v_claim public.claims;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount <= 0 OR p_amount % 1000 != 0 THEN
    RAISE EXCEPTION 'Amount must be a positive multiple of 1000';
  END IF;

  -- One pending claim per user per title — stops claim spam.
  IF EXISTS (
    SELECT 1 FROM public.claims
    WHERE title_id = p_title_id
      AND user_id = v_user_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending claim for this title';
  END IF;

  -- Find active reign for this title
  SELECT * INTO v_active_reign
  FROM public.reigns
  WHERE title_id = p_title_id AND ended_at IS NULL;

  IF FOUND THEN
    -- Title is held — must pay at least current price + 1000
    IF p_amount < v_active_reign.price_paid + 1000 THEN
      RAISE EXCEPTION 'Amount must be at least %', v_active_reign.price_paid + 1000;
    END IF;
    -- Cannot claim a title you already hold
    IF v_active_reign.user_id = v_user_id THEN
      RAISE EXCEPTION 'You already hold this title';
    END IF;
  ELSE
    -- Title is unclaimed — minimum is 1000
    IF p_amount < 1000 THEN
      RAISE EXCEPTION 'Minimum claim amount is 1000';
    END IF;
  END IF;

  INSERT INTO public.claims (title_id, user_id, amount)
  VALUES (p_title_id, v_user_id, p_amount)
  RETURNING * INTO v_claim;

  RETURN v_claim;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_claim(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_claim(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Explicit table privileges
--    RLS is the gate; these grants make the intended posture explicit and
--    independent of Supabase default-privilege behaviour.
-- ---------------------------------------------------------------------------

-- Public read for the derived-state tables.
GRANT SELECT ON public.profiles, public.titles, public.reigns TO anon, authenticated;

-- Claims are readable only by signed-in users (RLS further limits to owner + admin).
REVOKE SELECT ON public.claims FROM anon;
GRANT SELECT ON public.claims TO authenticated;

-- No client writes anywhere: titles/reigns change only inside SECURITY DEFINER
-- functions; claims change only via the create/apply/reject RPCs; profiles are
-- inserted only by the on_auth_user_created trigger and updated column-wise
-- (see 0001). Deletes are never allowed from the client.
REVOKE INSERT, UPDATE, DELETE ON public.titles  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reigns  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.claims  FROM anon, authenticated;
REVOKE INSERT, DELETE         ON public.profiles FROM anon, authenticated;
