-- ============================================================================
-- 0018 — Tighten client permissions (D23)
--   1. anon/authenticated lose TRUNCATE, REFERENCES and TRIGGER (TRUNCATE skips RLS).
--   2. Signup trigger functions are not callable by clients.
--   3. New objects in public start with no client access: every table and
--      function must be granted explicitly.
--   4. profiles limits now live in the database: clients can PATCH their own
--      row through the API, which skips the Server Action validation.
-- ============================================================================

REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.pricing_config, public.profiles, public.provinces, public.reigns, public.titles, public.titles_priced
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.grant_welcome_coins()
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ponytail: the project URL is hard-coded, a new project or custom domain needs a new migration.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_len
    CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 50),
  ADD CONSTRAINT profiles_bio_len
    CHECK (char_length(bio) <= 280),
  ADD CONSTRAINT profiles_links_len
    CHECK (greatest(char_length(instagram), char_length(tiktok), char_length(youtube),
                    char_length(x), char_length(twitch), char_length(website), char_length(avatar_url)) <= 300),
  ADD CONSTRAINT profiles_avatar_url_own_storage
    CHECK (avatar_url ~ '^(https://soaycjcluodfcitgsfsf\.supabase\.co|http://127\.0\.0\.1:54321)/storage/v1/object/public/avatars/');
