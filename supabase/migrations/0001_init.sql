-- ============================================================================
-- 0001_init.sql — Initial schema for CoronaTeOnline
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES (1:1 with auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   text UNIQUE NOT NULL
             CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  bio        text,
  instagram  text,
  tiktok     text,
  youtube    text,
  x          text,
  twitch     text,
  website    text,
  is_admin   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. TITLES (admin-seeded)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS titles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  emoji       text NOT NULL,
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. REIGNS (history — current holder/price derived from active reign)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id    uuid NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price_paid  integer NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,

  CONSTRAINT reigns_price_paid_positive CHECK (price_paid > 0),
  CONSTRAINT reigns_price_paid_multiple CHECK (price_paid % 1000 = 0)
);

-- At most one active reign (ended_at IS NULL) per title
CREATE UNIQUE INDEX IF NOT EXISTS reigns_one_active_per_title
  ON reigns (title_id)
  WHERE ended_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. CLAIMS (dethrone attempts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id    uuid NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount      integer NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,

  CONSTRAINT claims_amount_positive CHECK (amount > 0),
  CONSTRAINT claims_amount_multiple CHECK (amount % 1000 = 0)
);

-- ---------------------------------------------------------------------------
-- 5. TRIGGER — auto-create profile on auth.users insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw text;
  v_base text;
BEGIN
  v_raw := COALESCE(
    NEW.raw_user_meta_data ->> 'username',
    NEW.raw_user_meta_data ->> 'full_name',
    split_part(NEW.email, '@', 1),
    ''
  );
  -- Normalize: lowercase first, then strip non-[a-z0-9_], enforce minimum length
  v_base := regexp_replace(lower(v_raw), '[^a-z0-9_]', '', 'g');
  IF length(v_base) < 3 THEN
    v_base := 'usuario';
  ELSIF length(v_base) > 15 THEN
    v_base := left(v_base, 15);
  END IF;
  -- Ensure uniqueness: try base, then base_XXXX
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = v_base) THEN
    INSERT INTO public.profiles (id, username) VALUES (NEW.id, v_base);
  ELSE
    LOOP
      v_base := left(v_base, 15 - 5) || '_' || lpad(floor(random() * 10000)::text, 4, '0');
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = v_base) THEN
        INSERT INTO public.profiles (id, username) VALUES (NEW.id, v_base);
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can update own profile (never is_admin)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Column-level privilege escalation fix: deny UPDATE to anon+authenticated,
-- then grant only the non-sensitive columns.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (username, display_name, avatar_url, bio, instagram, tiktok, youtube, x, twitch, website)
  ON public.profiles TO authenticated;

-- titles
ALTER TABLE titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Titles are viewable by everyone"
  ON titles FOR SELECT
  USING (true);

-- reigns
ALTER TABLE reigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reigns are viewable by everyone"
  ON reigns FOR SELECT
  USING (true);

-- claims
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claims are viewable by owner and admins"
  ON claims FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- No INSERT/UPDATE/DELETE policies on titles or reigns for clients.
-- Claims are inserted only via create_claim RPC.
-- Claims status is updated only via apply_claim / reject_claim RPCs.

-- ---------------------------------------------------------------------------
-- 7. RPC FUNCTIONS
-- ---------------------------------------------------------------------------

-- create_claim: authenticated user creates a dethrone attempt
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

-- apply_claim: admin confirms a claim, atomically transfers the crown
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
BEGIN
  -- Verify caller is admin
  SELECT is_admin INTO v_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_admin IS NOT true THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock the claim row to prevent concurrent applies
  SELECT * INTO v_claim
  FROM public.claims
  WHERE id = p_claim_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found or already resolved';
  END IF;

  -- Re-validate at apply time against live reign data
  SELECT * INTO v_active_reign
  FROM public.reigns
  WHERE title_id = v_claim.title_id AND ended_at IS NULL;

  IF v_active_reign.user_id = v_claim.user_id THEN
    RAISE EXCEPTION 'User already holds this title';
  END IF;

  IF v_active_reign.price_paid IS NOT NULL
     AND v_claim.amount < v_active_reign.price_paid + 1000 THEN
    RAISE EXCEPTION 'Claim amount is below the current price';
  END IF;

  -- Mark claim as applied
  UPDATE public.claims
  SET status = 'applied', resolved_at = now()
  WHERE id = p_claim_id;

  -- Close current active reign (if any)
  UPDATE public.reigns
  SET ended_at = now()
  WHERE title_id = v_claim.title_id AND ended_at IS NULL;

  -- Start new reign
  INSERT INTO public.reigns (title_id, user_id, price_paid)
  VALUES (v_claim.title_id, v_claim.user_id, v_claim.amount);
END;
$$;

-- reject_claim: admin rejects a claim
CREATE OR REPLACE FUNCTION public.reject_claim(p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin boolean;
BEGIN
  SELECT is_admin INTO v_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_admin IS NOT true THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.claims
  SET status = 'rejected', resolved_at = now()
  WHERE id = p_claim_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found or already resolved';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. GRANT execute — revoke from PUBLIC and anon, grant to authenticated only
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_claim(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_claim(uuid, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_claim(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_claim(uuid) TO authenticated;
