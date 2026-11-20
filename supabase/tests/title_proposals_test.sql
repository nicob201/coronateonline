-- supabase/tests/title_proposals_test.sql
-- Verifies migration 0015: propose_title (validation, normalization, one pending per author,
-- taken names, cost debit), RLS/grants on title_proposals, and review_title_proposal
-- (admin only, approve = title + free first crown with a clash-safe slug, reject = refund).
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/title_proposals_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): author a (20 welcome + 40 salary = 60 👑), poor p (20 👑), admin m.
-- 'Rey del Mate' is a taken name; slug 'senor-del-nandu' is taken by a differently named title.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'proposal_a@coronate.test', '{}', '{}', now(), now()),
  ('e2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'proposal_p@coronate.test', '{}', '{}', now(), now()),
  ('e3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'proposal_m@coronate.test', '{}', '{}', now(), now());
-- Fixture users finished onboarding; the extra one (no display name) did not.
UPDATE public.profiles SET display_name = 'Fixture ' || left(id::text, 8)
WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'proposal\_%@coronate.test');
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'proposal_unnamed@coronate.test', '{}', '{}', now(), now());

UPDATE profiles SET is_admin = true WHERE id = 'e3333333-3333-4333-8333-333333333333';
INSERT INTO coin_ledger (user_id, amount, reason) VALUES ('e1111111-1111-4111-8111-111111111111', 40, 'salary');

INSERT INTO titles (slug, name, emoji, description) VALUES
  ('proposal-taken', 'Rey del Mate', '🧉', 'x'),
  ('senor-del-nandu', 'Señor-del-Ñandú', '🐦', 'x');

-- Anon cannot propose at all.
SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.propose_title('Rey Anónimo', '👻', 'Sin cuenta');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'anon must not execute propose_title';
END $$;
RESET ROLE;

-- Author a: validation, normalization, debit, one pending, no direct writes, no reviewing.
SELECT set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  a  uuid := 'e1111111-1111-4111-8111-111111111111';
  r  public.title_proposals;
  ok boolean;
BEGIN
  ok := false;
  BEGIN PERFORM public.propose_title('  ab ', '👑', 'Muy corto');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Invalid name'; END;
  ASSERT ok, 'a 2-char trimmed name must be rejected';

  ok := false;
  BEGIN PERFORM public.propose_title('  rey DEL   mate ', '👑', 'Ya existe');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Title name taken'; END;
  ASSERT ok, 'an existing title name (case and spacing aside) must be rejected';

  ok := false;
  BEGIN PERFORM public.propose_title('Rey Sin Emoji', '  ', 'Sin emoji');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Invalid emoji'; END;
  ASSERT ok, 'a blank emoji must be rejected';

  ok := false;
  BEGIN PERFORM public.propose_title('Rey Mudo', '🤐', ' x ');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Invalid description'; END;
  ASSERT ok, 'a 1-char description must be rejected';

  ASSERT public.coin_balance(a) = 60, 'rejections must not move coins';

  r := public.propose_title('  Señor   del Ñandú ', ' 🐦 ', 'El   dueño del monte');
  ASSERT r.name = 'Señor del Ñandú' AND r.emoji = '🐦' AND r.description = 'El dueño del monte',
    format('fields must be trimmed and collapsed, got %s', r);
  ASSERT r.status = 'pending' AND r.cost = 30 AND r.user_id = a AND r.title_id IS NULL,
    format('new proposal wrong: %s', r);
  ASSERT public.coin_balance(a) = 30,
    format('author: expected 60 - 30 = 30, got %s', public.coin_balance(a));

  ok := false;
  BEGIN PERFORM public.propose_title('Conde del Choripán', '🥩', 'Otro más');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Proposal already pending'; END;
  ASSERT ok, 'a second pending proposal must be rejected';

  ok := false;
  BEGIN PERFORM public.review_title_proposal(r.id, true);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Not authorized'; END;
  ASSERT ok, 'a non-admin must not review';

  ok := false;
  BEGIN
    INSERT INTO public.title_proposals (user_id, name, emoji, description, cost)
    VALUES (a, 'Rey Gratis', '🆓', 'Sin pagar', 30);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'clients must not insert proposals directly';

  ok := false;
  BEGIN UPDATE public.title_proposals SET status = 'approved' WHERE id = r.id;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'clients must not update proposals directly';

  ASSERT (SELECT count(*) FROM public.title_proposals) = 1, 'the author sees their own proposal';
END $$;
RESET ROLE;

