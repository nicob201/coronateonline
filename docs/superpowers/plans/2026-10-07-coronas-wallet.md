# Coronas Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rescale all money from ARS to Coronas (1 👑 = $1.000) and add a ledger-backed wallet with a 20 👑 welcome grant, shown in the header and on `/perfil`.

**Architecture:** One migration (`0006_coronas.sql`) divides stored amounts by 1000, rewrites the pricing/claim functions to unit steps, and adds `coin_ledger` + `coin_balance()` + a welcome-grant trigger on `profiles`. The app swaps `formatARS` for `formatCoronas`, moves constants to 1, and reads the balance through a new `wallet.server.ts` service.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Postgres 17, RLS, plpgsql), Zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-coronas-wallet-design.md`

## Global Constraints

- 1 👑 = $1.000. Base price **1**, minimum increment **1**, amounts are positive integers (no multiple-of-1000 rule anywhere).
- Pricing behaviour unchanged: every effective price after the migration equals the old one ÷ 1000.
- Welcome grant: **+20 👑**, reason `'welcome'`, at most once per user (unique partial index).
- Balance is `coin_balance(p_user_id)` = `COALESCE(SUM(amount), 0)` — the only formula; never a stored column.
- `coin_ledger`: RLS owner-only `SELECT`; no `INSERT/UPDATE/DELETE` for `anon`/`authenticated`.
- Locale: every `toLocaleString` / `toLocaleDateString` passes `'es-AR'`. UI copy Spanish (AR); code, identifiers, comments English.
- No `any`, no `as X` on Supabase responses; row types come from `@/types` / generated `database.types.ts`.
- One short single-line English comment before each exported function.
- No new dependencies.
- Commits: conventional style (`feat:`/`fix:`/`chore:`/`docs:`), **no** Co-Authored-By or "Generated with" lines.

## Environment (read once)

- Local stack: `npx supabase start` (Docker running; if ports clash, `npx supabase stop --project-id docuauto`). Local DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- `psql` is not on PATH: `export PATH=/opt/homebrew/opt/libpq/bin:$PATH` in every shell that runs it.
- Remote (shared dev + live demo): `set -a && . ./.env.local && set +a` exposes `$SUPABASE_DB_URL`. **Never** `db push` to remote before Task 5.
- Shorthands used below: `LOCAL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`; `SCRATCH` = the session scratchpad directory (not committed).

## Review Focus

1. A failing `coin_balance` call in the header (Vercel preview running new code against the not-yet-migrated DB, or a transient error) must not 500 every page — the chip just disappears. → Task 3, Step 7.
2. A signed-in user calling `coin_balance` with someone else's id gets 0, and cannot insert ledger rows. → Task 1, Step 1 (`coronas_test.sql`).
3. After the migration every held title's effective price is exactly old ÷ 1000, and pending claims keep proportional amounts. → Task 1, Step 5 (before/after snapshot).
4. Non-integer or non-positive amounts ("5.5", "0", "-3") are rejected by the dethrone schema; "5500" is now a valid amount. → Task 2, Step 1.
5. Re-running the seed or the backfill never grants a second welcome. → Task 1, Step 1 (duplicate insert rejected) + Step 7 (`db reset` re-seeds cleanly).

---

### Task 1: Migration 0006 — rescale + coin ledger (DB)

**Files:**
- Create: `supabase/migrations/0006_coronas.sql`
- Create: `supabase/tests/coronas_test.sql`
- Modify: `supabase/tests/pricing_test.sql` (new scale)
- Modify: `supabase/seed.sql:41-47` (reign prices ÷ 1000)
- Modify: `package.json` (`test:sql`, `update-types`)
- Modify: `.env.example` (document `SUPABASE_DB_URL`)
- Regenerate: `src/types/database.types.ts`

**Interfaces:**
- Produces (SQL): table `public.coin_ledger(id uuid, user_id uuid, amount integer, reason text, created_at timestamptz)`; function `public.coin_balance(p_user_id uuid) RETURNS integer` (EXECUTE for `authenticated`); trigger `on_profile_created_grant_welcome` on `profiles`.
- Produces (TS, generated): `Database["public"]["Tables"]["coin_ledger"]["Row"]`, `Database["public"]["Functions"]["coin_balance"]` with `Args: { p_user_id: string }`, `Returns: number`.
- RPC error strings after this task: `'Amount must be positive'`, `'Amount must be at least %'` (no more "multiple of 1000" / "Minimum claim").

- [ ] **Step 1: Write the failing SQL test `supabase/tests/coronas_test.sql`**

```sql
-- supabase/tests/coronas_test.sql
-- Verifies migration 0006: welcome grant, one-welcome rule, balance + RLS, unit claim increment.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/coronas_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): two users through the real signup trigger chain + one held title.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'coronas_u@coronate.test', '{}', '{}', now(), now()),
  ('c2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'coronas_v@coronate.test', '{}', '{}', now(), now());

INSERT INTO titles (id, slug, name, emoji, description)
  VALUES ('c3333333-3333-4333-8333-333333333333', 'coronas-test', 'T', '👑', 'x');

-- Held by v at 10 👑, started now (inside grace) -> current price 10, next valid claim 11.
INSERT INTO reigns (title_id, user_id, price_paid, started_at)
  VALUES ('c3333333-3333-4333-8333-333333333333', 'c2222222-2222-4222-8222-222222222222', 10, now());

DO $$
DECLARE
  u  uuid := 'c1111111-1111-4111-8111-111111111111';
  ok boolean;
BEGIN
  ASSERT public.coin_balance(u) = 20,
    format('welcome: expected 20, got %s', public.coin_balance(u));
  ASSERT public.coin_balance(gen_random_uuid()) = 0, 'no ledger rows: balance must be 0';

  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason) VALUES (u, 20, 'welcome');
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  ASSERT ok, 'a second welcome grant must be rejected';

  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason) VALUES (u, 0, 'welcome');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'a zero-amount movement must be rejected';
