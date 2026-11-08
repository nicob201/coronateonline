-- supabase/tests/permissions_test.sql
-- Verifies the client permission model: RLS everywhere, no direct writes, no TRUNCATE-class grants,
-- closed default privileges (migration 0018) and the profile limits that protect direct API writes.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/permissions_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

DO $$
DECLARE r record;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity),
    'every public table must have RLS enabled';

  FOR r IN
    SELECT c.oid, c.relname, role
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role)
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v')
  LOOP
    ASSERT NOT has_table_privilege(r.role, r.oid, 'TRUNCATE, REFERENCES, TRIGGER'),
      format('%s must not hold TRUNCATE/REFERENCES/TRIGGER on %s', r.role, r.relname);
    ASSERT NOT has_table_privilege(r.role, r.oid, 'INSERT, UPDATE, DELETE'),
      format('%s must not write directly to %s', r.role, r.relname);
  END LOOP;

  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.prosecdef
                       AND NOT coalesce(array_to_string(p.proconfig, ',') LIKE '%search_path=%', false)
                       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')),
    'every SECURITY DEFINER function must pin its search_path';

  ASSERT NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.grant_welcome_coins()', 'EXECUTE'),
    'clients must not be able to execute the signup trigger functions';
END $$;

-- New objects start closed.
CREATE TABLE public.permissions_probe (id integer);
CREATE FUNCTION public.permissions_probe_fn() RETURNS integer LANGUAGE sql AS 'SELECT 1';

DO $$
BEGIN
  ASSERT NOT has_table_privilege('anon', 'public.permissions_probe', 'SELECT, INSERT, UPDATE, DELETE')
     AND NOT has_table_privilege('authenticated', 'public.permissions_probe', 'SELECT, INSERT, UPDATE, DELETE'),
    'a new table must grant nothing to clients by default';
  ASSERT NOT has_function_privilege('anon', 'public.permissions_probe_fn()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.permissions_probe_fn()', 'EXECUTE'),
    'a new function must not be executable by clients by default';
END $$;

-- A user editing their own row straight through the API, without the Server Action.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'permissions@coronate.test', '{}', '{}', now(), now()),
  ('e2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'permissions2@coronate.test', '{}', '{}', now(), now());

UPDATE public.profiles SET display_name = 'Sofía Única' WHERE id = 'e2222222-2222-4222-8222-222222222222';

SELECT set_config('request.jwt.claims',
  '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  me      uuid := 'e1111111-1111-4111-8111-111111111111';
  storage text := '/storage/v1/object/public/avatars/e1111111-1111-4111-8111-111111111111/a.png';
  bad     text;
  ok      boolean;
BEGIN
  FOREACH bad IN ARRAY ARRAY[
    format('display_name = %L', repeat('x', 51)),
    format('display_name = %L', '   '),
    format('bio = %L', repeat('x', 281)),
    format('website = %L', repeat('x', 301)),
    format('instagram = %L', repeat('x', 301)),
    format('avatar_url = %L', 'https://evil.example/track.png'),
    format('avatar_url = %L', 'https://soaycjcluodfcitgsfsf.supabase.co.evil.example' || storage)
  ] LOOP
    ok := false;
    BEGIN
      EXECUTE format('UPDATE public.profiles SET %s WHERE id = %L', bad, me);
    EXCEPTION WHEN check_violation THEN ok := true; END;
    ASSERT ok, format('must be rejected: %s', left(bad, 60));
  END LOOP;

  -- Someone else's display name is taken, whatever the case, accents or outer spaces.
  FOREACH bad IN ARRAY ARRAY['Sofía Única', 'SOFIA UNICA', '  sofia única  '] LOOP
    ok := false;
    BEGIN
      UPDATE public.profiles SET display_name = bad WHERE id = me;
    EXCEPTION WHEN unique_violation THEN ok := true; END;
    ASSERT ok, format('a taken display name must be rejected: %s', bad);
  END LOOP;

  ok := false;
  BEGIN
    UPDATE public.profiles SET is_admin = true WHERE id = me;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'a user must not be able to set is_admin';

  UPDATE public.profiles
  SET display_name = repeat('x', 50), bio = repeat('x', 280), website = repeat('x', 300),
      avatar_url = 'https://soaycjcluodfcitgsfsf.supabase.co' || storage
  WHERE id = me;
  ASSERT FOUND, 'values at the limit must be accepted';

  UPDATE public.profiles SET avatar_url = 'http://127.0.0.1:54321' || storage WHERE id = me;
  ASSERT FOUND, 'an avatar from the local stack must be accepted';

  RAISE NOTICE 'permissions_test: all assertions passed';
END $$;

ROLLBACK;
