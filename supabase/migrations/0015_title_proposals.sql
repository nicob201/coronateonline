-- ============================================================================
-- 0015_title_proposals.sql — D18 user-created titles
--   1. titles: names are unique ignoring case
--   2. coin_ledger: 'proposal' debit and 'proposal_refund' credit
--   3. title_proposals: pending/approved/rejected, one pending per author,
--      readable by its author and admins, written only by the RPCs below
--   4. propose_title — the caller pays 30 👑 to submit a title for review
--   5. review_title_proposal — an admin approves (title published, author
--      crowned as its first king at the base price) or rejects (full refund)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TITLES — a proposal can never collide with an existing name.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX titles_name_lower_key ON public.titles (lower(name));

-- ---------------------------------------------------------------------------
-- 2. LEDGER — proposing spends, a rejection gives it back.
-- ---------------------------------------------------------------------------
ALTER TABLE public.coin_ledger
  DROP CONSTRAINT coin_ledger_reason_check,
  DROP CONSTRAINT coin_ledger_amount_sign;
ALTER TABLE public.coin_ledger
  ADD CONSTRAINT coin_ledger_reason_check
    CHECK (reason IN ('welcome', 'dethrone', 'dethroned', 'salary', 'proposal', 'proposal_refund')),
  ADD CONSTRAINT coin_ledger_amount_sign
    CHECK ((reason IN ('dethrone', 'proposal')) = (amount < 0));

-- ---------------------------------------------------------------------------
-- 3. PROPOSALS — cost is stored so a refund returns exactly what was paid.
-- ---------------------------------------------------------------------------
CREATE TABLE public.title_proposals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 40),
  emoji       text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 140),
  cost        integer NOT NULL CHECK (cost > 0),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  title_id    uuid REFERENCES public.titles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE UNIQUE INDEX title_proposals_one_pending_per_user
  ON public.title_proposals (user_id) WHERE status = 'pending';

ALTER TABLE public.title_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposals are viewable by their author and admins"
  ON public.title_proposals FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
  );

REVOKE ALL ON public.title_proposals FROM anon, authenticated;
GRANT SELECT ON public.title_proposals TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. propose_title — trims and collapses whitespace, rejects a taken name
--    (live titles or someone's pending proposal), then debits the cost.
--    Same profile lock as dethrone_with_coins so spends cannot race.
-- ---------------------------------------------------------------------------
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

REVOKE EXECUTE ON FUNCTION public.propose_title(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.propose_title(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. review_title_proposal — admins only (profiles.is_admin, never a client
--    value). Approve: slug from the name (accents folded, "-2", "-3"… on a
--    clash), title inserted, author crowned at the base price with no extra
--    charge (they already paid the proposal). Reject: refund the stored cost.
-- ---------------------------------------------------------------------------
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
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_proposal FROM public.title_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF v_proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'Proposal already reviewed';
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
    RAISE EXCEPTION 'Title name taken';
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

  INSERT INTO public.titles (slug, name, emoji, description)
  VALUES (v_slug, v_proposal.name, v_proposal.emoji, v_proposal.description)
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

REVOKE EXECUTE ON FUNCTION public.review_title_proposal(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.review_title_proposal(uuid, boolean) TO authenticated;
