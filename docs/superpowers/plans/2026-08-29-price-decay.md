# Price Decay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a held title's current price decay over time toward a per-title floor, validated everywhere the price matters, with the formula living only in Postgres.

**Architecture:** A single-row `pricing_config` table holds the knobs. Two `STABLE SECURITY DEFINER` functions (`title_price_floor`, `title_current_price`) compute the effective price on read. A `titles_priced` view exposes it to the app. `create_claim` / `apply_claim` call `title_current_price` for threshold checks. No cron, no stored price column, no TS reimplementation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + Auth), Zod v4, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-29-price-decay-design.md`

## Global Constraints

- Money is **integer ARS**, always a multiple of 1000. Every computed price rounds to a multiple of 1000.
- Schema changes only via `supabase/migrations/*.sql`, versioned in git. Never edit `src/types/database.types.ts` by hand — it is regenerated from Supabase.
- Crown transfers happen only inside the atomic `SECURITY DEFINER` `apply_claim` function. Client writes to `titles` / `reigns` are forbidden by RLS.
- `any` is prohibited. No type assertions (`as X`) on Supabase responses — derive via `.select()` inference / `QueryData<typeof query>`. Domain types come from `@/types`.
- Server Components by default; `"use client"` only for interactivity. Data fetched in Server Components, passed as props.
- UI copy is Spanish (es-AR). Code, identifiers, comments in English. Always pass `'es-AR'` to `.toLocaleString` (use the existing `formatARS` helper).
- One short single-line English comment before each exported function. No `console.log` in production paths. ESM imports, `@/*` alias.
- Git is Claude-managed on this project: commit on the `feat/price-decay` branch as each task completes; do not push.
- TDD: write the failing test first, watch it fail, then implement. For SQL, the failing check is running `pricing_test.sql` and seeing an assertion raise before the function bodies exist.

---

## Prerequisites & environment notes

- **Tasks 1–2 need a reachable Supabase** (local `supabase start`, or the linked cloud project) plus the `supabase` CLI for `npm run update-types`. If this environment lacks them, Task 1 still produces the reviewed `.sql` files; Task 2's `apply` + `update-types` steps are performed wherever the CLI and DB credentials live, and the regenerated `database.types.ts` is committed from there.
- **Tasks 3–7 are pure TypeScript / docs** and run anywhere with `npm`.
- Existing test commands: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0004_price_decay.sql` | **Create.** Config table, pricing functions, `titles_priced` view, `create_claim`/`apply_claim` replacements. |
| `supabase/tests/pricing_test.sql` | **Create.** Transaction-wrapped assertion script for the pricing functions. |
| `src/types/database.types.ts` | **Regenerate.** Gains the `titles_priced` view row + the two functions. |
| `src/types/index.ts` | **Modify.** `TitleCard.priceFloor`, `TitleDetail.holderPaid`, `PendingClaimListItem.currentPrice`. |
| `src/services/titles.server.ts` | **Modify.** Read effective price/holder from `titles_priced`; split past-reign history into its own query. |
| `src/services/__tests__/titles.server.test.ts` | **Create.** Mapping tests for the new row shape. |
| `src/services/claims.server.ts` | **Modify.** `getPendingClaims` merges `currentPrice` per row. |
| `src/services/__tests__/claims.server.test.ts` | **Modify.** Add a `getPendingClaims` currentPrice test. |
| `src/test/supabase-mock.ts` | **Modify (Task 4).** Per-table canned results (`queryByTable`), memoized builder per table, `in` / `not` methods. |
| `src/app/t/[slug]/page.tsx` | **Modify.** Show "coronado por $X" + "piso $Y". |
| `src/features/admin/components/pending-claims-table.tsx` | **Modify.** Show "precio ahora $X" per row. |
| `docs/DESIGN.md` | **Modify.** Document decay + dynamic floor in §2 / §3. |

---

## Task 1: Migration `0004_price_decay.sql` + assertion test

**Files:**
- Create: `supabase/migrations/0004_price_decay.sql`
- Create: `supabase/tests/pricing_test.sql`

**Interfaces:**
- Produces (SQL, `public` schema):
  - table `pricing_config(id, decay_rate_daily numeric, grace_days int, peak_floor_fraction numeric, peak_window_days int, activity_floor_unit int)` — one row, `id = 1`.
  - `title_price_floor(p_title_id uuid) -> integer` — always a positive multiple of 1000.
  - `title_current_price(p_title_id uuid) -> integer` — multiple of 1000, or `NULL` when the title has no active reign.
  - view `titles_priced` — columns: `id, slug, name, emoji, description, created_at, current_price int, price_floor int, reign_id uuid, holder_user_id uuid, holder_paid int, reign_started_at timestamptz, holder_username text, holder_display_name text, holder_avatar_url text`.
  - `create_claim(uuid, integer)` / `apply_claim(uuid)` — unchanged signatures and unchanged `RAISE EXCEPTION` message text ("Amount must be at least %", "Claim amount is below the current price", "You already hold this title", "You already have a pending claim for this title", "Not authenticated", "Unauthorized", "Claim not found or already resolved", "Minimum claim amount is 1000").

- [ ] **Step 1: Write the assertion test `supabase/tests/pricing_test.sql`**

```sql
-- supabase/tests/pricing_test.sql
-- Verifies the pricing functions from migration 0004.
-- Run (local stack):  npx supabase db execute --file supabase/tests/pricing_test.sql
--     (any Postgres):  psql "$SUPABASE_DB_URL" -f supabase/tests/pricing_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- session_replication_role = replica bypasses FK/triggers so we can seed a
-- profile + reigns without an auth.users row. Requires table-owner / superuser
-- (true for `supabase db execute` and the local `postgres` role).
SET LOCAL session_replication_role = replica;

-- Pin config so assertions are deterministic regardless of the live row.
UPDATE pricing_config SET
  decay_rate_daily = 0.007, grace_days = 3,
  peak_floor_fraction = 0.25, peak_window_days = 90, activity_floor_unit = 2000
WHERE id = 1;

DO $$
DECLARE
  u1     uuid := gen_random_uuid();
  t_held uuid := gen_random_uuid();
  t_none uuid := gen_random_uuid();
  t_peak uuid := gen_random_uuid();
  t_act  uuid := gen_random_uuid();
  p integer;
  f integer;
BEGIN
  INSERT INTO profiles (id, username)
    VALUES (u1, 'decaytest_' || substr(u1::text, 1, 8));

  INSERT INTO titles (id, slug, name, emoji, description) VALUES
    (t_held, 'dt-held-' || substr(t_held::text, 1, 8), 'H', '👑', 'x'),
    (t_none, 'dt-none-' || substr(t_none::text, 1, 8), 'N', '👑', 'x'),
    (t_peak, 'dt-peak-' || substr(t_peak::text, 1, 8), 'P', '👑', 'x'),
    (t_act,  'dt-act-'  || substr(t_act::text,  1, 8), 'A', '👑', 'x');

  -- Case 1: within grace (held 1 day) -> price == price_paid
  INSERT INTO reigns (title_id, user_id, price_paid, started_at)
    VALUES (t_held, u1, 50000, now() - interval '1 day');
  p := title_current_price(t_held);
  ASSERT p = 50000, format('within grace: expected 50000, got %s', p);

  -- Case 2: after grace (held 10 days) -> 50000 * 0.993^7, rounded to nearest 1000
  UPDATE reigns SET started_at = now() - interval '10 days' WHERE title_id = t_held;
  p := title_current_price(t_held);
  ASSERT p = 48000, format('after grace 10d: expected 48000, got %s', p);

  -- Case 6: monotonic non-increase -> 40 days held <= 10 days held
  UPDATE reigns SET started_at = now() - interval '40 days' WHERE title_id = t_held;
  ASSERT title_current_price(t_held) <= 48000,
    format('monotonic: 40d (%s) must be <= 10d (48000)', title_current_price(t_held));

  -- Case 5: unclaimed title -> NULL price, floor == 1000
  ASSERT title_current_price(t_none) IS NULL, 'unclaimed: price must be NULL';
  ASSERT title_price_floor(t_none) = 1000, 'unclaimed: floor must be 1000';

  -- Case 3: floored by 25% of the recent peak.
  --   Past reign at 200000 within 90d; current reign old + tiny so decay bottoms out.
  INSERT INTO reigns (title_id, user_id, price_paid, started_at, ended_at)
    VALUES (t_peak, u1, 200000, now() - interval '20 days', now() - interval '15 days');
  INSERT INTO reigns (title_id, user_id, price_paid, started_at)
    VALUES (t_peak, u1, 60000, now() - interval '300 days');
  f := title_price_floor(t_peak);
  ASSERT f = 50000, format('peak floor: expected 25%% of 200000 = 50000, got %s', f);
  p := title_current_price(t_peak);
  ASSERT p = 50000, format('peak-floored price: expected 50000, got %s', p);

  -- Case 4: floored by activity. 3 reigns started in last 30d -> 2000 * 3 = 6000;
  --   peak within 90d is only 5000 so the activity term dominates.
  INSERT INTO reigns (title_id, user_id, price_paid, started_at, ended_at) VALUES
    (t_act, u1, 3000, now() - interval '25 days', now() - interval '20 days'),
    (t_act, u1, 4000, now() - interval '18 days', now() - interval '12 days');
  INSERT INTO reigns (title_id, user_id, price_paid, started_at)
    VALUES (t_act, u1, 5000, now() - interval '5 days');
  f := title_price_floor(t_act);
  ASSERT f = 6000, format('activity floor: expected 2000*3 = 6000, got %s', f);

  RAISE NOTICE 'pricing_test: all assertions passed';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run the test — expect failure (functions do not exist yet)**

Run: `npx supabase db execute --file supabase/tests/pricing_test.sql` (or `psql "$SUPABASE_DB_URL" -f supabase/tests/pricing_test.sql`)
Expected: FAIL — `ERROR: function title_current_price(uuid) does not exist`.
If no Supabase/psql is reachable in this environment, record that Step 2 is deferred and will run in Step 5 against the linked project; do not skip writing the file.

- [ ] **Step 3: Write the migration `supabase/migrations/0004_price_decay.sql`**

```sql
-- ============================================================================
-- 0004_price_decay.sql — Time-decayed effective price for held titles
--   1. pricing_config — single-row tunable knobs (tuning is an UPDATE)
--   2. title_price_floor() / title_current_price() — the formula, one place only
--   3. titles_priced view — the read path for effective price + current holder
--   4. create_claim / apply_claim — validate against the decayed price
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PRICING CONFIG
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_config (
  id                  integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  decay_rate_daily    numeric NOT NULL DEFAULT 0.007
                        CHECK (decay_rate_daily >= 0 AND decay_rate_daily < 1),
  grace_days          integer NOT NULL DEFAULT 3   CHECK (grace_days >= 0),
  peak_floor_fraction numeric NOT NULL DEFAULT 0.25
                        CHECK (peak_floor_fraction >= 0 AND peak_floor_fraction <= 1),
  peak_window_days    integer NOT NULL DEFAULT 90  CHECK (peak_window_days > 0),
  activity_floor_unit integer NOT NULL DEFAULT 2000 CHECK (activity_floor_unit >= 0)
);

INSERT INTO pricing_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing config is publicly readable"
  ON pricing_config FOR SELECT
  USING (true);

-- Game rules are public; writes happen only via migrations or service_role.
GRANT SELECT ON pricing_config TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. PRICING FUNCTIONS — the effective-price formula lives here and nowhere else
-- ---------------------------------------------------------------------------

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
    AND started_at > now() - interval '30 days';

  RETURN GREATEST(
    1000,
    (round(v_recent_peak * v_cfg.peak_floor_fraction / 1000) * 1000)::integer,
    v_cfg.activity_floor_unit * v_recent_count
  );
END;
$$;

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
    (round(v_decayed / 1000) * 1000)::integer
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.title_price_floor(uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.title_current_price(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.title_price_floor(uuid)   TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.title_current_price(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. VIEW — one flat row per title: effective price + current holder
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
  p.avatar_url   AS holder_avatar_url
FROM public.titles t
LEFT JOIN public.reigns   r ON r.title_id = t.id AND r.ended_at IS NULL
LEFT JOIN public.profiles p ON p.id = r.user_id;

GRANT SELECT ON public.titles_priced TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_claim / apply_claim — thresholds use the decayed price
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_claim(p_title_id uuid, p_amount integer)
RETURNS public.claims
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

  IF p_amount <= 0 OR p_amount % 1000 != 0 THEN
    RAISE EXCEPTION 'Amount must be a positive multiple of 1000';
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
    IF p_amount < v_current_price + 1000 THEN
      RAISE EXCEPTION 'Amount must be at least %', v_current_price + 1000;
    END IF;
  ELSE
    IF p_amount < 1000 THEN
      RAISE EXCEPTION 'Minimum claim amount is 1000';
    END IF;
  END IF;

  INSERT INTO public.claims (title_id, user_id, amount)
  VALUES (p_title_id, v_user_id, p_amount)
  RETURNING * INTO v_claim;

  RETURN v_claim;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_claim(p_claim_id uuid)
RETURNS void
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
    IF v_claim.amount < v_current_price + 1000 THEN
      RAISE EXCEPTION 'Claim amount is below the current price';
    END IF;
  END IF;

  UPDATE public.claims
  SET status = 'applied', resolved_at = now()
  WHERE id = p_claim_id;

  UPDATE public.reigns
  SET ended_at = now()
  WHERE title_id = v_claim.title_id AND ended_at IS NULL;

  INSERT INTO public.reigns (title_id, user_id, price_paid)
  VALUES (v_claim.title_id, v_claim.user_id, v_claim.amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_claim(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_claim(uuid, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_claim(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_claim(uuid) TO authenticated;
```

- [ ] **Step 4: Apply the migration to a database**

Run (local): `npx supabase db reset` (replays every migration incl. 0004 and `seed.sql`)
Or (linked): `npx supabase db push`
Expected: applies with no error.
If no Supabase CLI here, this step and Step 5 are performed wherever the CLI + DB credentials live; note that and continue.

- [ ] **Step 5: Run the assertion test — expect pass**

Run: `npx supabase db execute --file supabase/tests/pricing_test.sql`
Expected: `NOTICE: pricing_test: all assertions passed`, and the transaction rolls back (no rows persist). No `ASSERT` failure.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_price_decay.sql supabase/tests/pricing_test.sql
git commit -m "feat: migration 0004 — time-decayed effective title price

pricing_config knobs + title_price_floor / title_current_price functions
+ titles_priced view; create_claim / apply_claim validate against the
decayed price. Assertion test in supabase/tests/pricing_test.sql."
```

---

## Task 2: Apply migration + regenerate DB types

**Files:**
- Modify: `src/types/database.types.ts` (via `npm run update-types` — never hand-edited)

**Interfaces:**
- Consumes: the `titles_priced` view and `title_current_price` / `title_price_floor` functions from Task 1.
- Produces: `Database['public']['Views']['titles_priced']['Row']` with columns
  `id: string`, `slug: string`, `name: string`, `emoji: string`, `description: string`,
  `created_at: string`, `current_price: number | null`, `price_floor: number | null`,
  `reign_id: string | null`, `holder_user_id: string | null`, `holder_paid: number | null`,
  `reign_started_at: string | null`, `holder_username: string | null`,
  `holder_display_name: string | null`, `holder_avatar_url: string | null`.
  Plus `Database['public']['Functions']['title_current_price']` and `['title_price_floor']`.

- [ ] **Step 1: Ensure the migration is applied to the linked project**

Run: `npx supabase db push`
Expected: `0004_price_decay.sql` reported as applied (or "up to date" if Task 1 Step 4 already pushed).

- [ ] **Step 2: Regenerate the generated types**

Run: `npm run update-types`
(That script is `npx supabase gen types typescript --linked > src/types/database.types.ts`.)

- [ ] **Step 3: Verify the new entities are present**

Run: `grep -n "titles_priced\|title_current_price\|title_price_floor" src/types/database.types.ts`
Expected: matches under `Views:` and `Functions:`. `current_price` and `price_floor` typed `number | null`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (no consumers changed yet).

- [ ] **Step 5: Commit**

```bash
git add src/types/database.types.ts
git commit -m "chore: regenerate database types for titles_priced view + pricing fns"
```

---

## Task 3: Domain types

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: nothing new (plain type edits).
- Produces:
  - `TitleCard` gains `priceFloor: number`.
  - `TitleDetail` gains `holderPaid: number | null`.
  - `PendingClaimListItem` gains `currentPrice: number | null`.

- [ ] **Step 1: Add `priceFloor` to `TitleCard`**

In `src/types/index.ts`, in the `TitleCard` type, after the `price` line add:

```typescript
  priceFloor: number;
```

- [ ] **Step 2: Add `holderPaid` to `TitleDetail`**

In the `TitleDetail` type, alongside `holderName`, add:

```typescript
  holderPaid: number | null;
```

- [ ] **Step 3: Add `currentPrice` to `PendingClaimListItem`**

In the `PendingClaimListItem` type, add:

```typescript
  currentPrice: number | null;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: FAIL — `titles.server.ts` and `claims.server.ts` no longer satisfy the widened return types (they don't set the new fields yet). This confirms the types are wired. Tasks 4 and 5 fix the errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add priceFloor / holderPaid / currentPrice to domain types"
```

---

## Task 4: `titles.server.ts` reads effective price from `titles_priced`

**Files:**
- Modify: `src/test/supabase-mock.ts` (per-table results + `in` / `not` methods)
- Modify: `src/services/titles.server.ts`
- Create: `src/services/__tests__/titles.server.test.ts`

**Interfaces:**
- Consumes: `titles_priced` view row (Task 2), `TitleCard` / `TitleDetail` with new fields (Task 3).
- Produces:
  - `createSupabaseMock` gains an optional `queryByTable?: Record<string, { data, error }>` — `from(table)` resolves to the matching entry, falling back to `query`. `from(table)` returns the **same** builder instance for the same table name (so tests can assert on its methods after the fact).
  - `getTitlesWithCurrentReign(supabase) -> Promise<TitleCard[]>` and `getTitleBySlug(supabase, slug) -> Promise<TitleDetail | null>` reading from `titles_priced`; `getRecentCoronations` / `getHallOfFame` unchanged.

- [ ] **Step 1: Rewrite `src/test/supabase-mock.ts` for per-table results**

Replace the body of `createSupabaseMock` (keep the `SupabaseMockOptions` interface, add one field) with:

```typescript
import { vi } from "vitest";
import type { SupabaseServerClient } from "@/lib/supabase/server";

type Result = { data: unknown; error: unknown };

// Options for a chainable Supabase mock: canned results per surface.
export interface SupabaseMockOptions {
  user?: { id: string } | null;
  rpc?: Result;
  query?: Result;
  queryByTable?: Record<string, Result>;
  storageUpload?: Result;
  storageRemove?: Result;
  publicUrl?: string;
}

const BUILDER_METHODS = [
  "select", "insert", "update", "delete",
  "eq", "in", "is", "not", "order", "limit",
];

function makeBuilder(result: Result) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of BUILDER_METHODS) builder[method] = vi.fn(chain);
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (r: Result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

// Builds a chainable Supabase client mock. `from(table)` returns the same
// builder per table name, resolving to queryByTable[table] ?? query.
export function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const fallback: Result = options.query ?? { data: null, error: null };
  const rpcResult: Result = options.rpc ?? { data: null, error: null };
  const builders = new Map<string, ReturnType<typeof makeBuilder>>();

  const storageBucket = {
    upload: vi.fn(async () => options.storageUpload ?? { data: { path: "p" }, error: null }),
    remove: vi.fn(async () => options.storageRemove ?? { data: [], error: null }),
    getPublicUrl: vi.fn(() => ({
      data: { publicUrl: options.publicUrl ?? "https://cdn.test/avatar.png" },
    })),
  };

  const client = {
    from: vi.fn((table: string) => {
      if (!builders.has(table)) {
        builders.set(table, makeBuilder(options.queryByTable?.[table] ?? fallback));
      }
      return builders.get(table)!;
    }),
    rpc: vi.fn(async () => rpcResult),
    storage: { from: vi.fn(() => storageBucket) },
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user ?? null },
        error: null,
      })),
    },
  };

  return client as unknown as SupabaseServerClient;
}
```

- [ ] **Step 2: Run the existing suite — expect still green**

Run: `npx vitest run`
Expected: PASS (41 tests). The rewrite is behaviour-compatible for the existing tests (`from` still memoizes per table, `rpc` / `storage` / `auth` unchanged).

- [ ] **Step 3: Write the failing mapping tests**

Create `src/services/__tests__/titles.server.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getTitlesWithCurrentReign } from "../titles.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const heldRow = {
  id: "t1",
  slug: "rey-de-cordoba",
  name: "Rey de Córdoba",
  emoji: "👑",
  description: "x",
  created_at: "2026-08-01T00:00:00Z",
  current_price: 48000,
  price_floor: 13000,
  reign_id: "r1",
  holder_user_id: "u1",
  holder_paid: 50000,
  reign_started_at: "2026-08-19T00:00:00Z",
  holder_username: "nico",
  holder_display_name: "Nico B",
  holder_avatar_url: null,
};

const unclaimedRow = {
  id: "t2",
  slug: "rey-pizza",
  name: "Rey de la Pizza",
  emoji: "🍕",
  description: "x",
  created_at: "2026-08-02T00:00:00Z",
  current_price: null,
  price_floor: 1000,
  reign_id: null,
  holder_user_id: null,
  holder_paid: null,
  reign_started_at: null,
  holder_username: null,
  holder_display_name: null,
  holder_avatar_url: null,
};

describe("getTitlesWithCurrentReign", () => {
  it("maps a held title to its effective price, floor and holder", async () => {
    const supabase = createSupabaseMock({ query: { data: [heldRow], error: null } });
    const [card] = await getTitlesWithCurrentReign(supabase);

    expect(card.price).toBe(48000);
    expect(card.priceFloor).toBe(13000);
    expect(card.holderUserId).toBe("u1");
    expect(card.holder).toEqual({
      username: "nico",
      display_name: "Nico B",
      avatar_url: null,
    });
    expect(card.reignStartedAt).toBe("2026-08-19T00:00:00Z");
  });

  it("maps an unclaimed title to a null price and holder", async () => {
    const supabase = createSupabaseMock({ query: { data: [unclaimedRow], error: null } });
    const [card] = await getTitlesWithCurrentReign(supabase);

    expect(card.price).toBeNull();
    expect(card.priceFloor).toBe(1000);
    expect(card.holder).toBeNull();
    expect(card.holderUserId).toBeNull();
  });
});

describe("getTitleBySlug", () => {
  it("returns the priced card plus past reigns, with holderPaid", async () => {
    const pastReignRows = [
      {
        id: "r0",
        price_paid: 20000,
        started_at: "2026-08-05T00:00:00Z",
        ended_at: "2026-08-19T00:00:00Z",
        profiles: { username: "juan", display_name: "Juan" },
      },
    ];
    const supabase = createSupabaseMock({
      queryByTable: {
        titles_priced: { data: heldRow, error: null },
        reigns: { data: pastReignRows, error: null },
      },
    });

    const detail = await getTitleBySlug(supabase, "rey-de-cordoba");

    expect(detail?.price).toBe(48000);
    expect(detail?.priceFloor).toBe(13000);
    expect(detail?.holderPaid).toBe(50000);
    expect(detail?.holderName).toBe("Nico B");
    expect(detail?.pastReigns).toEqual([
      {
        id: "r0",
        holderName: "Juan",
        pricePaid: 20000,
        startedAt: "2026-08-05T00:00:00Z",
        endedAt: "2026-08-19T00:00:00Z",
      },
    ]);
  });

  it("returns null when no title matches the slug", async () => {
    const supabase = createSupabaseMock({
      queryByTable: { titles_priced: { data: null, error: null } },
    });
    expect(await getTitleBySlug(supabase, "ghost")).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests — expect failure**

Run: `npx vitest run src/services/__tests__/titles.server.test.ts`
Expected: FAIL — current `getTitlesWithCurrentReign` queries `titles` with a nested `reigns` select and has no `price_floor`; the row shapes do not match, `priceFloor` / `holderPaid` assertions fail.

- [ ] **Step 5: Rewrite the reads in `src/services/titles.server.ts`**

In `src/services/titles.server.ts`:

1. **Imports:** add `PastReign` to the existing `import type { … } from "@/types"` list. Everything else the block below uses (`QueryData`, `SupabaseServerClient`, `rarity`, `Coronation`, `HallOfFameEntry`, `TitleCard`, `TitleDetail`, `TitleHolder`) is already imported.
2. **Delete:** the `TITLE_WITH_REIGNS` constant, the `titlesQuery` constant + its `TitleRow` type, the `displayName` helper, `toTitleCard`, `getTitlesWithCurrentReign`, and `getTitleBySlug`.
3. **Keep unchanged:** `coronationsQuery` / `CoronationRow`, `hallOfFameQuery` / `HallOfFameRow`, `getRecentCoronations`, `getHallOfFame`.
4. **Paste** the following where the deleted code was (it re-declares `displayName` once — byte-for-byte the deleted body; the kept functions keep using this shared copy):

```typescript
const pricedQuery = (supabase: SupabaseServerClient) =>
  supabase.from("titles_priced").select("*");
type PricedRow = QueryData<ReturnType<typeof pricedQuery>>[number];

const pastReignsQuery = (supabase: SupabaseServerClient, titleId: string) =>
  supabase
    .from("reigns")
    .select("id, price_paid, started_at, ended_at, profiles ( username, display_name )")
    .eq("title_id", titleId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false });
type PastReignRow = QueryData<ReturnType<typeof pastReignsQuery>>[number];

// Resolves a holder's best display name, or a fallback.
function displayName(
  profile: Pick<TitleHolder, "username" | "display_name"> | null,
): string {
  return profile?.display_name?.trim() || profile?.username || "Anónimo";
}

// Flattens a titles_priced row into the card shape.
function toTitleCard(row: PricedRow): TitleCard {
  const holder: TitleHolder | null = row.holder_username
    ? {
        username: row.holder_username,
        display_name: row.holder_display_name,
        avatar_url: row.holder_avatar_url,
      }
    : null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    created_at: row.created_at,
    holder,
    holderUserId: row.holder_user_id,
    price: row.current_price,
    priceFloor: row.price_floor ?? 1000,
    reignStartedAt: row.reign_started_at,
    rarity: rarity(row.current_price),
  };
}

// Fetches every title with its effective current price and holder, oldest first.
export async function getTitlesWithCurrentReign(
  supabase: SupabaseServerClient,
): Promise<TitleCard[]> {
  const { data, error } = await pricedQuery(supabase).order("created_at", {
    ascending: true,
  });

  if (error) throw error;
  return data.map(toTitleCard);
}

// Fetches one title by slug with its effective price and full past-reign history.
export async function getTitleBySlug(
  supabase: SupabaseServerClient,
  slug: string,
): Promise<TitleDetail | null> {
  const { data, error } = await pricedQuery(supabase).eq("slug", slug).maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const card = toTitleCard(data);

  const { data: pastRows, error: pastError } = await pastReignsQuery(supabase, data.id);
  if (pastError) throw pastError;

  const rows: PastReignRow[] = pastRows ?? [];
  const pastReigns: PastReign[] = rows.map((r) => ({
    id: r.id,
    holderName: displayName(r.profiles),
    pricePaid: r.price_paid,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  }));

  return {
    ...card,
    holderName: card.holder ? displayName(card.holder) : null,
    holderPaid: data.holder_paid,
    pastReigns,
  };
}
```

- [ ] **Step 6: Run the tests — expect pass**

Run: `npx vitest run src/services/__tests__/titles.server.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Full check**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green. `tsc` now passes because `TitleCard.priceFloor` / `TitleDetail.holderPaid` are set. The title-detail page already reads `title.price` / `title.holderName`; `holderPaid` / `priceFloor` are consumed in Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/test/supabase-mock.ts src/services/titles.server.ts src/services/__tests__/titles.server.test.ts
git commit -m "feat: read effective price + floor from titles_priced view"
```

---

## Task 5: `getPendingClaims` merges `currentPrice`

**Files:**
- Modify: `src/services/claims.server.ts`
- Modify: `src/services/__tests__/claims.server.test.ts`

**Interfaces:**
- Consumes: `titles_priced` view (Task 2), `PendingClaimListItem` with `currentPrice` (Task 3), the `queryByTable` option added to `createSupabaseMock` in Task 4.
- Produces: `getPendingClaims(supabase) -> Promise<PendingClaimListItem[]>` where each item has `currentPrice: number | null` (the title's effective price now, or `null` if unclaimed).

- [ ] **Step 1: Write the failing test**

In `src/services/__tests__/claims.server.test.ts`, inside `describe("getPendingClaims", …)`, add:

```typescript
  it("merges the current effective price for each claim's title", async () => {
    const claimRows = [
      {
        id: "c1",
        amount: 5000,
        created_at: "2026-08-29T00:00:00Z",
        title_id: "t1",
        profiles: { username: "nico", display_name: "Nico B" },
        titles: { name: "Rey de Córdoba", slug: "rey-de-cordoba" },
      },
    ];
    const supabase = createSupabaseMock({
      queryByTable: {
        claims: { data: claimRows, error: null },
        titles_priced: { data: [{ id: "t1", current_price: 47000 }], error: null },
      },
    });

    const result = await getPendingClaims(supabase);
    expect(result[0].currentPrice).toBe(47000);
  });
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npx vitest run src/services/__tests__/claims.server.test.ts`
Expected: FAIL — `result[0].currentPrice` is `undefined` (and the existing rows lack `title_id`, so the select string is missing it too).

- [ ] **Step 3: Implement the merge in `src/services/claims.server.ts`**

In `getPendingClaims`, (a) add `title_id` to the pending-claims `.select(...)` string, (b) after building the mapped list, fetch prices and merge:

```typescript
// Lists every pending claim with claimant, title, and the title's current effective price.
export async function getPendingClaims(
  supabase: SupabaseServerClient,
): Promise<PendingClaimListItem[]> {
  const { data, error } = await supabase
    .from("claims")
    .select(
      "id, amount, created_at, title_id, profiles ( username, display_name ), titles ( name, slug )",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = data;
  const titleIds = [...new Set(rows.map((r) => r.title_id))];

  const priceByTitle = new Map<string, number | null>();
  if (titleIds.length > 0) {
    const { data: priced, error: pricedError } = await supabase
      .from("titles_priced")
      .select("id, current_price")
      .in("id", titleIds);
    if (pricedError) throw pricedError;
    for (const p of priced) priceByTitle.set(p.id, p.current_price);
  }

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    createdAt: row.created_at,
    claimantName:
      row.profiles?.display_name?.trim() || row.profiles?.username || "Anónimo",
    titleName: row.titles?.name ?? "Título eliminado",
    titleSlug: row.titles?.slug ?? "",
    currentPrice: priceByTitle.get(row.title_id) ?? null,
  }));
}
```

- [ ] **Step 4: Update the existing "maps joined rows" test**

The existing `it("maps joined rows to the admin list item shape", …)` in
`src/services/__tests__/claims.server.test.ts` now needs `title_id` on its
fixture and `currentPrice` in the expected object. Replace that test body with:

```typescript
  it("maps joined rows to the admin list item shape", async () => {
    const rows = [
      {
        id: "c1",
        amount: 5000,
        created_at: "2026-08-29T00:00:00Z",
        title_id: "t1",
        profiles: { username: "nico", display_name: "Nico B" },
        titles: { name: "Rey de Córdoba", slug: "rey-de-cordoba" },
      },
    ];
    const supabase = createSupabaseMock({
      queryByTable: {
        claims: { data: rows, error: null },
        titles_priced: { data: [{ id: "t1", current_price: 44000 }], error: null },
      },
    });
    const result = await getPendingClaims(supabase);
    expect(result).toEqual([
      {
        id: "c1",
        amount: 5000,
        createdAt: "2026-08-29T00:00:00Z",
        claimantName: "Nico B",
        titleName: "Rey de Córdoba",
        titleSlug: "rey-de-cordoba",
        currentPrice: 44000,
      },
    ]);
  });
```

The `it("throws when the query returns an error", …)` test is unchanged — the
`error` branch returns before the `titles_priced` query runs.

- [ ] **Step 5: Run the tests — expect pass**

Run: `npx vitest run src/services/__tests__/claims.server.test.ts`
Expected: PASS (all `claims.server` tests, including the new merge test and the updated mapping test).

- [ ] **Step 6: Full check**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green (44 tests: 41 prior − 0 + the 3 added across Tasks 4–5… the exact count is whatever `vitest` reports; the gate is zero failures).

- [ ] **Step 7: Commit**

```bash
git add src/services/claims.server.ts src/services/__tests__/claims.server.test.ts
git commit -m "feat: surface each pending claim's current effective price"
```

---

## Task 6: UI — title detail + admin queue

**Files:**
- Modify: `src/app/t/[slug]/page.tsx`
- Modify: `src/features/admin/components/pending-claims-table.tsx`

**Interfaces:**
- Consumes: `TitleDetail.holderPaid` / `TitleDetail.priceFloor` (Tasks 3–4), `PendingClaimListItem.currentPrice` (Tasks 3, 5), existing `formatARS` from `@/lib/format`.
- Produces: no new exports; visual changes only.

- [ ] **Step 1: Title detail — show "coronado por" and "piso"**

In `src/app/t/[slug]/page.tsx`, in the "Estado del trono" panel, immediately after the `VALOR ACTUAL` row's closing `</div>` (the row that renders `formatARS(currentPrice ?? nextPrice)`), insert:

```tsx
            {isHeld && title.holderPaid !== null && title.holderPaid !== currentPrice && (
              <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
                <span className="text-label-caps font-label-caps text-on-surface-variant">
                  CORONADO POR
                </span>
                <span className="text-body-lg font-body-lg text-on-surface-variant">
                  {formatARS(title.holderPaid)}
                </span>
              </div>
            )}
            {isHeld && (
              <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
                <span className="text-label-caps font-label-caps text-on-surface-variant">
                  PISO
                </span>
                <span className="text-body-lg font-body-lg text-on-surface-variant">
                  {formatARS(title.priceFloor)}
                </span>
              </div>
            )}
```

- [ ] **Step 2: Admin queue — show "precio ahora" per row**

In `src/features/admin/components/pending-claims-table.tsx`, in `ClaimRow`, inside the left-hand `<div className="flex flex-col gap-0.5">`, after the claimant/age `<span>` and before the `state?.success === false` error span, add:

```tsx
        {claim.currentPrice !== null && (
          <span className="text-label-caps font-label-caps text-on-surface-variant">
            precio ahora {formatARS(claim.currentPrice)} · mínimo{" "}
            {formatARS(claim.currentPrice + 1000)}
          </span>
        )}
```

- [ ] **Step 3: Build + type-check**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 4: Visual check (if a dev server + browser are available)**

Run `npm run dev`, open `/t/<a-held-title-slug>` and `/admin` (as an admin). Confirm the "CORONADO POR" / "PISO" rows render on a held title and "precio ahora … · mínimo …" renders per pending claim. Screenshot for the reviewer.
If no browser is available, note it; the build passing is the gate.

- [ ] **Step 5: Commit**

```bash
git add src/app/t/[slug]/page.tsx src/features/admin/components/pending-claims-table.tsx
git commit -m "feat: show holder-paid + floor on title detail, current price in admin queue"
```

---

## Task 7: Update `DESIGN.md`

**Files:**
- Modify: `docs/DESIGN.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Add a "Price decay" paragraph to §2 (Core Mechanic)**

In `docs/DESIGN.md`, in section `## 2. Core Mechanic — Direct Takeover`, after the bullet list ("- Reigns do NOT expire…"), add:

```markdown
### Price decay (v1.1)

A held title's **current price is not static**. It is `price_paid` of the active
reign decayed toward a per-title floor: after a 3-day grace period the price
loses ~0.7%/day (compounding). The floor is
`max($1.000, 25% of the title's recent 90-day price peak, $2.000 × dethrones in
the last 30 days)`. So an undefended crown slowly gets cheaper (~6 months to
reach its floor at the default rate; longer once the peak term ages out of its
90-day window), a hot title keeps a high floor while defended, and a title that
cooled off becomes affordable again. The dethrone threshold is `current effective price + $1.000`.
All decay parameters live in a single-row `pricing_config` table, tunable with an
`UPDATE`. The effective price is computed on read (no cron, no stored column) by
the `title_current_price` Postgres function and exposed through the
`titles_priced` view.
```

- [ ] **Step 2: Note it in §3 (`reigns` table description)**

In section `## 3. Domain Model`, under `### `reigns``, after the line
"**Active reign = `ended_at IS NULL`.**…", add:

```markdown
- The **current price is derived, then time-decayed**: `title_current_price(title_id)`
  applies `pricing_config` decay to the active reign's `price_paid` / `started_at`,
  floored by `title_price_floor(title_id)`. `reigns.price_paid` always records the
  real amount paid; decay only affects the live threshold, never stored history.
```

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: document price decay in DESIGN.md"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §3.1 `pricing_config` | Task 1 Step 3 (table + seed + RLS + grant) |
| §3.2 `title_price_floor` | Task 1 Step 3 |
| §3.3 `title_current_price` | Task 1 Step 3 |
| §3.4 properties (multiple-of-1000, monotonic, unclaimed→NULL) | Task 1 Steps 1/5 (assertion cases 1–6) |
| §4.1 `titles_priced` view | Task 1 Step 3; consumed Task 4 |
| §4.2 `create_claim` / `apply_claim` | Task 1 Step 3 (message text preserved) |
| §4.3 types (`priceFloor`, `holderPaid`, `currentPrice`) | Task 3 |
| §4.3 `titles.server.ts` (view read, split past reigns, `rarity` on effective) | Task 4 |
| §4.3 `getRecentCoronations` unchanged | Task 4 Step 3 (left as-is) |
| §4.3 `getPendingClaims` + `currentPrice` | Task 5 |
| §4.4 `/t/[slug]` "coronado por" / "piso" | Task 6 Step 1 |
| §4.4 admin "precio ahora" | Task 6 Step 2 |
| §4.4 OG image | no task needed — already reads `title.price`, now effective (verified by Task 6 Step 3 build) |
| §4.4 `DESIGN.md` | Task 7 |
| §5 migration ordering | Task 1 Step 3 (statements in spec order) |
| §6 `pricing_test.sql` | Task 1 Steps 1/5 |
| §7 rollout (apply + `update-types`) | Task 2 |

No gaps.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step has literal code. SQL and TS are complete.

**3. Type consistency:** View column names (`current_price`, `price_floor`, `holder_user_id`, `holder_paid`, `reign_started_at`, `holder_username/display_name/avatar_url`) are identical in Task 1's `CREATE VIEW`, Task 2's Interfaces block, and Task 4's `toTitleCard`. Domain field names (`priceFloor`, `holderPaid`, `currentPrice`) match across Tasks 3, 4, 5, 6. `title_current_price` / `title_price_floor` spelled consistently in every task. `getPendingClaims` selects `title_id` (Task 5 Step 3) which the merge and both `getPendingClaims` tests rely on. No `as X` assertions on Supabase responses — `titles.server.ts` uses `QueryData<…>` inference and `pastRows ?? []`.

**Note on the `titles.server.ts` rewrite (Task 4 Step 5):** the file currently also exports `getHallOfFame`, `getRecentCoronations`, and module-level query constants (`coronationsQuery`, `hallOfFameQuery`, `TITLE_WITH_REIGNS`). The rewrite replaces only `TITLE_WITH_REIGNS` + `titlesQuery` + `toTitleCard` + `getTitlesWithCurrentReign` + `getTitleBySlug`. Preserve `coronationsQuery`, `hallOfFameQuery`, `getRecentCoronations`, `getHallOfFame` verbatim, and keep a single shared `displayName` helper (the rewrite's version is identical to the existing one).

**4. Test-count drift:** the plan's "Full check" steps say "all green" / "zero failures" rather than pinning a number, because Tasks 4–5 add and rewrite tests. Trust the runner's summary, not a hardcoded count.