END $$;

-- Act as u: an authenticated client.
SELECT set_config('request.jwt.claims',
  '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  ok boolean;
BEGIN
  ASSERT public.coin_balance('c1111111-1111-4111-8111-111111111111') = 20,
    'owner must see their own balance';
  ASSERT public.coin_balance('c2222222-2222-4222-8222-222222222222') = 0,
    'RLS: another user''s balance must read as 0';

  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason)
      VALUES ('c1111111-1111-4111-8111-111111111111', 5, 'welcome');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'clients must not write the ledger';

  ok := false;
  BEGIN
    PERFORM public.create_claim('c3333333-3333-4333-8333-333333333333', 10);
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  ASSERT ok, 'a claim at the current price (10) must be rejected';

  PERFORM public.create_claim('c3333333-3333-4333-8333-333333333333', 11);

  RAISE NOTICE 'coronas_test: all assertions passed';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Rewrite `supabase/tests/pricing_test.sql` at the new scale**

Change exactly these lines (everything else stays):

| Old | New |
|---|---|
| `peak_floor_fraction = 0.25, peak_window_days = 90, activity_floor_unit = 2000` | `… activity_floor_unit = 2` |
| `VALUES (t_held, u1, 50000, now() - interval '1 day');` | `… 50, …` |
| `ASSERT p = 50000, format('within grace: expected 50000, got %s', p);` | `ASSERT p = 50, format('within grace: expected 50, got %s', p);` |
| `-- Case 2: after grace (held 10 days) -> 50000 * 0.993^7, rounded to nearest 1000` | `-- Case 2: after grace (held 10 days) -> 50 * 0.993^7 = 47.6, rounded to 48` |
| `ASSERT p = 48000, format('after grace 10d: expected 48000, got %s', p);` | `ASSERT p = 48, format('after grace 10d: expected 48, got %s', p);` |
| `ASSERT title_current_price(t_held) <= 48000,` / `format('monotonic: 40d (%s) must be <= 10d (48000)', …)` | `<= 48` / `'monotonic: 40d (%s) must be <= 10d (48)'` |
| `-- Case 5: unclaimed title -> NULL price, floor == 1000` | `… floor == 1` |
| `ASSERT title_price_floor(t_none) = 1000, 'unclaimed: floor must be 1000';` | `= 1, 'unclaimed: floor must be 1'` |
| `--   Past reign at 200000 within 90d; …` | `--   Past reign at 200 within 90d; …` |
| `VALUES (t_peak, u1, 200000, …)` / `VALUES (t_peak, u1, 60000, …)` | `200` / `60` |
| `ASSERT f = 50000, format('peak floor: expected 25%% of 200000 = 50000, got %s', f);` | `ASSERT f = 50, format('peak floor: expected 25%% of 200 = 50, got %s', f);` |
| `ASSERT p = 50000, format('peak-floored price: expected 50000, got %s', p);` | `ASSERT p = 50, format('peak-floored price: expected 50, got %s', p);` |
| `-- Case 4: … -> 2000 * 2 = 4000;` / `--   peak within 90d is only 4000; …` | `-> 2 * 2 = 4;` / `--   peak within 90d is only 4; …` |
| `(t_act, u1, 3000, …)`, `(t_act, u1, 4000, …)`, `VALUES (t_act, u1, 5000, …)` | `3`, `4`, `5` |
| `ASSERT f = 4000, format('activity floor: expected 2000*2 = 4000, got %s', f);` | `ASSERT f = 4, format('activity floor: expected 2*2 = 4, got %s', f);` |
| `ASSERT title_current_price(t_act) = 4000,` / `format('activity-floored price: expected 4000, got %s', …)` | `= 4` / `'… expected 4, got %s'` |

