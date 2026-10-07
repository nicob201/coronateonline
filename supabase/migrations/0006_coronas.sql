-- ============================================================================
-- 0006_coronas.sql — Coronas (👑) replace ARS
--   1. Rescale: 1 👑 = $1.000 — amounts ÷ 1000, unit base price and increment
--   2. Wallet: coin_ledger (append-only), coin_balance() derived, 20 👑 welcome grant
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RESCALE — drop multiple-of-1000 rules, divide stored amounts (exact: all
--    are multiples of 1000), rescale the activity floor unit.
-- ---------------------------------------------------------------------------
ALTER TABLE reigns DROP CONSTRAINT reigns_price_paid_multiple;
ALTER TABLE claims DROP CONSTRAINT claims_amount_multiple;
ALTER TABLE pricing_config DROP CONSTRAINT pricing_config_activity_floor_unit_check;

UPDATE reigns SET price_paid = price_paid / 1000;
UPDATE claims SET amount = amount / 1000;
UPDATE pricing_config SET activity_floor_unit = activity_floor_unit / 1000;

ALTER TABLE pricing_config
  ALTER COLUMN activity_floor_unit SET DEFAULT 2,
  ADD CONSTRAINT pricing_config_activity_floor_unit_check CHECK (activity_floor_unit >= 0);

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
    1,
    round(v_recent_peak * v_cfg.peak_floor_fraction)::integer,
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
    round(v_decayed::numeric)::integer
  );
END;
$$;

-- create_claim: authenticated user creates a dethrone attempt (amount re-validated live).
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

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
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
    IF p_amount < v_current_price + 1 THEN
      RAISE EXCEPTION 'Amount must be at least %', v_current_price + 1;
    END IF;
  END IF;

  INSERT INTO public.claims (title_id, user_id, amount, message)
  VALUES (p_title_id, v_user_id, p_amount, p_message)
  RETURNING * INTO v_claim;

  RETURN v_claim;
END;
$$;

-- apply_claim: admin confirms a claim and atomically transfers the crown.
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
    IF v_claim.amount < v_current_price + 1 THEN
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
-- 2. WALLET — append-only ledger; balance is derived, never stored
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coin_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     integer NOT NULL CONSTRAINT coin_ledger_amount_nonzero CHECK (amount <> 0),
  reason     text NOT NULL CONSTRAINT coin_ledger_reason_check CHECK (reason IN ('welcome')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coin_ledger_user_created_idx
  ON coin_ledger (user_id, created_at DESC);

-- One welcome grant per user, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS coin_ledger_one_welcome_per_user
  ON coin_ledger (user_id) WHERE reason = 'welcome';

ALTER TABLE coin_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger rows are viewable by their owner"
  ON coin_ledger FOR SELECT
  USING (auth.uid() = user_id);

-- Read-only for signed-in owners; written only by SECURITY DEFINER code.
REVOKE ALL ON public.coin_ledger FROM anon, authenticated;
GRANT SELECT ON public.coin_ledger TO authenticated;

-- A user's Coronas balance: the sum of their ledger movements. The only place
-- the formula lives. SECURITY INVOKER, so clients only ever sum their own rows.
CREATE OR REPLACE FUNCTION public.coin_balance(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(amount), 0)::integer
  FROM public.coin_ledger
  WHERE user_id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.coin_balance(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.coin_balance(uuid) TO authenticated;

-- Grants the 20 👑 welcome bonus to every new profile (guests included).
CREATE OR REPLACE FUNCTION public.grant_welcome_coins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.coin_ledger (user_id, amount, reason)
  VALUES (NEW.id, 20, 'welcome');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_grant_welcome ON profiles;
CREATE TRIGGER on_profile_created_grant_welcome
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.grant_welcome_coins();

-- Backfill: every existing profile gets its welcome grant once.
INSERT INTO public.coin_ledger (user_id, amount, reason)
SELECT id, 20, 'welcome' FROM public.profiles
ON CONFLICT (user_id) WHERE reason = 'welcome' DO NOTHING;
