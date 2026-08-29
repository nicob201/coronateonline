# Price Decay for the ARS Title Model — Design

*2026-08-29 — approved design. Branch: `feat/price-decay`.*

## 1. Context & motivation

Today a title's current price is exactly `price_paid` of its active reign, and the
dethrone threshold is `price_paid + $1.000`. This ratchets up forever: a popular
title climbs without bound, eventually freezes with a permanent holder, and the
game goes stale. Unpopular titles never move either.

This change makes the current price a **time-decayed function** of the active
reign, floored per title by that title's recent activity and its recent price
peak. A crown nobody defends slowly loses value toward its floor (≈1–2 months to
reach it at the default rate); a hot title keeps a high floor and stays a
valuable target; a title that cooled off sees its floor fall and becomes
affordable again. Self-correcting per title, no global reset.

Virtual currency ("coronas") was considered and deferred — it weakens the MVP's
validation signal ("will people pay real money for an absurd title") and adds a
balance liability plus regulatory questions. Price decay is the piece we need now.

## 2. Goals / non-goals

**Goals**
- Current price of a held title decays over time toward a per-title floor.
- Floor reflects recent dethrone activity and recent price peak.
- All price validation (claim creation, claim apply) uses the decayed price.
- One source of truth for the formula: Postgres. No TS reimplementation.
- Tunable without a migration.
- No cron, no stored/derived price column — computed on read.

**Non-goals (deferred)**
- "Recharge" action (holder pays to re-anchor their price upward) — v2.
- Decay indicator / "▼ bajando" UI affordance — v2.
- Admin UI for tuning `pricing_config` — SQL only for now.
- Notifications when a price crosses a threshold.

## 3. The pricing model

### 3.1 Configuration — `pricing_config`

Single-row table, seeded by the migration. Tuning is `UPDATE pricing_config SET …`.

| column | type | default | meaning |
|---|---|---|---|
| `decay_rate_daily` | `numeric` | `0.007` | fraction of price lost per day, compounding, after the grace period |
| `grace_days` | `integer` | `3` | days at the start of a reign with no decay |
| `peak_floor_fraction` | `numeric` | `0.25` | floor ≥ this × the recent price peak |
| `peak_window_days` | `integer` | `90` | window that defines "recent" for the peak |
| `activity_floor_unit` | `integer` | `2000` | floor ≥ this × dethrones in the last 30 days |

Constraints: `id integer primary key default 1 check (id = 1)` (enforces one row);
`decay_rate_daily >= 0 and decay_rate_daily < 1`; `grace_days >= 0`;
`peak_floor_fraction >= 0 and peak_floor_fraction <= 1`; `peak_window_days > 0`;
`activity_floor_unit >= 0`.

RLS enabled, `SELECT USING (true)` (game rules are public), no write policy.
`GRANT SELECT ON pricing_config TO anon, authenticated`.

### 3.2 `title_price_floor(p_title_id uuid) → integer`

`STABLE`, `SECURITY DEFINER`, `SET search_path = ''`.

```
cfg          := SELECT * FROM public.pricing_config WHERE id = 1;
recent_peak  := COALESCE(
                  (SELECT max(price_paid) FROM public.reigns
                   WHERE title_id = p_title_id
                     AND started_at > now() - make_interval(days => cfg.peak_window_days)),
                  0);
recent_count := (SELECT count(*) FROM public.reigns
                 WHERE title_id = p_title_id
                   AND started_at > now() - interval '30 days');

RETURN GREATEST(
  1000,                                                              -- BASE_PRICE
  (round(recent_peak * cfg.peak_floor_fraction / 1000) * 1000)::int, -- peak component
  cfg.activity_floor_unit * recent_count                             -- activity component
);
```

Notes:
- `recent_peak` includes the current reign (its `started_at` is recent).
- A title with no reigns at all → `GREATEST(1000, 0, 0)` = 1000.
- Result is always a positive multiple of 1000.

### 3.3 `title_current_price(p_title_id uuid) → integer`

`STABLE`, `SECURITY DEFINER`, `SET search_path = ''`. Returns `NULL` when the
title has no active reign (unclaimed).

```
r := SELECT started_at, price_paid FROM public.reigns
     WHERE title_id = p_title_id AND ended_at IS NULL;
IF NOT FOUND THEN RETURN NULL; END IF;

cfg        := SELECT * FROM public.pricing_config WHERE id = 1;
days_held  := extract(epoch FROM now() - r.started_at) / 86400.0;   -- fractional
decay_days := GREATEST(0, days_held - cfg.grace_days);
-- cast both args to double precision so `power` resolves unambiguously
decayed    := r.price_paid * power((1 - cfg.decay_rate_daily)::double precision,
                                   decay_days::double precision);

RETURN GREATEST(
  public.title_price_floor(p_title_id),
  (round(decayed / 1000) * 1000)::int
);
```

