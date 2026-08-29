-- ============================================================================
-- 0004_price_decay.sql — Time-decayed effective price for held titles
--   1. pricing_config — single-row tunable knobs (tuning is an UPDATE)
--   2. title_price_floor() / title_current_price() — the formula, one place only
--   3. titles_priced view — the read path for effective price + current holder
--   4. create_claim / apply_claim — validate against the decayed price
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PRICING CONFIG
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_config (
  id                  integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  decay_rate_daily    numeric NOT NULL DEFAULT 0.007
                        CHECK (decay_rate_daily >= 0 AND decay_rate_daily < 1),
  grace_days          integer NOT NULL DEFAULT 3   CHECK (grace_days >= 0),
  peak_floor_fraction numeric NOT NULL DEFAULT 0.25
                        CHECK (peak_floor_fraction >= 0 AND peak_floor_fraction <= 1),
  peak_window_days    integer NOT NULL DEFAULT 90  CHECK (peak_window_days > 0),
  activity_floor_unit integer NOT NULL DEFAULT 2000
                        CHECK (activity_floor_unit >= 0 AND activity_floor_unit % 1000 = 0)
);

INSERT INTO pricing_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing config is publicly readable"
  ON pricing_config FOR SELECT
  USING (true);

-- Game rules are public; writes happen only via migrations or service_role.
GRANT SELECT ON pricing_config TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pricing_config FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. PRICING FUNCTIONS — the effective-price formula lives here and nowhere else
-- ---------------------------------------------------------------------------

-- Lowest the effective price can fall to for a title: base, a fraction of the
-- recent price peak, and a per-recent-dethrone amount, whichever is largest.
CREATE OR REPLACE FUNCTION public.title_price_floor(p_title_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg          public.pricing_config;
  v_recent_peak  integer;
  v_recent_count integer;
BEGIN
  SELECT * INTO v_cfg FROM public.pricing_config WHERE id = 1;

  SELECT COALESCE(max(price_paid), 0) INTO v_recent_peak
  FROM public.reigns
  WHERE title_id = p_title_id
    AND started_at > now() - make_interval(days => v_cfg.peak_window_days);

  SELECT count(*) INTO v_recent_count
  FROM public.reigns
  WHERE title_id = p_title_id
    AND ended_at IS NOT NULL
    AND ended_at > now() - interval '30 days';

  RETURN GREATEST(
    1000,
    (round(v_recent_peak * v_cfg.peak_floor_fraction / 1000) * 1000)::integer,
    v_cfg.activity_floor_unit * v_recent_count
  );
END;
$$;

-- Effective price of a title's active reign: price_paid decayed by
-- decay_rate_daily per day after grace_days, never below title_price_floor.
-- NULL when the title has no active reign.
CREATE OR REPLACE FUNCTION public.title_current_price(p_title_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg        public.pricing_config;
  v_reign      RECORD;
  v_days_held  double precision;
  v_decay_days double precision;
  v_decayed    double precision;
BEGIN
  SELECT started_at, price_paid INTO v_reign
  FROM public.reigns
  WHERE title_id = p_title_id AND ended_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cfg FROM public.pricing_config WHERE id = 1;

  v_days_held  := extract(epoch FROM now() - v_reign.started_at) / 86400.0;
  v_decay_days := GREATEST(0, v_days_held - v_cfg.grace_days);
  v_decayed    := v_reign.price_paid
                  * power((1 - v_cfg.decay_rate_daily)::double precision,
                          v_decay_days);

  RETURN GREATEST(
    public.title_price_floor(p_title_id),
    (round((v_decayed / 1000)::numeric) * 1000)::integer
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.title_price_floor(uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.title_current_price(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.title_price_floor(uuid)   TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.title_current_price(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. VIEW — one flat row per title: effective price + current holder
-- ---------------------------------------------------------------------------
-- ponytail: two SECURITY DEFINER calls per row (~6 subqueries); rewrite as a LATERAL-joined view if title count grows past a few hundred.
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
  p.avatar_url   AS holder_avatar_url
FROM public.titles t
LEFT JOIN public.reigns   r ON r.title_id = t.id AND r.ended_at IS NULL
LEFT JOIN public.profiles p ON p.id = r.user_id;

GRANT SELECT ON public.titles_priced TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.titles_priced FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_claim / apply_claim — thresholds use the decayed price
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
  v_current_price integer;
  v_claim public.claims;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount <= 0 OR p_amount % 1000 != 0 THEN
    RAISE EXCEPTION 'Amount must be a positive multiple of 1000';
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

  INSERT INTO public.claims (title_id, user_id, amount)
  VALUES (p_title_id, v_user_id, p_amount)
  RETURNING * INTO v_claim;

  RETURN v_claim;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_claim(p_claim_id uuid)
RETURNS void
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

  INSERT INTO public.reigns (title_id, user_id, price_paid)
  VALUES (v_claim.title_id, v_claim.user_id, v_claim.amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_claim(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_claim(uuid, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_claim(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_claim(uuid) TO authenticated;
