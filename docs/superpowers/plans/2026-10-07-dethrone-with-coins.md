# Dethrone with Coronas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dethroning spends Coronas through one atomic RPC (zero-sum to the dethroned holder, burned on unclaimed titles); the manual claim/payment/admin flow is retired; wallet movements are described; a demo banner is shown site-wide.

**Architecture:** Migration `0007_dethrone_with_coins.sql` drops `claims` and its RPCs, extends `coin_ledger` (`reign_id`, new reasons, sign rule) and adds `dethrone_with_coins`. The app replaces the claims service/action with `dethrone.server.ts` / `actions/dethrone.ts`, passes the viewer's balance to the dethrone form, maps joined ledger rows to labelled movements, and renders a `DemoBanner` in the root layout.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Postgres 17, RLS, plpgsql), Zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-dethrone-with-coins-design.md`

**Phases (Nico's working style — stop after each for a go-ahead):** P1 = Task 1 · P2 = Task 2 · P3 = Tasks 3–4 · P4 = Task 5.

## Global Constraints

- Zero-sum: the dethroned holder receives exactly `p_amount`; an unclaimed title only debits (burn).
- Minimum = `title_current_price + 1` when held, `1` when unclaimed; the challenger may offer more.
- Lock order inside the RPC: title row `FOR UPDATE`, then challenger `profiles` row `FOR UPDATE`.
- Ledger reasons: `welcome`, `dethrone` (negative), `dethroned` (positive). `reign_id` nullable, `ON DELETE SET NULL`, no "required" CHECK.
- RPC exception strings (the app maps them): `'Not authenticated'`, `'Amount must be positive'`, `'Message too long'`, `'Title not found'`, `'You already hold this title'`, `'Amount must be at least %'`, `'Insufficient balance'`.
- After a successful dethrone: `revalidatePath("/", "layout")`.
- Locale `'es-AR'` on every `toLocale*`; UI copy Spanish (AR); code/comments English; one-line comment before each exported function; no `any`, no `as X` on Supabase responses; no new dependencies.
- Commits: conventional style, **no** Co-Authored-By / "Generated with" lines.

## Environment (read once)

- Local stack running (`npx supabase start`; if ports clash, `npx supabase stop --project-id docuauto`). `LOCAL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`. `export PATH=/opt/homebrew/opt/libpq/bin:$PATH` for `psql`.
- `SCRATCH` = session scratchpad directory. The CDP driver from D4 (`$SCRATCH/cdp.mjs`) may need rebuilding — see memory `headless-screenshots`.
- Remote: `set -a && . ./.env.local && set +a` → `$SUPABASE_DB_URL`. **Never** push to remote before Task 5.

## Review Focus

1. Two challengers submit on the same title at the same instant → exactly one wins; the other gets "El monto no alcanza…" (a clean `'Amount must be at least %'`), never a unique-index 500. → Task 1, Step 7.
2. A balance exactly equal to the amount succeeds (balance ends at 0); one coin short is rejected server-side even if the browser check is bypassed. → Task 1, Step 1.
3. Deleting an account whose reigns are referenced by other users' ledger rows succeeds and leaves their balances unchanged. → Task 1, Step 1.
4. After dethroning, the challenger's header chip shows the new balance without a manual reload. → Task 2, Step 1 (`revalidatePath("/", "layout")` asserted) + Task 4, Step 4 (live check).
5. A whitespace-only coronation message is stored as NULL, not as blanks; a deleted counterpart shows as "alguien" in the wallet. → Task 1, Step 1 + Task 3, Step 1.

---

### Task 1: Migration 0007 — dethrone_with_coins (DB)

**Files:**
- Create: `supabase/migrations/0007_dethrone_with_coins.sql`
- Create: `supabase/tests/dethrone_test.sql`
- Modify: `supabase/tests/coronas_test.sql` (drop the `create_claim` part, add the welcome-invariant assert)
- Modify: `package.json` (`test:sql` runs three files)

**Interfaces:**
- Produces (SQL): `public.dethrone_with_coins(p_title_id uuid, p_amount integer, p_message text DEFAULT NULL) RETURNS public.reigns` (EXECUTE: `authenticated`); `coin_ledger.reign_id uuid NULL → reigns(id) ON DELETE SET NULL`; reasons `welcome | dethrone | dethroned`. `claims`, `create_claim`, `apply_claim`, `reject_claim` no longer exist.
- Note: generated TS types are **not** regenerated here (Task 2 does it together with deleting the claims code, so every commit typechecks).

- [ ] **Step 1: Write the failing SQL test `supabase/tests/dethrone_test.sql`**

```sql
-- supabase/tests/dethrone_test.sql
-- Verifies migration 0007: dethrone_with_coins (zero-sum transfer, burn on unclaimed titles,
-- rejections, exact-balance boundary) and that deleting an account keeps other balances intact.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dethrone_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): holder h and challenger c through the real signup trigger chain
-- (20 👑 each); t_held held by h at 10 (inside grace -> current 10, minimum 11); two free titles.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'dethrone_h@coronate.test', '{}', '{}', now(), now()),
  ('d2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'dethrone_c@coronate.test', '{}', '{}', now(), now());

INSERT INTO titles (id, slug, name, emoji, description) VALUES
  ('d3333333-3333-4333-8333-333333333333', 'dethrone-held',  'H',  '👑', 'x'),
  ('d4444444-4444-4444-8444-444444444444', 'dethrone-free',  'F',  '👑', 'x'),
  ('d5555555-5555-4555-8555-555555555555', 'dethrone-free2', 'F2', '👑', 'x');

INSERT INTO reigns (title_id, user_id, price_paid, started_at)
  VALUES ('d3333333-3333-4333-8333-333333333333', 'd1111111-1111-4111-8111-111111111111', 10, now());

-- Act as the challenger c.
SELECT set_config('request.jwt.claims',
  '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  c      uuid := 'd2222222-2222-4222-8222-222222222222';
  h      uuid := 'd1111111-1111-4111-8111-111111111111';
  t_held uuid := 'd3333333-3333-4333-8333-333333333333';
  t_free uuid := 'd4444444-4444-4444-8444-444444444444';
  t_fr2  uuid := 'd5555555-5555-4555-8555-555555555555';
  r      public.reigns;
  ok     boolean;
BEGIN
  -- Rejections: nothing may move.
  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 10);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Amount must be at least 11'; END;
  ASSERT ok, 'paying the current price (10) must be rejected with minimum 11';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 21);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Insufficient balance'; END;
  ASSERT ok, 'paying more than the balance (21 > 20) must be rejected';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 11, repeat('a', 81));
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Message too long'; END;
  ASSERT ok, 'an 81-char message must be rejected';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 0);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Amount must be positive'; END;
  ASSERT ok, 'a zero amount must be rejected';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(gen_random_uuid(), 5);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'Title not found'; END;
  ASSERT ok, 'an unknown title must be rejected';

  ASSERT public.coin_balance(c) = 20, 'rejections must not move coins';

  -- Held title: the crown moves, the message is trimmed, the challenger pays.
  r := public.dethrone_with_coins(t_held, 12, '  Llegó el nuevo rey  ');
  ASSERT r.user_id = c AND r.price_paid = 12 AND r.dethroned_user_id = h,
    format('new reign wrong: %s', r);
  ASSERT r.message = 'Llegó el nuevo rey', format('message must be trimmed, got %L', r.message);
  ASSERT public.coin_balance(c) = 8,
    format('challenger: expected 20 - 12 = 8, got %s', public.coin_balance(c));
  ASSERT (SELECT count(*) FROM public.reigns WHERE title_id = t_held AND ended_at IS NULL) = 1,
    'exactly one active reign';
  ASSERT (SELECT user_id FROM public.reigns WHERE title_id = t_held AND ended_at IS NULL) = c,
    'the crown must belong to the challenger';

  ok := false;
  BEGIN PERFORM public.dethrone_with_coins(t_held, 13);
  EXCEPTION WHEN raise_exception THEN ok := SQLERRM = 'You already hold this title'; END;
  ASSERT ok, 'dethroning yourself must be rejected';

  -- Unclaimed title, whitespace-only message -> NULL; only the debit (burn).
  r := public.dethrone_with_coins(t_free, 1, '   ');
  ASSERT r.dethroned_user_id IS NULL, 'unclaimed: no dethroned user';
  ASSERT r.message IS NULL, format('whitespace-only message must be NULL, got %L', r.message);
  ASSERT public.coin_balance(c) = 7,
    format('challenger: expected 8 - 1 = 7, got %s', public.coin_balance(c));

  -- Exact balance: paying all 7 succeeds and leaves 0.
  r := public.dethrone_with_coins(t_fr2, 7);
  ASSERT public.coin_balance(c) = 0,
    format('exact balance: expected 0, got %s', public.coin_balance(c));

  -- Clients still cannot write the ledger directly.
  ok := false;
  BEGIN
    INSERT INTO public.coin_ledger (user_id, amount, reason) VALUES (c, 100, 'dethroned');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'clients must not write the ledger';
END $$;

RESET ROLE;

DO $$
DECLARE
  c      uuid := 'd2222222-2222-4222-8222-222222222222';
  h      uuid := 'd1111111-1111-4111-8111-111111111111';
  t_held uuid := 'd3333333-3333-4333-8333-333333333333';
  t_free uuid := 'd4444444-4444-4444-8444-444444444444';
BEGIN
  -- Zero-sum: the dethroned holder got exactly what the challenger paid.
  ASSERT public.coin_balance(h) = 32,
    format('holder: expected 20 + 12 = 32, got %s', public.coin_balance(h));
  ASSERT (SELECT sum(l.amount) FROM public.coin_ledger l
          JOIN public.reigns r ON r.id = l.reign_id
          WHERE r.title_id = t_held AND r.ended_at IS NULL) = 0,
    'a held-title dethrone must net to zero across both ledger rows';

  -- Burn: the unclaimed title produced exactly one ledger row (the debit).
  ASSERT (SELECT count(*) FROM public.coin_ledger l
          JOIN public.reigns r ON r.id = l.reign_id
          WHERE r.title_id = t_free) = 1,
    'an unclaimed-title claim must only debit';

  -- Deleting the challenger's account cascades to their reigns; the holder's
  -- 'dethroned' credit survives with reign_id NULL and the balance is unchanged.
  DELETE FROM auth.users WHERE id = c;
  ASSERT public.coin_balance(h) = 32,
    format('after deleting the challenger, holder balance must stay 32, got %s', public.coin_balance(h));
  ASSERT EXISTS (SELECT 1 FROM public.coin_ledger
                 WHERE user_id = h AND reason = 'dethroned' AND reign_id IS NULL),
    'the dethroned credit must survive with reign_id set to NULL';

  RAISE NOTICE 'dethrone_test: all assertions passed';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Update `supabase/tests/coronas_test.sql`**

The `create_claim` RPC is being dropped, so its part of the test goes (the unit-increment check now lives in `dethrone_test.sql`). Make these edits:
- Header line 2 → `-- Verifies migration 0006: welcome grant, one-welcome rule, balance + RLS.`
- Delete the `titles` fixture INSERT for `c3333333-…` and the `reigns` INSERT plus its comment line `-- Held by v at 10 👑, …`.
- In the first `DO` block, after the two `coin_balance` asserts, add:

```sql
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.coin_ledger l WHERE l.user_id = p.id AND l.reason = 'welcome'
    )
  ), 'every profile must have its welcome grant';