Also change the header comment line `-- Verifies the pricing functions from migration 0004.` → `-- Verifies the pricing functions (migration 0004, rescaled to Coronas in 0006).`

- [ ] **Step 3: Point `test:sql` at both files and `update-types` at the local stack**

In `package.json`:

```json
"test:sql": "psql \"$SUPABASE_DB_URL\" -v ON_ERROR_STOP=1 -f supabase/tests/pricing_test.sql -f supabase/tests/coronas_test.sql",
"update-types": "npx supabase gen types typescript --local > src/types/database.types.ts"
```

(`--linked` returns 403: the CLI is logged into another account. Local types match remote because both run the same migrations.)

In `.env.example`, append:

```
# CLI/scripts only (supabase db push --db-url, npm run test:sql) — never read by the app
SUPABASE_DB_URL=postgresql://postgres.your-project-ref:your-db-password@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

- [ ] **Step 4: Run both SQL tests against local to verify they fail**

```bash
export PATH=/opt/homebrew/opt/libpq/bin:$PATH
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:sql
```

Expected: FAIL — `pricing_test` fails `within grace: expected 50, got …` or the floor assertion (old functions still round to 1000).

- [ ] **Step 5: Snapshot local prices before migrating (Review Focus 3)**

```bash
psql "$LOCAL" -At -c "select slug, current_price, price_floor from titles_priced order by slug" > "$SCRATCH/prices-before.txt"
psql "$LOCAL" -At -c "select id, amount from claims order by id" > "$SCRATCH/claims-before.txt"
cat "$SCRATCH/prices-before.txt"
```


- [ ] **Step 6: Write `supabase/migrations/0006_coronas.sql`**

```sql
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
```

Then the effective price (same body as 0004; only the final rounding changes from "nearest 1000" to "nearest 1"):

```sql
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
```

Then the claim RPCs (same as 0005 with unit steps; signatures unchanged, so `CREATE OR REPLACE` keeps the existing grants — no `DROP FUNCTION`). An unclaimed title's minimum (1) is already guaranteed by the positive check, so the old "Minimum claim" branch goes away:

```sql
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
```

Then append the wallet section:

```sql
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
```

- [ ] **Step 7: Rescale the seed reigns in `supabase/seed.sql`**

In the `INSERT INTO reigns (id, title_id, user_id, price_paid, …)` block change the prices: `10000`→`10`, `30000`→`30`, `52000`→`52`, `24000`→`24`, `45000`→`45`, ` 6000`→` 6`, `13000`→`13`. Update the file header comment's "dev fixtures" line only if it mentions ARS (it does not today).

- [ ] **Step 8: Apply to local (upgrade path) and verify the rescale**

```bash
npx supabase migration up --local
psql "$LOCAL" -At -c "select slug, current_price, price_floor from titles_priced order by slug"
psql "$LOCAL" -At -c "select id, amount from claims order by id"
psql "$LOCAL" -At -c "select count(*), count(distinct user_id), sum(amount) from coin_ledger"
psql "$LOCAL" -At -c "select count(*) from profiles"
```

Expected: every `current_price` / `price_floor` equals the Step 5 value ÷ 1000 (NULL stays NULL); claim amounts ÷ 1000; ledger rows = distinct users = profile count, sum = 20 × that count.

- [ ] **Step 9: Run the SQL tests to verify they pass**

```bash
SUPABASE_DB_URL="$LOCAL" npm run test:sql
```

Expected: `NOTICE: pricing_test: all assertions passed` and `NOTICE: coronas_test: all assertions passed`, both followed by `ROLLBACK`, exit 0.

- [ ] **Step 10: Fresh path — reset local (migrations + seed) and re-run (Review Focus 5)**

```bash
npx supabase db reset --local
psql "$LOCAL" -At -c "select (select count(*) from profiles), (select count(*) from coin_ledger where reason='welcome')"
psql "$LOCAL" -At -c "select slug, current_price from titles_priced where current_price is not null order by slug"
psql "$LOCAL" -f supabase/seed.sql > /dev/null
psql "$LOCAL" -At -c "select count(*) from coin_ledger where reason='welcome'"
SUPABASE_DB_URL="$LOCAL" npm run test:sql
```

Expected: welcome count = profile count (4 seed users) before and after re-running the seed; prices are small integers (e.g. `rey-de-cordoba|52` within grace or its decayed value); tests pass.

- [ ] **Step 11: Regenerate types**

```bash
npm run update-types
git diff --stat src/types/database.types.ts
```

Expected: the diff adds `coin_ledger` (Row/Insert/Update) and `coin_balance` under Functions; nothing else changes except possibly `grant_welcome_coins`.

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/0006_coronas.sql supabase/tests/coronas_test.sql supabase/tests/pricing_test.sql supabase/seed.sql package.json .env.example src/types/database.types.ts
git commit -m "feat: migration 0006 — rescale to Coronas and add the coin ledger"
```

