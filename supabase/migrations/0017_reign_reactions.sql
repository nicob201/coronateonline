-- ============================================================================
-- 0017_reign_reactions.sql — D20 🍅 / 👏 thrown at a title's current reign
--   1. reign_reactions: one row per throw. Owner-only: who reacted when is not
--      public (same reasoning as notification_seen); everyone sees totals only.
--   2. reign_reaction_counts: public totals for one reign.
--   3. react_to_reign: the only write path — active reign, not your own,
--      at most 10 throws per user per minute; returns the new totals and
--      broadcasts them on the private Realtime topic 'reign:<id>'.
--   4. realtime.messages policy: anyone may listen on 'reign:*', nobody may send.
--   Additive.
-- ============================================================================

CREATE TABLE public.reign_reactions (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reign_id   uuid NOT NULL REFERENCES public.reigns(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('tomato', 'applause')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reign_reactions_reign_id_idx ON public.reign_reactions (reign_id);
CREATE INDEX reign_reactions_user_recent_idx ON public.reign_reactions (user_id, created_at);

ALTER TABLE public.reign_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions are viewable by their author"
  ON public.reign_reactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.reign_reactions FROM anon, authenticated;
GRANT SELECT ON public.reign_reactions TO authenticated;

-- ---------------------------------------------------------------------------
-- reign_reaction_counts — DEFINER because the rows are owner-only; it exposes
-- nothing but the two totals. Always one row (zeros for a reign without throws).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reign_reaction_counts(p_reign_id uuid)
RETURNS TABLE (tomatoes integer, applause integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*) FILTER (WHERE r.kind = 'tomato')::integer,
         count(*) FILTER (WHERE r.kind = 'applause')::integer
  FROM public.reign_reactions r
  WHERE r.reign_id = p_reign_id;
$$;

REVOKE EXECUTE ON FUNCTION public.reign_reaction_counts(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reign_reaction_counts(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- react_to_reign — the profile lock (same as dethrone_with_coins) serializes a
-- user's throws, so concurrent calls cannot both slip under the limit. now() is
-- the transaction start: the window is measured from when the call began.
-- ---------------------------------------------------------------------------
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

REVOKE EXECUTE ON FUNCTION public.react_to_reign(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.react_to_reign(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Private Realtime topics 'reign:<id>': clients (signed in or not) may join and
-- receive; with no INSERT policy, only react_to_reign can broadcast on them.
-- ---------------------------------------------------------------------------
CREATE POLICY "Anyone can receive reign reaction broadcasts"
  ON realtime.messages FOR SELECT TO anon, authenticated
  USING (realtime.topic() LIKE 'reign:%' AND extension = 'broadcast');