### 3.4 Properties

- **Multiple of 1000.** Every branch rounds to a multiple of 1000; `GREATEST`
  of multiples of 1000 is a multiple of 1000.
- **Monotonic non-increase for a fixed active reign.** Decay only decreases the
  price over time. The floor cannot rise while this reign is active because a new
  reign (which would bump `recent_count` / `recent_peak`) can only start by
  ending this one. Therefore a claim amount that clears at creation still clears
  at apply time — no new race window. (The existing race — someone else's claim
  applied first — is unchanged and already handled.)
- **Unclaimed titles unaffected.** `NULL` current price → UI shows "Sin coronar",
  `minClaimAmount(null)` = `BASE_PRICE`, same path as today.
- **Continuous.** `days_held` is fractional; price decays smoothly, not in daily
  steps.

### 3.5 Worked example

`price_paid = 50.000`, defaults (`0.7%/day`, `3` grace days):

| days held | decay_days | decayed (pre-floor) | rounded |
|---|---|---|---|
| 1 | 0 | 50.000 | 50.000 |
| 3 | 0 | 50.000 | 50.000 |
| 10 | 7 | 50.000 × 0.993⁷ ≈ 47.600 | 48.000 |
| 33 | 30 | 50.000 × 0.993³⁰ ≈ 40.500 | 40.000 |
| 63 | 60 | ≈ 32.800 | 33.000 |
| 93 | 90 | ≈ 26.600 | 27.000 |

…until it meets the title's floor, then it holds there.

## 4. Architecture

### 4.1 Read path — `titles_priced` view

```sql
CREATE VIEW titles_priced WITH (security_invoker = true) AS
SELECT
  t.id, t.slug, t.name, t.emoji, t.description, t.created_at,
  public.title_current_price(t.id) AS current_price,   -- NULL if unclaimed
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
```

`GRANT SELECT ON titles_priced TO anon, authenticated`. Same public-read posture
as `titles` / `reigns`. `security_invoker = true` so RLS on the base tables is
evaluated as the caller; the two pricing functions are `SECURITY DEFINER` so they
always see `pricing_config` and `reigns`.

### 4.2 Write path — RPC validation

`0004_price_decay.sql` does `CREATE OR REPLACE FUNCTION` on both:

- **`create_claim`** — replace
  `IF p_amount < v_active_reign.price_paid + 1000` with
  ```
  v_current := public.title_current_price(p_title_id);
  IF p_amount < v_current + 1000 THEN
    RAISE EXCEPTION 'Amount must be at least %', v_current + 1000;
  ```
  Message shape ("at least") is unchanged → the existing Spanish mapping in
  `translateRpcError` ("alguien pagó más") still matches. The "already hold this
  title" and "one pending claim per user" guards are kept verbatim.

- **`apply_claim`** — replace
  `v_claim.amount < v_active_reign.price_paid + 1000` with
  `v_claim.amount < public.title_current_price(v_claim.title_id) + 1000`.
  Message "below the current price" unchanged.

The new reign after apply still anchors at `v_claim.amount` with the new
`started_at` — that becomes the decay anchor for the next holder.

### 4.3 Service & type changes (`src/`)

`types/index.ts`
- `TitleCard.price` stays `number | null` — now the **effective** price.
- `TitleCard` gains `priceFloor: number`.
- `TitleDetail` gains `holderPaid: number | null` (what the current holder paid).
- `PendingClaimListItem` gains `currentPrice: number | null`.

`services/titles.server.ts`
- `getTitlesWithCurrentReign` → `SELECT * FROM titles_priced ORDER BY created_at`.
  Map the flat row to `TitleCard` (`price = current_price`, `holder` built from
  `holder_*` columns or `null`, `priceFloor = price_floor`).
- `getTitleBySlug` → one `titles_priced` row by slug for the card/current data,
  plus a **second** query on `reigns` (`ended_at IS NOT NULL`, newest first,
  joined to `profiles`) for `pastReigns`. Adds `holderPaid` and `priceFloor` to
  the returned `TitleDetail`.
- `getRecentCoronations` — unchanged (shows each coronation's historical
  `price_paid`).
- `rarity()` now receives the effective price; `lib/titles.ts` unchanged
  (`rarity` / `minClaimAmount` already take `number | null`).

`services/claims.server.ts`
- `getPendingClaims` — after fetching the pending claims, run a second query
  `SELECT id, current_price FROM titles_priced WHERE id = ANY(<title_ids>)` and
  merge `currentPrice` into each `PendingClaimListItem`.

No changes to `lib/titles.ts` constants — decay config lives only in the DB.

### 4.4 UI (minimal, v1)