```

- In the second `DO` block, delete the two `create_claim` sections (the `ok := false; BEGIN PERFORM public.create_claim(… 10) …` block with its ASSERT, and the `PERFORM public.create_claim(… 11);` line).

In `package.json`, `test:sql` becomes:

```json
"test:sql": "psql \"$SUPABASE_DB_URL\" -v ON_ERROR_STOP=1 -f supabase/tests/pricing_test.sql -f supabase/tests/coronas_test.sql -f supabase/tests/dethrone_test.sql",
```

- [ ] **Step 3: Run the SQL tests to verify `dethrone_test` fails**

```bash
SUPABASE_DB_URL="$LOCAL" npm run test:sql 2>&1 | grep -E "NOTICE|ERROR"
```

Expected: `pricing_test` and `coronas_test` pass; `dethrone_test` FAILS with `function public.dethrone_with_coins(uuid, integer) does not exist` (or the `reign_id` column missing).

- [ ] **Step 4: Write `supabase/migrations/0007_dethrone_with_coins.sql`**

```sql
-- ============================================================================
-- 0007_dethrone_with_coins.sql — dethroning spends Coronas
--   1. Retire the manual claim flow (claims table + its RPCs)
--   2. coin_ledger: reign reference, dethrone/dethroned reasons, sign rule
--   3. dethrone_with_coins — the atomic, zero-sum crown transfer
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RETIRE THE MANUAL FLOW (production has 0 claims; plain DROPs fail loudly
--    if a signature drifted, rolling back the whole migration)
-- ---------------------------------------------------------------------------
DROP FUNCTION public.create_claim(uuid, integer, text);
DROP FUNCTION public.apply_claim(uuid, boolean);
DROP FUNCTION public.reject_claim(uuid);
DROP TABLE public.claims;

