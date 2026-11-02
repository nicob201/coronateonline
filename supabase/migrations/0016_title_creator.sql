-- ============================================================================
-- 0016_title_creator.sql — D19 "De la comunidad" titles
--   1. titles.created_by: the player whose proposal became this title
--      (NULL for seeded titles; SET NULL if that account is deleted)
--   2. review_title_proposal sets it on approval
--   3. titles_priced exposes it with the creator's names (appended columns)
--   Additive.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. COLUMN + backfill from proposals approved before this migration
-- ---------------------------------------------------------------------------
ALTER TABLE public.titles
  ADD COLUMN created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.titles t
SET created_by = p.user_id
FROM public.title_proposals p
WHERE p.title_id = t.id AND p.status = 'approved';

-- ---------------------------------------------------------------------------
-- 2. review_title_proposal — unchanged from 0015 except the title insert now
--    records its creator.
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

-- ---------------------------------------------------------------------------
-- 3. titles_priced — same columns as 0013, creator appended at the end.
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
  r.message      AS holder_message,
  p.is_bot       AS holder_is_bot,
  t.level,
  t.province_code,
  extensions.st_x(t.location::extensions.geometry) AS lon,
  extensions.st_y(t.location::extensions.geometry) AS lat,
  t.created_by,
  c.username     AS creator_username,
  c.display_name AS creator_display_name
FROM public.titles t
LEFT JOIN public.reigns   r ON r.title_id = t.id AND r.ended_at IS NULL
LEFT JOIN public.profiles p ON p.id = r.user_id
LEFT JOIN public.profiles c ON c.id = t.created_by;