---

### Task 2: App rescale to Coronas

**Files:**
- Modify: `src/lib/format.ts` (`formatARS` → `formatCoronas`)
- Modify: `src/lib/titles.ts` (constants, rarity thresholds, header comment)
- Modify: `src/features/dethrone/schemas/dethrone.schema.ts`
- Modify: `src/features/dethrone/components/dethrone-form.tsx` (`step`)
- Modify: `src/actions/claims.ts` (`translateRpcError`)
- Modify: `src/services/titles.server.ts:74` (`?? 1000` → `?? BASE_PRICE`)
- Modify (rename call sites): `src/app/t/[slug]/page.tsx`, `src/app/t/[slug]/opengraph-image.tsx`, `src/components/{coronation-ticker,longest-reigns,reign-history,title-card,trending-title}.tsx`, `src/features/admin/components/pending-claims-table.tsx`, `src/features/dethrone/components/payment-instructions.tsx`, `src/features/profile/components/profile-reign-list.tsx`
- Test: `src/lib/__tests__/format.test.ts` (create), `src/lib/__tests__/titles.test.ts`, `src/features/dethrone/schemas/__tests__/dethrone.schema.test.ts`, `src/actions/__tests__/claims.test.ts`, plus fixture rescale in `src/services/__tests__/{titles,claims,profiles}.server.test.ts`

**Interfaces:**
- Consumes: RPC error strings from Task 1 (`'Amount must be positive'`, `'Amount must be at least %'`).
- Produces: `formatCoronas(amount: number): string` in `@/lib/format` → `"1.250 👑"`; `BASE_PRICE = 1`, `MIN_INCREMENT = 1` in `@/lib/titles`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatCoronas } from "../format";

describe("formatCoronas", () => {
  it("formats an integer with the crown symbol", () => {
    expect(formatCoronas(40)).toBe("40 👑");
  });

  it("groups thousands the es-AR way", () => {
    expect(formatCoronas(1250)).toBe("1.250 👑");
  });

  it("keeps the sign of a debit", () => {
    expect(formatCoronas(-5)).toBe("-5 👑");
  });
});
```

Append to `src/lib/__tests__/titles.test.ts` (and add `minClaimAmount, rarity` to its import from `"../titles"`):

```ts
describe("minClaimAmount", () => {
  it("is the base price (1) for an unclaimed title", () => {
    expect(minClaimAmount(null)).toBe(1);
  });

  it("is current price + 1 for a held title", () => {
    expect(minClaimAmount(39)).toBe(40);
  });
});

describe("rarity", () => {
  it("is legendario from 50", () => {
    expect(rarity(50)).toBe("legendario");
  });

  it("is epico from 20 up to 49", () => {
    expect(rarity(20)).toBe("epico");
    expect(rarity(49)).toBe("epico");
  });

  it("is comun below 20 and when unclaimed", () => {
    expect(rarity(19)).toBe("comun");
    expect(rarity(null)).toBe("comun");
  });
});
```

In `src/features/dethrone/schemas/__tests__/dethrone.schema.test.ts`: set `amount: "5"` in `validInput`, expect `toBe(5)` in the first test, and replace the "not a multiple of 1000" test with:

```ts
  it("accepts any positive integer amount", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "5500" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-integer amount", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "5.5" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "-3" });
    expect(result.success).toBe(false);
  });