-- ---------------------------------------------------------------------------
-- 2. LEDGER — reign reference + reasons + sign rule. reign_id stays nullable:
--    deleting an account cascades to its reigns and must not block or rewrite
--    other users' balances.
-- ---------------------------------------------------------------------------
ALTER TABLE coin_ledger
  ADD COLUMN reign_id uuid REFERENCES reigns(id) ON DELETE SET NULL;

ALTER TABLE coin_ledger DROP CONSTRAINT coin_ledger_reason_check;
ALTER TABLE coin_ledger
  ADD CONSTRAINT coin_ledger_reason_check
    CHECK (reason IN ('welcome', 'dethrone', 'dethroned')),
  ADD CONSTRAINT coin_ledger_amount_sign
    CHECK ((reason = 'dethrone') = (amount < 0));

-- ---------------------------------------------------------------------------
-- 3. dethrone_with_coins — the caller pays p_amount Coronas for the title.
--    Validates the live price and the balance, ends the active reign, starts
--    the caller's, debits the caller and credits the dethroned holder with the
--    full amount (zero-sum). On an unclaimed title the coins are burned.
--    Lock order: title row, then the caller's profile row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dethrone_with_coins(
  p_title_id uuid,
  p_amount integer,
  p_message text DEFAULT NULL
) RETURNS public.reigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_active  public.reigns;
  v_min     integer;
  v_reign   public.reigns;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  p_message := nullif(btrim(p_message), '');
  IF p_message IS NOT NULL AND char_length(p_message) > 80 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  -- Serializes every attempt on this title, unclaimed ones included.
  PERFORM 1 FROM public.titles WHERE id = p_title_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Title not found';
  END IF;

  SELECT * INTO v_active
  FROM public.reigns
  WHERE title_id = p_title_id AND ended_at IS NULL;

  IF FOUND THEN
    IF v_active.user_id = v_user_id THEN
      RAISE EXCEPTION 'You already hold this title';
    END IF;
    v_min := public.title_current_price(p_title_id) + 1;
  ELSE
    v_min := 1;
  END IF;

  IF p_amount < v_min THEN
    RAISE EXCEPTION 'Amount must be at least %', v_min;
  END IF;

  -- Serializes this caller's spends so the balance check cannot be raced.
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF public.coin_balance(v_user_id) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.reigns
  SET ended_at = now()
  WHERE title_id = p_title_id AND ended_at IS NULL;

  INSERT INTO public.reigns (title_id, user_id, price_paid, message, dethroned_user_id)
  VALUES (p_title_id, v_user_id, p_amount, p_message, v_active.user_id)
  RETURNING * INTO v_reign;

  INSERT INTO public.coin_ledger (user_id, amount, reason, reign_id)
  VALUES (v_user_id, -p_amount, 'dethrone', v_reign.id);

  IF v_active.user_id IS NOT NULL THEN
    INSERT INTO public.coin_ledger (user_id, amount, reason, reign_id)
    VALUES (v_active.user_id, p_amount, 'dethroned', v_reign.id);
  END IF;

  RETURN v_reign;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dethrone_with_coins(uuid, integer, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dethrone_with_coins(uuid, integer, text) TO authenticated;
```

- [ ] **Step 5: Apply locally and run the SQL tests**

```bash
npx supabase migration up --local
SUPABASE_DB_URL="$LOCAL" npm run test:sql 2>&1 | grep -E "NOTICE|ERROR"
```

Expected: three NOTICEs — `pricing_test`, `coronas_test`, `dethrone_test: all assertions passed`; no ERROR.

- [ ] **Step 6: Mutation check — the zero-sum credit is really asserted**

Temporarily remove the credit (local DB only), expect the test to fail, then restore by re-running the migration's function definition:

```bash
psql "$LOCAL" -q -c "$(sed -n '/CREATE OR REPLACE FUNCTION public.dethrone_with_coins/,/^\$\$;/p' supabase/migrations/0007_dethrone_with_coins.sql | sed 's/VALUES (v_active.user_id, p_amount, .dethroned., v_reign.id);/VALUES (v_active.user_id, 1, '"'"'dethroned'"'"', v_reign.id);/')"
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/dethrone_test.sql 2>&1 | grep -E "ERROR|NOTICE"
psql "$LOCAL" -q -c "$(sed -n '/CREATE OR REPLACE FUNCTION public.dethrone_with_coins/,/^\$\$;/p' supabase/migrations/0007_dethrone_with_coins.sql)"
psql "$LOCAL" -v ON_ERROR_STOP=1 -f supabase/tests/dethrone_test.sql 2>&1 | grep -E "ERROR|NOTICE"
```

Expected: first run `ERROR: holder: expected 20 + 12 = 32, got 21`; after restoring, `NOTICE: dethrone_test: all assertions passed`.

- [ ] **Step 7: Concurrency check — two challengers on one title (Review Focus 1)**

Uses seeded users Juana (`a2222222-…`) and Fran (`a3333333-…`) on the unclaimed `duque-del-asado`. Session A dethrones at 2 and holds its transaction 3 s; session B tries the same 2 meanwhile:

```bash
T=$(psql "$LOCAL" -At -c "select id from titles where slug='duque-del-asado'")
psql "$LOCAL" -At > "$SCRATCH/conc-a.txt" 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT price_paid FROM public.dethrone_with_coins('$T', 2);
SELECT pg_sleep(3);
COMMIT;
SQL
sleep 1
psql "$LOCAL" -At > "$SCRATCH/conc-b.txt" 2>&1 <<SQL
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT price_paid FROM public.dethrone_with_coins('$T', 2);
COMMIT;
SQL
wait
cat "$SCRATCH/conc-a.txt" "$SCRATCH/conc-b.txt"
psql "$LOCAL" -At -c "select count(*) from reigns where title_id='$T' and ended_at is null"
```

Expected: A prints `2`; B waits ~2 s, then `ERROR:  Amount must be at least 3` (it re-read the price after A committed); exactly `1` active reign. Then restore the clean seed: `npx supabase db reset --local` and re-run `npm run test:sql` (all three NOTICEs).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0007_dethrone_with_coins.sql supabase/tests/dethrone_test.sql supabase/tests/coronas_test.sql package.json
git commit -m "feat: migration 0007 — dethrone_with_coins, retire the claims flow"
```

---

### Task 2: App — dethrone with Coronas, retire claims/admin

**Files:**
- Regenerate: `src/types/database.types.ts` (`npm run update-types`)
- Create: `src/services/dethrone.server.ts`, `src/services/__tests__/dethrone.server.test.ts`
- Create: `src/actions/dethrone.ts`, `src/actions/__tests__/dethrone.test.ts`
- Modify: `src/features/dethrone/schemas/dethrone.schema.ts` (+ its test) — drop `slug`
- Modify: `src/features/dethrone/components/dethrone-form.tsx`
- Modify: `src/app/t/[slug]/page.tsx`
- Modify: `src/services/auth.server.ts` (remove `requireAdmin`), `src/types/index.ts` (remove `Claim`, `PendingClaimListItem`), `src/lib/env.ts`, `.env.example`, `.github/workflows/ci.yml` (remove `PAYMENT_ALIAS`)
- Delete: `src/actions/claims.ts`, `src/actions/__tests__/claims.test.ts`, `src/services/claims.server.ts`, `src/services/__tests__/claims.server.test.ts`, `src/app/admin/`, `src/features/admin/`, `src/features/dethrone/components/payment-instructions.tsx`

**Interfaces:**
- Consumes: `dethrone_with_coins` RPC and exception strings (Task 1); `getBalance(supabase, userId): Promise<number>` (D4, `@/services/wallet.server`); `formatCoronas` (`@/lib/format`).
- Produces: `dethrone(supabase: SupabaseServerClient, titleId: string, amount: number, message?: string): Promise<Reign>`; server action `destronar(_prev: ActionResult<Reign> | null, formData: FormData): Promise<ActionResult<Reign>>` reading `titleId`, `amount`, `message`; `DethroneForm` props `{ titleId: string; minAmount: number; balance: number; isHeld: boolean }`.

- [ ] **Step 1: Regenerate types, then write the failing tests**

```bash
npm run update-types
git diff --stat src/types/database.types.ts
```

Expected: `claims` and the three claim RPCs disappear; `dethrone_with_coins` and `coin_ledger.reign_id` appear. (Typecheck is now red until this task deletes the claims code — expected.)

Create `src/services/__tests__/dethrone.server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dethrone } from "../dethrone.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const reignRow = {
  id: "r1",
  title_id: "t1",
  user_id: "u1",
  price_paid: 5,
  started_at: "2026-10-07T00:00:00Z",
  ended_at: null,
  message: null,
  dethroned_user_id: "u2",
};

describe("dethrone", () => {
  it("returns the new reign from the dethrone_with_coins RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: reignRow, error: null } });
    await expect(dethrone(supabase, "t1", 5)).resolves.toEqual(reignRow);
    expect(supabase.rpc).toHaveBeenCalledWith("dethrone_with_coins", {
      p_title_id: "t1",
      p_amount: 5,
    });
  });

  it("forwards p_message when provided", async () => {
    const supabase = createSupabaseMock({ rpc: { data: reignRow, error: null } });
    await dethrone(supabase, "t1", 5, "Soy el rey");
    expect(supabase.rpc).toHaveBeenCalledWith("dethrone_with_coins", {
      p_title_id: "t1",
      p_amount: 5,
      p_message: "Soy el rey",
    });
  });

  it("throws the RPC error", async () => {
    const supabase = createSupabaseMock({
      rpc: { data: null, error: { message: "Insufficient balance" } },
    });
    await expect(dethrone(supabase, "t1", 5)).rejects.toMatchObject({
      message: "Insufficient balance",
    });
  });
});
```

Create `src/actions/__tests__/dethrone.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { destronar } from "../dethrone";

const TITLE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("titleId", TITLE_ID);
  fd.set("amount", "5");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

const reignRow = {
  id: "r1",
  title_id: TITLE_ID,
  user_id: "u1",
  price_paid: 5,
  started_at: "2026-10-07T00:00:00Z",
  ended_at: null,
  message: null,
  dethroned_user_id: "u2",
};

function withRpcError(message: string) {
  return createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: { message } } });
}

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("destronar", () => {
  it("returns an error when the user is not authenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    await expect(destronar(null, form())).resolves.toEqual({
      success: false,
      error: "Tenés que iniciar sesión para destronar.",
    });
  });

  it("rejects a non-integer amount before calling the RPC", async () => {
    const supabase = createSupabaseMock({ user: { id: "u1" } });
    createClientMock.mockResolvedValue(supabase);
    const result = await destronar(null, form({ amount: "5.5" }));
    expect(result.success).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["Amount must be at least 6", "El monto no alcanza: alguien pagó más. Refrescá la página."],
    ["Insufficient balance", "No te alcanzan las Coronas."],
    ["You already hold this title", "Ya sos el dueño de este título."],
    ["Message too long", "El mensaje es demasiado largo (máx. 80 caracteres)."],
    ["Amount must be positive", "Monto inválido."],
    ["Title not found", "No se pudo procesar la solicitud. Probá de nuevo."],
  ])("maps the RPC error %j to a Spanish message", async (rpcMessage, expected) => {
    createClientMock.mockResolvedValue(withRpcError(rpcMessage));
    await expect(destronar(null, form())).resolves.toEqual({ success: false, error: expected });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns the new reign and revalidates the whole layout on success", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, rpc: { data: reignRow, error: null } }),
    );
    await expect(destronar(null, form({ message: "Soy el rey" }))).resolves.toEqual({
      success: true,
      data: reignRow,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
```

In `src/features/dethrone/schemas/__tests__/dethrone.schema.test.ts`: remove `slug: "rey-de-cordoba",` from `validInput` and delete the `"rejects a missing slug"` test.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/__tests__/dethrone.server.test.ts src/actions/__tests__/dethrone.test.ts src/features/dethrone/schemas/__tests__/dethrone.schema.test.ts`
Expected: FAIL — cannot resolve `../dethrone.server` / `../dethrone`; the schema's "parses a valid input" (and the other valid-input tests) fail because `slug` is still required.

- [ ] **Step 3: Implement service, action and schema**

`src/services/dethrone.server.ts`:

```ts
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Reign } from "@/types";

