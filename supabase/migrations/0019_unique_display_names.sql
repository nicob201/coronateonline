-- ============================================================================
-- 0019 — Display names are unique (D23), ignoring case, accents and outer spaces,
-- so nobody can pass as someone else in the ticker or the rankings.
-- ============================================================================

-- ponytail: lookalike characters and inner spaces still get through; add a confusables fold if impersonation shows up.
CREATE UNIQUE INDEX profiles_display_name_unique
  ON public.profiles (translate(lower(btrim(display_name)), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'));