```

In `src/actions/__tests__/claims.test.ts`: `fd.set("amount", "5")`, `amount: 5` in `claimRow`, rename the test `"rejects an amount that is not a multiple of 1000"` → `"rejects a non-integer amount"` using `form({ amount: "5.5" })`, and change `"Amount must be at least 6000"` → `"Amount must be at least 6"`. Add:

```ts
  it("maps a non-positive amount RPC error to a Spanish message", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        user: { id: "u1" },
        rpc: { data: null, error: { message: "Amount must be positive" } },
      }),
    );
    const result = await destronar(null, form());
    expect(result).toEqual({ success: false, error: "Monto inválido." });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — `format.test.ts` cannot import `formatCoronas`; `minClaimAmount(null)` returns 1000; schema accepts nothing below 1000-multiples; "Amount must be positive" maps to the generic message.

- [ ] **Step 3: Implement**

`src/lib/format.ts` — replace `formatARS`:

```ts
// Formats an integer amount of Coronas as "1.250 👑" (es-AR grouping).
export function formatCoronas(amount: number): string {
  return `${amount.toLocaleString("es-AR")} 👑`;
}
```

`src/lib/titles.ts` — header comment `// Domain constants and pure helpers for titles. Money is integer Coronas (👑).`; `BASE_PRICE = 1`; `MIN_INCREMENT = 1`; in `rarity`, `price >= 50` → legendario, `price >= 20` → epico.

`src/features/dethrone/schemas/dethrone.schema.ts` — the amount becomes:

```ts
  amount: z.coerce.number().int().positive(),
```

`src/features/dethrone/components/dethrone-form.tsx` — `step={1}`.

`src/actions/claims.ts` — in `translateRpcError` replace

```ts
  if (message.includes("multiple of 1000") || message.includes("Minimum claim")) {
    return "Monto inválido.";
  }
```

with

```ts
  if (message.includes("must be positive")) return "Monto inválido.";
```

`src/services/titles.server.ts:74` — `priceFloor: row.price_floor ?? BASE_PRICE,` (`BASE_PRICE` is already imported).

Rename every call site and import:

```bash
grep -rl formatARS src | xargs sed -i '' 's/formatARS/formatCoronas/g'
grep -rn "formatARS" src   # expected: no output
```

- [ ] **Step 4: Rescale money fixtures in the remaining service tests**

Divide every money literal by 1000 so fixtures read as Coronas (rarity thresholds changed, so stale fixtures would assert the wrong tier):
- `src/services/__tests__/titles.server.test.ts`: `48000`→`48`, `13000`→`13`, `50000`→`50`, `1000`→`1`, `20000`→`20`.
- `src/services/__tests__/claims.server.test.ts`: `5000`→`5`, `"Amount must be at least 6000"`→`"… 6"`, `44000`→`44`, `47000`→`47`.
- `src/services/__tests__/profiles.server.test.ts`: `5000`→`5`, `2000`→`2`, `3000`→`3`.
- `src/lib/__tests__/titles.test.ts`: `pricePaid: 5000` → `5`.

Edit by hand (a blind `sed s/5000/5/` would corrupt e.g. `15000`). Then confirm nothing is left:

```bash
grep -rnE '[0-9]000\b' src --include='*.test.ts' | grep -v 'lib/__tests__/auth.test.ts\|2_100_000'
```

Expected: no output.

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all tests PASS; typecheck clean; lint shows only the pre-existing custom-font `<link>` warning.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: show prices in Coronas (1 👑 = \$1.000)"
```

---

### Task 3: Wallet service + header chip + `/perfil` card

**Files:**
- Create: `src/services/wallet.server.ts`
- Create: `src/services/__tests__/wallet.server.test.ts`
- Create: `src/features/profile/components/wallet-card.tsx`
- Modify: `src/types/index.ts` (add `CoinMovement`)
- Modify: `src/components/site-header.tsx`
- Modify: `src/app/perfil/page.tsx`

**Interfaces:**
- Consumes: `coin_ledger` row type and `coin_balance` RPC (Task 1); `formatCoronas` (Task 2).
- Produces: `getBalance(supabase: SupabaseServerClient, userId: string): Promise<number>`; `getRecentMovements(supabase: SupabaseServerClient, userId: string, limit?: number): Promise<CoinMovement[]>`; `type CoinMovement = Pick<CoinLedgerRow, "id" | "amount" | "reason" | "created_at">`; `<WalletCard balance movements />`.

- [ ] **Step 1: Add the domain type to `src/types/index.ts`**

After the `Claim` export:

```ts
export type CoinLedgerRow = Database["public"]["Tables"]["coin_ledger"]["Row"];
```

At the end, before `export type { Database };`:

```ts
// One wallet movement shown in the user's "Billetera".
export type CoinMovement = Pick<CoinLedgerRow, "id" | "amount" | "reason" | "created_at">;
```

- [ ] **Step 2: Write the failing service test `src/services/__tests__/wallet.server.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { getBalance, getRecentMovements } from "../wallet.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const movement = {
  id: "m1",
  amount: 20,
  reason: "welcome",
  created_at: "2026-10-07T00:00:00Z",
};