- **`/t/[slug]`** (`app/t/[slug]/page.tsx`): "VALOR ACTUAL" shows the effective
  `current_price`. Add a small secondary line: `coronado por {formatARS(holderPaid)}`
  when `holderPaid !== current_price`, and `piso {formatARS(priceFloor)}`.
  "PRECIO MÍNIMO" already renders `minClaimAmount(current_price)`. Owner panel and
  dethrone form logic unchanged.
- **Cards** (`title-card.tsx`, `trending-title.tsx`): "Valor: $X" already reads
  `title.price` → now effective. No copy change, no decay badge in v1.
- **OG image** (`app/t/[slug]/opengraph-image.tsx`): already reads `title.price` →
  effective.
- **Admin** (`features/admin/components/pending-claims-table.tsx`): show
  `currentPrice` per row (e.g. `precio ahora $X`) so the admin can see whether a
  pending claim still clears before confirming.
- **`docs/DESIGN.md`**: add a "Price decay" paragraph to §2 and a note to the
  `reigns` description in §3 that current price is time-decayed and per-title
  floored.

## 5. Data model — migration `0004_price_decay.sql`

Ordered statements:

1. `CREATE TABLE pricing_config` (+ CHECKs), `INSERT` the single default row,
   `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, `CREATE POLICY … FOR SELECT USING (true)`,
   `GRANT SELECT … TO anon, authenticated`.
2. `CREATE FUNCTION public.title_price_floor(uuid)` and
   `CREATE FUNCTION public.title_current_price(uuid)` — both `STABLE`,
   `SECURITY DEFINER`, `SET search_path = ''`.
   `REVOKE EXECUTE … FROM public` then `GRANT EXECUTE … TO anon, authenticated`
   (mirrors the grant pattern in 0001/0002; the view needs them and so may
   future callers).
3. `CREATE VIEW public.titles_priced WITH (security_invoker = true) AS …`,
   `GRANT SELECT … TO anon, authenticated`.
4. `CREATE OR REPLACE FUNCTION public.create_claim(uuid, integer)` and
   `public.apply_claim(uuid)` with the effective-price checks. Re-apply the
   `REVOKE … / GRANT EXECUTE … TO authenticated` lines (a replace can reset
   grants).

No backfill: the formula is a pure function of columns that already exist
(`reigns.price_paid`, `reigns.started_at`).

After the migration is applied to the linked project, run `npm run update-types`
to regenerate `src/types/database.types.ts` (adds the `titles_priced` view and
the two functions).

## 6. Testing

**`supabase/tests/pricing_test.sql`** — plain assertion script, no pgTAP
framework. Runnable with `supabase db execute --file …` (or `psql -f …`) against
a local Supabase. Structure: in a transaction, insert a `profiles` row, a
`titles` row, and `reigns` rows with `started_at` set to fixed offsets
(`now() - interval 'N days'`) and known `price_paid`; then `DO $$ BEGIN ASSERT
… ; END $$;` blocks; `ROLLBACK` at the end. Cases:

1. Within grace (`started_at = now() - 1 day`) → price == `price_paid`.
2. After grace (`now() - 10 days`, `price_paid = 50.000`) → price ≈ 48.000
   (assert exact rounded value).
3. Floored by peak fraction — an old, decayed reign whose decayed price would be
   below `0.25 × recent_peak` → price == the peak floor.
4. Floored by activity — several `reigns` in the last 30 days → price ==
   `activity_floor_unit × count` when that dominates.
5. Unclaimed title (no active reign) → `title_current_price` IS NULL,
   `title_price_floor` == 1000.
6. Monotonic — price at `now() - 40 days` ≤ price at `now() - 10 days` for the
   same `price_paid`.

This is the required runnable check for the money path.

**Vitest** — existing `claims` service/action tests are unaffected (they mock the
RPC; exception message shapes are unchanged). Optionally add one mapping test in
a new `services/__tests__/titles.server.test.ts` asserting a `titles_priced` row
maps to `TitleCard` with `price = current_price`; not required for v1.

## 7. Rollout / ops

- Apply `0004_price_decay.sql` to the linked Supabase project; run
  `npm run update-types`.
- Ship the TS changes (types → services → UI) in that order.
- Tuning post-launch: `UPDATE pricing_config SET decay_rate_daily = …, …
  WHERE id = 1;`. Effects are immediate (computed on read).
- Rollback: `0004` is additive except the `CREATE OR REPLACE` of `create_claim` /
  `apply_claim`. A down-migration would restore the 0002 bodies of those two
  functions and `DROP` the view / functions / table.

## 8. Open questions

None outstanding. Tuning values (`0.007`, `3`, `0.25`, `90`, `2000`) are
first guesses, live in `pricing_config`, and are expected to change after launch.
