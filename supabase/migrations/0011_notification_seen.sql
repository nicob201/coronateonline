-- ============================================================================
-- 0011_notification_seen.sql — D9 in-app notifications
--   A dethrone notification IS the reigns row (dethroned_user_id = the victim);
--   the only new state is when each user last opened their bell. It lives in an
--   owner-only table, not on profiles (publicly readable: it would leak when
--   someone was last active).
-- ============================================================================

CREATE TABLE public.notification_seen (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL
);

ALTER TABLE public.notification_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notification state is viewable by its owner"
  ON public.notification_seen FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.notification_seen FROM anon, authenticated;
GRANT SELECT ON public.notification_seen TO authenticated;

-- Existing users start fully read, so launch does not flood anyone with "unread".
INSERT INTO public.notification_seen (user_id, seen_at)
SELECT id, now() FROM public.profiles;

-- ---------------------------------------------------------------------------
-- mark_notifications_seen — the caller has opened their bell (server time, so a
-- client clock cannot hide a notification). A user with no row yet gets one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notifications_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.notification_seen (user_id, seen_at)
  VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET seen_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notifications_seen() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_notifications_seen() TO authenticated;