-- Poor p: a pending proposal's name is taken (checked before the balance); a's proposal is hidden.
SELECT set_config('request.jwt.claims', '{"sub":"e2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ok boolean;
BEGIN
  ok := false;
  BEGIN PERFORM public.propose_title('SEÑOR DEL ÑANDÚ', '🐦', 'Copia');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Title name taken'; END;
  ASSERT ok, 'a name pending in someone else''s proposal must be rejected';

  ok := false;
  BEGIN PERFORM public.propose_title('Rey Pobre', '🪙', 'No me alcanza');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Insufficient balance'; END;
  ASSERT ok, '20 👑 must not cover a 30 👑 proposal';

  ASSERT (SELECT count(*) FROM public.title_proposals) = 0, 'other authors'' proposals must be hidden';
END $$;
RESET ROLE;

-- Admin m: sees it, approves it (clash-safe slug, free first crown), cannot review twice.
SELECT set_config('request.jwt.claims', '{"sub":"e3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  a  uuid := 'e1111111-1111-4111-8111-111111111111';
  id uuid;
  r  public.title_proposals;
  t  public.titles;
  ok boolean;
BEGIN
  SELECT p.id INTO id FROM public.title_proposals p WHERE p.name = 'Señor del Ñandú';
  ASSERT id IS NOT NULL, 'admins see every proposal';

  r := public.review_title_proposal(id, true);
  ASSERT r.status = 'approved' AND r.title_id IS NOT NULL AND r.reviewed_at IS NOT NULL,
    format('approved proposal wrong: %s', r);

  SELECT * INTO t FROM public.titles WHERE titles.id = r.title_id;
  ASSERT t.slug = 'senor-del-nandu-2', format('expected slug senor-del-nandu-2, got %s', t.slug);
  ASSERT t.name = 'Señor del Ñandú' AND t.emoji = '🐦' AND t.description = 'El dueño del monte',
    format('title fields wrong: %s', t);
  ASSERT t.created_by = a, format('the title must record its creator (0016), got %s', t.created_by);
  ASSERT (SELECT user_id = a AND price_paid = 1 AND dethroned_user_id IS NULL
          FROM public.reigns WHERE title_id = t.id AND ended_at IS NULL),
    'the author must hold the new title at the base price';

  ok := false;
  BEGIN PERFORM public.review_title_proposal(id, false);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Proposal already reviewed'; END;
  ASSERT ok, 'a reviewed proposal must not be reviewed again';

  ok := false;
  BEGIN PERFORM public.review_title_proposal(gen_random_uuid(), true);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Proposal not found'; END;
  ASSERT ok, 'an unknown proposal must be rejected';
END $$;
RESET ROLE;

-- Author a: approval cost nothing extra; a new proposal spends the last 30 👑.
SELECT set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT public.coin_balance('e1111111-1111-4111-8111-111111111111') = 30, 'approval must not charge again';
  PERFORM public.propose_title('Conde del Choripán', '🥩', 'Señor feudal del pan con chori');
  ASSERT public.coin_balance('e1111111-1111-4111-8111-111111111111') = 0, 'exact balance covers a proposal';
END $$;
RESET ROLE;

-- Admin m rejects it.
SELECT set_config('request.jwt.claims', '{"sub":"e3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r public.title_proposals;
BEGIN
  r := public.review_title_proposal(
    (SELECT id FROM public.title_proposals WHERE name = 'Conde del Choripán'), false);
  ASSERT r.status = 'rejected' AND r.title_id IS NULL AND r.reviewed_at IS NOT NULL,
    format('rejected proposal wrong: %s', r);
  ASSERT NOT EXISTS (SELECT 1 FROM public.titles WHERE name = 'Conde del Choripán'),
    'a rejected proposal must not publish a title';
END $$;
RESET ROLE;

DO $$
DECLARE
  a  uuid := 'e1111111-1111-4111-8111-111111111111';
  ok boolean := false;
BEGIN
  ASSERT public.coin_balance(a) = 30,
    format('rejection must refund the full cost: expected 30, got %s', public.coin_balance(a));
  ASSERT (SELECT count(*) FROM public.coin_ledger WHERE user_id = a AND reason = 'proposal_refund' AND amount = 30) = 1,
    'exactly one +30 refund row';

  BEGIN INSERT INTO public.coin_ledger (user_id, amount, reason) VALUES (a, 5, 'proposal');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  ASSERT ok, 'a proposal ledger row must be a debit';

  ASSERT (SELECT creator_username FROM public.titles_priced WHERE name = 'Señor del Ñandú')
         = (SELECT username FROM public.profiles WHERE id = a),
    'titles_priced must expose the creator of a community title';
  ASSERT (SELECT created_by IS NULL AND creator_username IS NULL
          FROM public.titles_priced WHERE name = 'Rey del Mate'),
    'a seeded title has no creator';

  RAISE NOTICE 'title_proposals_test: all assertions passed';
END $$;

-- A profile without a display name is rejected before anything else happens.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"e4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.propose_title('Titulo Valido', '👑', 'Una descripcion valida');
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Profile incomplete'; END;
  ASSERT ok, 'a profile without a display name must be rejected';
END $$;

ROLLBACK;