// Spends Coronas to take a title via the atomic dethrone_with_coins RPC; returns the new reign.
export async function dethrone(
  supabase: SupabaseServerClient,
  titleId: string,
  amount: number,
  message?: string,
): Promise<Reign> {
  const { data, error } = await supabase.rpc("dethrone_with_coins", {
    p_title_id: titleId,
    p_amount: amount,
    ...(message !== undefined ? { p_message: message } : {}),
  });

  if (error) throw error;
  return data;
}
```

`src/actions/dethrone.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dethrone } from "@/services/dethrone.server";
import { dethroneSchema } from "@/features/dethrone/schemas/dethrone.schema";
import type { ActionResult, Reign } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para destronar.";

// Maps a known dethrone_with_coins RPC exception message to a Spanish user message.
// ponytail: substring match on English RPC messages; upgrade to SQLSTATE codes in a migration if these strings drift.
function translateRpcError(message: string): string {
  if (message.includes("at least")) {
    return "El monto no alcanza: alguien pagó más. Refrescá la página.";
  }
  if (message.includes("Insufficient balance")) return "No te alcanzan las Coronas.";
  if (message.includes("already hold")) return "Ya sos el dueño de este título.";
  if (message.includes("Message too long")) {
    return "El mensaje es demasiado largo (máx. 80 caracteres).";
  }
  if (message.includes("Not authenticated")) return NOT_AUTH;
  if (message.includes("must be positive")) return "Monto inválido.";
  return "No se pudo procesar la solicitud. Probá de nuevo.";
}

