-- ============================================================================
-- 0005_emotion_layer.sql — Coronation message, dethroned-user tracking,
--   and public holder message on the priced view.
--   ponytail: RPC-internal behaviour (dethroned_user_id capture, message
--   passthrough, clear flag) is covered by manual DB verification, not
--   automated tests.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. COLUMNS — message on claims + reigns, dethroned_user_id on reigns
-- ---------------------------------------------------------------------------
ALTER TABLE claims
  ADD COLUMN message text
    CONSTRAINT claims_message_len CHECK (message IS NULL OR char_length(message) <= 80);

ALTER TABLE reigns
  ADD COLUMN message text
    CONSTRAINT reigns_message_len CHECK (message IS NULL OR char_length(message) <= 80);

ALTER TABLE reigns
  ADD COLUMN dethroned_user_id uuid
    CONSTRAINT reigns_dethroned_user_id_fkey
      REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reigns_dethroned_user_id_idx
  ON reigns (dethroned_user_id) WHERE dethroned_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. create_claim — now accepts an optional coronation message (3 args)
-- ---------------------------------------------------------------------------
DROP FUNCTION public.create_claim(uuid, integer);

CREATE OR REPLACE FUNCTION public.create_claim(
  p_title_id uuid,
  p_amount integer,
  p_message text DEFAULT NULL
) RETURNS public.claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_active_reign record;
  v_current_price integer;
  v_claim public.claims;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount <= 0 OR p_amount % 1000 != 0 THEN
    RAISE EXCEPTION 'Amount must be a positive multiple of 1000';
  END IF;

  p_message := nullif(btrim(p_message), '');
  IF p_message IS NOT NULL AND char_length(p_message) > 80 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.claims
    WHERE title_id = p_title_id
      AND user_id = v_user_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending claim for this title';
  END IF;

  SELECT * INTO v_active_reign
  FROM public.reigns
  WHERE title_id = p_title_id AND ended_at IS NULL;

  IF FOUND THEN
    IF v_active_reign.user_id = v_user_id THEN
      RAISE EXCEPTION 'You already hold this title';
    END IF;
    v_current_price := public.title_current_price(p_title_id);
    IF p_amount < v_current_price + 1000 THEN
      RAISE EXCEPTION 'Amount must be at least %', v_current_price + 1000;
    END IF;
  ELSE
    IF p_amount < 1000 THEN
      RAISE EXCEPTION 'Minimum claim amount is 1000';
    END IF;
  END IF;

  INSERT INTO public.claims (title_id, user_id, amount, message)
  VALUES (p_title_id, v_user_id, p_amount, p_message)
  RETURNING * INTO v_claim;

  RETURN v_claim;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. apply_claim — now accepts a clear-message flag (2 args)
-- ---------------------------------------------------------------------------
DROP FUNCTION public.apply_claim(uuid);

CREATE OR REPLACE FUNCTION public.apply_claim(
  p_claim_id uuid,
  p_clear_message boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean;
  v_claim public.claims;
  v_active_reign record;
  v_current_price integer;
BEGIN
  SELECT is_admin INTO v_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_admin IS NOT true THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_claim
  FROM public.claims
  WHERE id = p_claim_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found or already resolved';
  END IF;

  SELECT * INTO v_active_reign
  FROM public.reigns
  WHERE title_id = v_claim.title_id AND ended_at IS NULL;

  IF FOUND THEN
    IF v_active_reign.user_id = v_claim.user_id THEN
      RAISE EXCEPTION 'User already holds this title';
    END IF;
    v_current_price := public.title_current_price(v_claim.title_id);
    IF v_claim.amount < v_current_price + 1000 THEN
      RAISE EXCEPTION 'Claim amount is below the current price';
    END IF;
  END IF;

  UPDATE public.claims
  SET status = 'applied', resolved_at = now()
  WHERE id = p_claim_id;

  UPDATE public.reigns
  SET ended_at = now()
  WHERE title_id = v_claim.title_id AND ended_at IS NULL;

  INSERT INTO public.reigns
    (title_id, user_id, price_paid, message, dethroned_user_id)
  VALUES (
    v_claim.title_id,
    v_claim.user_id,
    v_claim.amount,
    CASE WHEN p_clear_message THEN NULL ELSE v_claim.message END,
    v_active_reign.user_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. VIEW — titles_priced now exposes the holder's coronation message
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.titles_priced
WITH (security_invoker = true) AS
SELECT
  t.id, t.slug, t.name, t.emoji, t.description, t.created_at,
  public.title_current_price(t.id) AS current_price,
  public.title_price_floor(t.id)   AS price_floor,
  r.id          AS reign_id,
  r.user_id     AS holder_user_id,
  r.price_paid  AS holder_paid,
  r.started_at  AS reign_started_at,
  p.username     AS holder_username,
  p.display_name AS holder_display_name,
  p.avatar_url   AS holder_avatar_url,
  r.message      AS holder_message
FROM public.titles t
LEFT JOIN public.reigns   r ON r.title_id = t.id AND r.ended_at IS NULL
LEFT JOIN public.profiles p ON p.id = r.user_id;

GRANT SELECT ON public.titles_priced TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.titles_priced FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. GRANTS — re-apply after DROP removed the originals
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_claim(uuid, integer, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_claim(uuid, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_claim(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_claim(uuid, boolean) TO authenticated;