describe("getBalance", () => {
  it("returns the balance computed by the coin_balance RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: 20, error: null } });
    await expect(getBalance(supabase, "u1")).resolves.toBe(20);
    expect(supabase.rpc).toHaveBeenCalledWith("coin_balance", { p_user_id: "u1" });
  });

  it("throws when the RPC fails", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: { message: "boom" } } });
    await expect(getBalance(supabase, "u1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("getRecentMovements", () => {
  it("returns the user's newest movements first, capped at the limit", async () => {
    const supabase = createSupabaseMock({
      queryByTable: { coin_ledger: { data: [movement], error: null } },
    });
    await expect(getRecentMovements(supabase, "u1")).resolves.toEqual([movement]);
    // The mock's builder is shared per table; select() just exposes the typed filter methods.
    const builder = supabase.from("coin_ledger").select();
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(10);
  });

  it("throws when the query fails", async () => {
    const supabase = createSupabaseMock({
      queryByTable: { coin_ledger: { data: null, error: { message: "boom" } } },
    });
    await expect(getRecentMovements(supabase, "u1")).rejects.toMatchObject({ message: "boom" });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/services/__tests__/wallet.server.test.ts`
Expected: FAIL — cannot resolve `../wallet.server`.

- [ ] **Step 4: Implement `src/services/wallet.server.ts`**

```ts
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { CoinMovement } from "@/types";

// Returns the user's Coronas balance, derived in Postgres from their ledger.
export async function getBalance(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("coin_balance", { p_user_id: userId });
  if (error) throw error;
  return data;
}

// Fetches the user's most recent wallet movements, newest first.
export async function getRecentMovements(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 10,
): Promise<CoinMovement[]> {
  const { data, error } = await supabase
    .from("coin_ledger")
    .select("id, amount, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/services/__tests__/wallet.server.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 6: Create `src/features/profile/components/wallet-card.tsx`**

```tsx
import { formatCoronas } from "@/lib/format";
import type { CoinMovement } from "@/types";

const REASON_LABELS: Record<string, string> = {
  welcome: "Saldo inicial",
};

// Shows the user's Coronas balance and their latest wallet movements.
export function WalletCard({
  balance,
  movements,
}: {
  balance: number;
  movements: CoinMovement[];
}) {
  return (
    <section className="glass-panel rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant">BILLETERA</h2>
        <span className="text-title-md font-title-md text-tertiary">{formatCoronas(balance)}</span>
      </div>
      <ul className="flex flex-col divide-y divide-outline-variant/20">
        {movements.map((m) => (
          <li key={m.id} className="flex items-center gap-4 py-2 text-body-sm font-body-sm">
            <span className="flex-1 text-on-surface">{REASON_LABELS[m.reason] ?? m.reason}</span>
            <span className="text-on-surface-variant">
              {new Date(m.created_at).toLocaleDateString("es-AR")}
            </span>
            <span className={m.amount > 0 ? "text-tertiary" : "text-error"}>
              {m.amount > 0 ? "+" : ""}
              {formatCoronas(m.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Wire it into `src/app/perfil/page.tsx`: import `getBalance, getRecentMovements` from `@/services/wallet.server` and `WalletCard` from `@/features/profile/components/wallet-card`; replace the single `getLatestDethrone` await with

```tsx
  const [dethroneNotice, balance, movements] = await Promise.all([
    getLatestDethrone(supabase, user.id),
    getBalance(supabase, user.id),
    getRecentMovements(supabase, user.id),
  ]);
```

and render `<WalletCard balance={balance} movements={movements} />` between the heading row and `<ProfileEditForm …/>`.

- [ ] **Step 7: Header chip, degrading safely (Review Focus 1)**

In `src/components/site-header.tsx`: import `getBalance` from `@/services/wallet.server` and `formatCoronas` from `@/lib/format`. Replace the `if (user) { … }` block with:

```tsx
  let username: string | null = null;
  let balance: number | null = null;
  if (user) {
    // A failed balance read hides the chip instead of breaking every page.
    const [profile, coins] = await Promise.all([
      getOwnProfile(supabase, user.id),
      getBalance(supabase, user.id).catch(() => null),
    ]);
    username = profile?.username ?? null;
    balance = coins;
  }
```

Inside the `username ? (<> … </>)` fragment, as its first child (before the `@{username}` link):

```tsx
            {balance !== null && (
              <Link
                href="/perfil"
                aria-label={`Saldo: ${formatCoronas(balance)}`}
                className="px-3 py-1 rounded-full border border-tertiary/40 text-label-caps font-label-caps text-tertiary hover:bg-tertiary/10 transition-colors whitespace-nowrap"
              >
                {formatCoronas(balance)}
              </Link>
            )}
```

Verify the degrade path against the **remote** DB, which does not have `coin_balance` yet:

```bash
npm run dev   # .env.local → remote, un-migrated
```

Log in as guest (`/login` → "Entrar como invitado"), open `/` and `/titulos`. Expected: pages render (no error page), no chip in the header. `/perfil` is expected to hit the error boundary here (its balance read throws by design) — that is fine until the migration lands. Stop the server.

- [ ] **Step 8: Verify against the local (migrated) stack**

```bash
npx supabase status -o env | grep -E 'ANON_KEY|API_URL'
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local ANON_KEY> npm run dev
```

Log in as guest. Expected: header chip `20 👑` on desktop and mobile width (360 px; use CDP device emulation for screenshots — see memory `headless-screenshots`), chip links to `/perfil`; `/perfil` shows "BILLETERA 20 👑" with one row `Saldo inicial · <today es-AR> · +20 👑`; `/titulos` and `/t/rey-de-cordoba` show prices like `52 👑` and "Destronar" minimum `53 👑`. Logged out: no chip.

- [ ] **Step 9: Run the full suite**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS / clean (pre-existing font warning only).

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat: Coronas wallet — balance chip in the header and Billetera on /perfil"
```

---

### Task 4: Docs — DESIGN.md v2, AGENTS.md, roadmap

**Files:**
- Modify: `docs/DESIGN.md`
- Modify: `AGENTS.md`
- Modify: `docs/ROADMAP.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: `docs/DESIGN.md` → v2**

- Title line: `# CoronaTeOnline — Design Spec (v2)`; date line: `*2026-08-23 — validation MVP. v2 2026-10-07 — Coronas (virtual currency) replace ARS; see docs/ROADMAP.md.*`
- §1 Product: users spend **Coronas (👑)**, a virtual currency, to hold titles; replace the "real money (ARS)" sentence and the validation hypothesis paragraph with: "Portfolio demo: a visitor plays in 30 seconds without paying. Every account starts with 20 👑 (guests included); buying Coronas with a sandbox checkout comes later (roadmap D28)."
- §2 Core mechanic: base price **1 👑**, dethrone at **current price + 1 👑**, amounts are positive integers. Price decay floor: `max(1 👑, 25% of the title's recent price peak, 2 👑 × dethrones in the last 30 days)`; "decays toward the 1 👑 base".
- §2 Dethrone flow: prepend "**Transitional (until roadmap D5):**" to the v1 manual-confirmation flow and add one line: "D5 replaces it with `dethrone_with_coins`, an atomic RPC that debits the challenger's Coronas, transfers the crown and compensates the dethroned holder."
- §3 Domain model: `reigns.price_paid` and `claims.amount` are integer Coronas; "Money integrity enforced by CHECK constraints (positive)". Add a fifth table:

```markdown
### `coin_ledger` (the wallet — append-only)
- `id`, `user_id` (FK → profiles), `amount` (signed integer 👑: credit > 0, debit < 0), `reason` (`welcome` today; D5 adds `dethrone` / `dethroned`, D6 `salary`), `created_at`
- **Balance is derived**: `coin_balance(user_id)` = sum of the user's rows. Never stored.
- 20 👑 `welcome` row per profile, inserted by a trigger on `profiles`; a unique partial index allows only one.
- RLS: owners read their own rows; no client writes — only `SECURITY DEFINER` code writes the ledger.
```

  and change "Four tables." to "Five tables."
- §5 Out of scope: drop the "Integrated payments (MP Checkout Pro + webhooks)" bullet (superseded by roadmap D28).

- [ ] **Step 2: `AGENTS.md`**

- Intro sentence: "…where users pay real money (ARS) to hold…" → "…where users spend Coronas (👑), a virtual currency, to hold…"; "Whoever pays the current price + minimum increment dethrones…" stays.
- Database bullet "Money is **integer ARS** (no decimals, no floats), always a multiple of 1000." → "Money is **integer Coronas (👑)** (no decimals, no floats), always positive. A user's balance is derived from `coin_ledger` via `coin_balance()` — never stored."

- [ ] **Step 3: `docs/ROADMAP.md`** — tick D4: `- [x] **D4** — …`.

- [ ] **Step 4: Check for leftover ARS references**

```bash
grep -rn "ARS\|multiple of 1000\|múltiplo de 1000" AGENTS.md docs/DESIGN.md README.md src supabase/migrations/0006_coronas.sql
```

Expected: no matches other than historical mentions inside DESIGN.md's v2 date line.

- [ ] **Step 5: Commit**

```bash
git add docs/DESIGN.md AGENTS.md docs/ROADMAP.md
git commit -m "docs: DESIGN.md v2 and AGENTS.md money rules in Coronas; roadmap D4 done"
```

---

### Task 5: Verify, PR, rollout

**Files:** none new.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full verification**

```bash
npm run verify
SUPABASE_DB_URL="$LOCAL" npm run test:sql
```

Expected: `All checks passed.` and both SQL NOTICEs.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/coronas-wallet
gh pr create --title "feat: Coronas wallet + rescale to 👑 (D4)" --body "$(cat <<'EOF'
## What
- **Rescale:** all money moves from ARS to Coronas, 1 👑 = $1.000 (migration `0006_coronas.sql`). Pricing behaves identically, ÷ 1000.
- **Wallet:** append-only `coin_ledger`; balance derived by `coin_balance()`, never stored. Every profile gets a 20 👑 welcome grant (trigger + backfill, one per user enforced by a unique partial index). Owner-only RLS, no client writes.
- **UI:** balance chip in the header, "Billetera" card on `/perfil`, prices shown as `40 👑`.
- **Docs:** `DESIGN.md` v2, `AGENTS.md` money rules, roadmap D4 ticked. Spec: `docs/superpowers/specs/2026-10-07-coronas-wallet-design.md`.

## Rollout
Migration 0006 is pushed to Supabase right before merging (shared DB: old code breaks on the new scale). Until D5, the manual payment screen shows amounts in 👑.

## Tests
Vitest (format, rarity/min claim, schema, wallet service, actions) + SQL (`pricing_test.sql` at the new scale, new `coronas_test.sql`: welcome grant, one-welcome rule, RLS, unit claim increment).
EOF
)"
gh pr checks --watch
```

Expected: CI green. Report the PR link to Nico.

- [ ] **Step 3: Preview check (Review Focus 1, real environment)**

Open the Vercel preview URL, log in as guest. Expected: home and `/titulos` render (prices show as "39.000 👑" because the remote DB is still in ARS — expected until rollout), no chip, no error page.

- [ ] **Step 4: Pre-rollout snapshot of the remote**

```bash
set -a && . ./.env.local && set +a
psql "$SUPABASE_DB_URL" -At -c "select slug, current_price from titles_priced where current_price is not null order by slug"
psql "$SUPABASE_DB_URL" -At -c "select status, count(*), sum(amount) from claims group by status"
npx supabase db push --db-url "$SUPABASE_DB_URL" --dry-run
```

Expected: dry-run lists only `0006_coronas.sql`.

- [ ] **Step 5: Rollout — coordinate with Nico**

Ask Nico to be ready to merge. Then:

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
psql "$SUPABASE_DB_URL" -At -c "select slug, current_price from titles_priced where current_price is not null order by slug"
psql "$SUPABASE_DB_URL" -At -c "select count(*) = (select count(*) from profiles) from coin_ledger where reason = 'welcome'"
```

Expected: prices = Step 4 values ÷ 1000; `t`. Tell Nico to merge now ("Create a merge commit").

- [ ] **Step 6: Post-deploy smoke check**

After Vercel deploys `main`: open https://coronateonline.vercel.app, guest login → chip `20 👑`, `/perfil` Billetera, title prices in 👑. Then `git switch main && git pull && git branch -d feat/coronas-wallet`.

- [ ] **Step 7: Update memory**

Update `roadmap-progress.md`: D4 done, next D5 (`dethrone_with_coins`); note `update-types` now uses `--local`.