// Spends the user's Coronas to take a title; price and balance are re-validated atomically by the RPC.
export async function destronar(
  _prevState: ActionResult<Reign> | null,
  formData: FormData,
): Promise<ActionResult<Reign>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_AUTH };

  const parsed = dethroneSchema.safeParse({
    titleId: formData.get("titleId"),
    amount: formData.get("amount"),
    message: formData.get("message") ?? undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { titleId, amount, message } = parsed.data;

  let reign: Reign;
  try {
    reign = await dethrone(supabase, titleId, amount, message);
  } catch (err: unknown) {
    const message =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
    return { success: false, error: translateRpcError(message) };
  }

  // Holders and balances change site-wide: header chip, cards, ticker, both wallets.
  revalidatePath("/", "layout");
  return { success: true, data: reign };
}
```

`src/features/dethrone/schemas/dethrone.schema.ts`: delete the `slug: z.string().min(1),` line and change the comment to `// Validates a dethrone submission: title, amount, and optional coronation message.`

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/services/__tests__/dethrone.server.test.ts src/actions/__tests__/dethrone.test.ts src/features/dethrone/schemas/__tests__/dethrone.schema.test.ts`
Expected: PASS (3 + 9 + schema tests).

- [ ] **Step 5: Delete the claims/admin code and `PAYMENT_ALIAS`**

```bash
git rm -q src/actions/claims.ts src/actions/__tests__/claims.test.ts \
  src/services/claims.server.ts src/services/__tests__/claims.server.test.ts \
  src/features/dethrone/components/payment-instructions.tsx
git rm -rq src/app/admin src/features/admin
```

- `src/services/auth.server.ts`: delete the `requireAdmin` function with its comment; change the first import to `import { redirect } from "next/navigation";` (`notFound` was only used there — confirm with `grep -n notFound src/services/auth.server.ts`, expected no output).
- `src/types/index.ts`: delete the `Claim` export and the `PendingClaimListItem` type with its comment.
- `src/lib/env.ts`: delete `PAYMENT_ALIAS: z.string().min(1),`.
- `.env.example`: delete the `PAYMENT_ALIAS=tu.alias.mp` line.
- `.github/workflows/ci.yml`: delete `PAYMENT_ALIAS: ci.placeholder`.

- [ ] **Step 6: Title page and form**

`src/features/dethrone/components/dethrone-form.tsx` — replace the import of `destronar` with `import { destronar } from "@/actions/dethrone";`, and the props/body:

```tsx
interface DethroneFormProps {
  titleId: string;
  minAmount: number;
  balance: number;
  isHeld: boolean;
}

// Amount input + submit to spend Coronas on a title; blocks double-submit and shows what is missing when short.
export function DethroneForm({ titleId, minAmount, balance, isHeld }: DethroneFormProps) {
  const [state, action, pending] = useActionState(destronar, null);
  const missing = minAmount - balance;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="titleId" value={titleId} />
```

(delete the `slug` hidden input). On the amount `<input>`, add `max={balance}` after `min={minAmount}`. Directly after the amount block's closing `</div>`, add:

```tsx
      <p className="text-body-sm font-body-sm text-on-surface-variant">
        Tu saldo: <span className="text-tertiary">{formatCoronas(balance)}</span>
      </p>
```

Replace the submit button with:

```tsx
      <button
        type="submit"
        disabled={pending || missing > 0}
        className="self-stretch text-center btn-destronar text-on-surface px-8 py-3 rounded-lg text-label-caps font-label-caps font-bold tracking-widest border border-secondary-container/50 disabled:opacity-50"
      >
        {missing > 0
          ? `TE FALTAN ${formatCoronas(missing)}`
          : pending
            ? "PROCESANDO..."
            : isHeld
              ? "DESTRONAR"
              : "CORONARME"}
      </button>
```

`src/app/t/[slug]/page.tsx`:
- Imports: delete `env`, `getPendingClaim`, `PaymentInstructions`; add `import { getBalance } from "@/services/wallet.server";`.
- Replace the `pendingClaim` block with:

```tsx
  const balance = user ? await getBalance(supabase, user.id) : 0;
```

- Replace `) : pendingClaim ? (\n            <PaymentInstructions claim={pendingClaim} alias={env.PAYMENT_ALIAS} />\n          ) : (` with `) : (`.
- Copy: `El trono tiene precio. Poné la guita y es tuyo.` → `El trono tiene precio. Pagalo en Coronas y es tuyo.`
- `<DethroneForm …>` props become `titleId={title.id} minAmount={nextPrice} balance={balance} isHeld={isHeld}`.

- [ ] **Step 7: Nothing references the old flow**

```bash
grep -rnE "claims|Claim\b|requireAdmin|PAYMENT_ALIAS|payment-instructions|/admin" src .env.example .github | grep -v database.types
```

Expected: no output.

- [ ] **Step 8: Full suite, typecheck, lint**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all PASS; lint only the pre-existing custom-font warning.

- [ ] **Step 9: Commit**

```bash
git add -A src .env.example .github package.json
git commit -m "feat: dethrone with Coronas — atomic RPC from the title page, retire claims and admin"
```

---

### Task 3: Wallet movements with context

**Files:**
- Create: `src/features/profile/lib/describe-movement.ts`, `src/features/profile/lib/__tests__/describe-movement.test.ts`
- Modify: `src/types/index.ts` (`CoinMovement`), `src/services/wallet.server.ts`, `src/services/__tests__/wallet.server.test.ts`, `src/features/profile/components/wallet-card.tsx`

**Interfaces:**
- Consumes: `coin_ledger.reign_id → reigns` embed; FKs `reigns_user_id_fkey`, `reigns_dethroned_user_id_fkey`.
- Produces: `type CoinMovement = Pick<CoinLedgerRow, "id" | "amount" | "reason" | "created_at"> & { titleName: string | null; counterpartName: string | null }`; `describeMovement(m: CoinMovement): string`; `getRecentMovements` returns the new `CoinMovement[]`.

- [ ] **Step 1: Write the failing tests**

`src/features/profile/lib/__tests__/describe-movement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeMovement } from "../describe-movement";
import type { CoinMovement } from "@/types";

function movement(overrides: Partial<CoinMovement>): CoinMovement {
  return {
    id: "m1",
    amount: 20,
    reason: "welcome",
    created_at: "2026-10-07T00:00:00Z",
    titleName: null,
    counterpartName: null,
    ...overrides,
  };
}

describe("describeMovement", () => {
  it("labels the welcome grant", () => {
    expect(describeMovement(movement({}))).toBe("Saldo inicial");
  });

  it("names who you dethroned and where", () => {
    expect(
      describeMovement(
        movement({ reason: "dethrone", amount: -40, titleName: "Rey de Córdoba", counterpartName: "Nico" }),
      ),
    ).toBe("Destronaste a Nico · Rey de Córdoba");
  });

  it("says you crowned yourself on an unclaimed title", () => {
    expect(
      describeMovement(movement({ reason: "dethrone", amount: -1, titleName: "Rey de Argentina" })),
    ).toBe("Te coronaste · Rey de Argentina");
  });

  it("names who dethroned you", () => {
    expect(
      describeMovement(
        movement({ reason: "dethroned", amount: 40, titleName: "Rey de Córdoba", counterpartName: "Fran" }),
      ),
    ).toBe("Te destronó Fran · Rey de Córdoba");
  });

  it("falls back to 'alguien' and drops the title when the reign is gone", () => {
    expect(describeMovement(movement({ reason: "dethroned", amount: 40 }))).toBe("Te destronó alguien");
  });
});
```

In `src/services/__tests__/wallet.server.test.ts`, replace the `movement` fixture and the first `getRecentMovements` test with:

```ts
const welcomeRow = {
  id: "m1",
  amount: 20,
  reason: "welcome",
  created_at: "2026-10-07T00:00:00Z",
  reigns: null,
};

const dethroneRow = {
  id: "m2",
  amount: -40,
  reason: "dethrone",
  created_at: "2026-10-07T01:00:00Z",
  reigns: {
    titles: { name: "Rey de Córdoba" },
    holder: { username: "fran", display_name: "Fran" },
    dethroned: { username: "nico", display_name: null },
  },
};

const dethronedRow = { ...dethroneRow, id: "m3", amount: 40, reason: "dethroned" };
```

```ts
  it("maps joined rows to movements with title and counterpart, newest first", async () => {
    const supabase = createSupabaseMock({
      queryByTable: {
        coin_ledger: { data: [dethroneRow, dethronedRow, welcomeRow], error: null },
      },
    });
    await expect(getRecentMovements(supabase, "u1")).resolves.toEqual([
      { id: "m2", amount: -40, reason: "dethrone", created_at: "2026-10-07T01:00:00Z", titleName: "Rey de Córdoba", counterpartName: "nico" },
      { id: "m3", amount: 40, reason: "dethroned", created_at: "2026-10-07T01:00:00Z", titleName: "Rey de Córdoba", counterpartName: "Fran" },
      { id: "m1", amount: 20, reason: "welcome", created_at: "2026-10-07T00:00:00Z", titleName: null, counterpartName: null },
    ]);
    const builder = supabase.from("coin_ledger").select();
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(10);
  });
```

(`nico` has no display name → falls back to the username.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/profile/lib/__tests__/describe-movement.test.ts src/services/__tests__/wallet.server.test.ts`
Expected: FAIL — cannot resolve `../describe-movement`; the wallet test gets rows without `titleName` / `counterpartName`.

- [ ] **Step 3: Implement**

`src/types/index.ts` — replace the `CoinMovement` type with:

```ts
// One wallet movement shown in the user's "Billetera", with its title and counterpart when it has a reign.
export type CoinMovement = Pick<CoinLedgerRow, "id" | "amount" | "reason" | "created_at"> & {
  titleName: string | null;
  counterpartName: string | null;
};
```

`src/services/wallet.server.ts` — add `import { type QueryData } from "@supabase/supabase-js";` at the top and replace `getRecentMovements` with:

```ts
const movementsQuery = (supabase: SupabaseServerClient, userId: string, limit: number) =>
  supabase
    .from("coin_ledger")
    .select(
      `id, amount, reason, created_at,
       reigns ( titles ( name ),
         holder:profiles!reigns_user_id_fkey ( username, display_name ),
         dethroned:profiles!reigns_dethroned_user_id_fkey ( username, display_name ) )`,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
type MovementRow = QueryData<ReturnType<typeof movementsQuery>>[number];
type PersonRow = { username: string; display_name: string | null } | null;

function personName(person: PersonRow): string | null {
  return person ? (person.display_name ?? person.username) : null;
}

// Flattens a joined ledger row: the counterpart is who you dethroned, or who dethroned you.
function toMovement(row: MovementRow): CoinMovement {
  const reign = row.reigns;
  return {
    id: row.id,
    amount: row.amount,
    reason: row.reason,
    created_at: row.created_at,
    titleName: reign?.titles?.name ?? null,
    counterpartName:
      row.reason === "dethroned" ? personName(reign?.holder ?? null) : personName(reign?.dethroned ?? null),
  };
}

// Fetches the user's most recent wallet movements, newest first, with title and counterpart.
export async function getRecentMovements(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 10,
): Promise<CoinMovement[]> {
  const { data, error } = await movementsQuery(supabase, userId, limit);
  if (error) throw error;
  return data.map(toMovement);
}
```

`src/features/profile/lib/describe-movement.ts`:

```ts
import type { CoinMovement } from "@/types";

// Builds the Spanish label for a wallet movement ("Destronaste a Nico · Rey de Córdoba").
export function describeMovement(m: CoinMovement): string {
  const where = m.titleName ? ` · ${m.titleName}` : "";
  switch (m.reason) {
    case "welcome":
      return "Saldo inicial";
    case "dethrone":
      return m.counterpartName ? `Destronaste a ${m.counterpartName}${where}` : `Te coronaste${where}`;
    case "dethroned":
      return `Te destronó ${m.counterpartName ?? "alguien"}${where}`;
    default:
      return m.reason;
  }
}
```

`src/features/profile/components/wallet-card.tsx` — delete `REASON_LABELS`; import `describeMovement` from `@/features/profile/lib/describe-movement`; render `{describeMovement(m)}` where `{REASON_LABELS[m.reason] ?? m.reason}` was.

- [ ] **Step 4: Run them to verify they pass, then the suite**

Run: `npx vitest run src/features/profile/lib/__tests__/describe-movement.test.ts src/services/__tests__/wallet.server.test.ts && npm run test && npm run typecheck && npm run lint`
Expected: all PASS / clean (font warning only). If `typecheck` rejects the embed shape (`reigns` inferred as an array), the FK hint is missing — use `reigns!coin_ledger_reign_id_fkey ( … )` and re-run.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: wallet movements name the title and the counterpart"
```

---

### Task 4: Demo banner + docs

**Files:**
- Create: `src/components/demo-banner.tsx`
- Modify: `src/app/layout.tsx`, `docs/DESIGN.md`, `AGENTS.md`, `docs/ROADMAP.md`

**Interfaces:** none new.

- [ ] **Step 1: Banner**

`src/components/demo-banner.tsx`:

```tsx
// Thin site-wide notice that this is a portfolio demo with a fictional currency.
export function DemoBanner() {
  return (
    <p className="w-full px-4 py-1.5 text-center text-label-caps font-label-caps text-on-surface-variant bg-surface-container-high/60 border-b border-outline-variant/30">
      DEMO DE PORTFOLIO · LAS CORONAS SON FICTICIAS, NO SE USA PLATA REAL
    </p>
  );
}
```

`src/app/layout.tsx`: import `{ DemoBanner } from "@/components/demo-banner"` and render it as the first child of the content wrapper: `<div className="mt-20 flex-1 flex flex-col min-w-0 max-w-full"><DemoBanner />{children}</div>`.

- [ ] **Step 2: `docs/DESIGN.md`**

- Replace the whole `### Dethrone flow (v1 — manual payment confirmation)` section (from its heading through the "Concurrency note" paragraph) with:

```markdown
### Dethrone flow (v2 — Coronas, atomic)

1. A logged-in user (guests included) on a title page offers **X 👑** (X ≥ current price + 1, or ≥ 1 if unclaimed; they may offer more to raise the next threshold). The page shows their balance; the button reads "TE FALTAN N 👑" when short.
2. The server action validates with Zod and calls `dethrone_with_coins`, which in one transaction locks the title (then the challenger's profile), re-checks the live price and the balance, ends the active reign, starts the new one and writes the ledger.
3. **Zero-sum:** the dethroned holder is credited exactly X 👑. Claiming an unclaimed title only debits — those Coronas are burned (the economy's only sink).
4. The coronation message (≤ 80 chars) is stored on the reign and shown publicly at once; until moderation exists it is cleared with SQL if needed.

Concurrency: two challengers on one title serialize on the title lock; the second re-reads the new price and is rejected with "El monto no alcanza".
```

- Domain model intro: `Five tables.` → `Four domain tables plus the single-row \`pricing_config\`.`
- Delete the `### \`claims\` (dethrone attempts / payment tracking)` section (heading + 3 bullets).
- `coin_ledger` first bullet → `- \`id\`, \`user_id\` (FK → profiles), \`amount\` (signed integer 👑: credit > 0, debit < 0), \`reason\` (\`welcome\`, \`dethrone\` (always negative), \`dethroned\`; D6 adds \`salary\`), \`reign_id\` (FK → reigns, nullable, \`ON DELETE SET NULL\`), \`created_at\``.
- Database rules first bullet: delete `Claims readable by owner (+ admin). `.
- Pages table: delete the `/admin` row.

- [ ] **Step 3: `AGENTS.md` and roadmap**

`AGENTS.md`: replace `- Admin-only operations (confirming claims) check the admin flag in the database server-side, never a client-provided value.` with `- Dethrones happen only through the \`dethrone_with_coins\` RPC (price, balance and transfer validated atomically in Postgres). Admin-only operations, when they exist, check \`profiles.is_admin\` in the database — never a client-provided value.`

`docs/ROADMAP.md`: `- [ ] **D5** —` → `- [x] **D5** —`.

```bash
grep -rnE "claim|/admin|PAYMENT_ALIAS|Mercado Pago" docs/DESIGN.md AGENTS.md README.md
```

Expected: only historical lines in DESIGN.md §7 "Build Roadmap" (`Dethrone flow — claim creation…`, `Admin — claim confirmation`).

- [ ] **Step 4: Live check on the local stack — two guests (Review Focus 4)**

Run the dev server against local Supabase (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local ANON_KEY> npx next dev -p 3101`) and drive two headless Chrome profiles over CDP:
1. Guest A opens `/t/rey-de-argentina` (unclaimed), sees "Tu saldo: 20 👑", submits 3 → page shows "El trono es tuyo 👑"; A's chip shows `17 👑` **without a manual reload**.
2. Guest B opens the same title, minimum `4 👑`, submits 4 → B's chip `16 👑`, B's `/perfil` shows "Destronaste a {A} · Rey de Argentina −4 👑".
3. A reloads `/perfil`: chip `21 👑`, wallet "Te destronó {B} · Rey de Argentina +4 👑" and "Te coronaste · Rey de Argentina −3 👑".
4. Guest A on `/t/rey-de-cordoba` (minimum above 21): button reads `TE FALTAN N 👑` and is disabled.
5. Demo banner visible under the header at 1440 px and 360 px (CDP device emulation), no horizontal overflow (`document.documentElement.scrollWidth === 360`).

- [ ] **Step 5: Suite + commit**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS / clean.

```bash
git add src/components/demo-banner.tsx src/app/layout.tsx docs/DESIGN.md AGENTS.md docs/ROADMAP.md
git commit -m "feat: demo banner; docs for the Coronas dethrone flow; roadmap D5 done"
```

---

### Task 5: Verify, review, PR, rollout

- [ ] **Step 1: Full verification**

```bash
npm run verify
SUPABASE_DB_URL="$LOCAL" npm run test:sql
```

Expected: `All checks passed.` and three SQL NOTICEs.

- [ ] **Step 2: Whole-branch review** — fresh reviewer (most capable model) per superpowers:executing-plans, with this plan's Review Focus; fix Critical/Important with a failing test first.

- [ ] **Step 3: PR**

Push `feat/dethrone-with-coins`, `gh pr create` (English body: what / rollout / tests, no attribution), `gh pr checks --watch` → green.

- [ ] **Step 4: Pre-rollout snapshot (remote, read-only)**

```bash
set -a && . ./.env.local && set +a
psql "$SUPABASE_DB_URL" -At -c "select count(*) from claims" -c "select count(*) from profiles" -c "select reason, count(*) from coin_ledger group by reason"
npx supabase db push --db-url "$SUPABASE_DB_URL" --dry-run
```

Expected: `0` claims (if not 0: stop and ask Nico — the drop would discard them); dry-run lists only `0007_dethrone_with_coins.sql`.

- [ ] **Step 5: Rollout — with Nico's go-ahead**

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
psql "$SUPABASE_DB_URL" -At -c "select to_regclass('public.claims') is null, (select count(*) from pg_proc where proname = 'dethrone_with_coins')"
```

Expected: `t|1`. Merge PR (merge commit) right away; wait for the Vercel production deploy.

- [ ] **Step 6: Post-deploy smoke (read-only on prod)**

Guest login on https://coronateonline.vercel.app → demo banner visible, chip `20 👑`, `/t/rey-de-argentina` shows "Tu saldo" and the form (do **not** submit — leave the live game to players). Remind Nico to delete `PAYMENT_ALIAS` from Vercel env. `git switch main && git pull && git branch -d feat/dethrone-with-coins`.

- [ ] **Step 7: Update memory** (`roadmap-progress.md`: D5 done, next D6 daily salary with streak).
