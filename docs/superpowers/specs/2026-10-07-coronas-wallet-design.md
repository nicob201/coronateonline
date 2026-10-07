# Coronas Wallet — Design

*2026-10-07 — approved design. Roadmap day D4. Branch: `feat/coronas-wallet`.*

## 1. Context & motivation

The validation MVP charged real ARS through a manual transfer + admin confirmation.
The portfolio roadmap (`docs/ROADMAP.md`) replaces that with a virtual currency,
**Coronas (👑)**, so a visitor can play in 30 seconds without paying. D4 introduces
the currency and the wallet; D5 makes dethroning spend it.

Two changes ship together because they share one migration and one deploy window:

1. **Rescale** every amount from ARS to Coronas at **1 👑 = $1.000**. Prices read
   "40 👑" instead of "$40.000".
2. **Wallet**: an append-only ledger of coin movements; balance is derived from it,
   never stored. Every user (guests included) starts with **20 👑**.

## 2. Goals / non-goals

**Goals**
- All stored amounts and pricing math in Coronas; base price 1, increment 1.
- Pricing behaviour unchanged: `round(x/1000)*1000` in ARS is exactly `round(x)`
  in Coronas, so decay, floors and thresholds produce the same prices ÷ 1000.
- `coin_ledger` table; balance = `SUM(amount)` in one SQL function, `coin_balance`.
- 20 👑 welcome grant for every new profile and a backfill for existing ones,
  at most once per user (DB-enforced).
- Balance chip in the header; "Billetera" card on `/perfil` (balance + last 10
  movements).
- `DESIGN.md` v2 and `AGENTS.md` describe Coronas, not ARS.

**Non-goals (later days)**
- Spending Coronas, dethroned-holder compensation, `dethrone_with_coins` RPC — **D5**.
- Retiring the claims/admin/payment-alias flow — **D5**.
- Daily salary — **D6**. Buying Coronas — **D28**.
- Guest-account farming of welcome grants — **D23** security review.
- Public balances / "magnates" ranking — **D16**.

## 3. Rescale (migration `0006_coronas.sql`, part 1)

All existing amounts are multiples of 1000 (enforced by CHECK), so division is exact.

| Object | Before | After |
|---|---|---|
| `reigns.price_paid`, `claims.amount` | ARS, CHECK `% 1000 = 0` | ÷ 1000; multiple-of-1000 CHECKs dropped, `> 0` kept |
| `pricing_config.activity_floor_unit` | 2000, CHECK `% 1000 = 0` | 2, CHECK `>= 0` |
| `title_price_floor` | `GREATEST(1000, round(peak·f/1000)·1000, …)` | `GREATEST(1, round(peak·f), …)` |
| `title_current_price` | `round(decayed/1000)·1000` | `round(decayed)` |
| `create_claim` / `apply_claim` | multiple-of-1000 check, `+ 1000`, min 1000 | positive check, `+ 1`, min 1 |

Order inside the migration: drop the multiple-of-1000 CHECKs → divide the data →
replace the functions. One transaction.

App side: `BASE_PRICE = 1`, `MIN_INCREMENT = 1`; rarity thresholds 50 / 20;
`formatARS` → `formatCoronas` (`"40 👑"`, es-AR grouping); the dethrone schema and
form accept positive integers (`step={1}`); `priceFloor ?? 1000` → `?? BASE_PRICE`;
the claims action stops matching the "multiple of 1000" RPC message.
`supabase/seed.sql` and `supabase/tests/pricing_test.sql` move to the new scale.

## 4. Wallet (migration `0006_coronas.sql`, part 2)

```sql
coin_ledger (
  id         uuid PK default gen_random_uuid(),
  user_id    uuid NOT NULL → profiles(id) ON DELETE CASCADE,
  amount     integer NOT NULL CHECK (amount <> 0),   -- signed: credit > 0, debit < 0
  reason     text NOT NULL CHECK (reason IN ('welcome')),
  created_at timestamptz NOT NULL default now()
)
index (user_id, created_at DESC)
unique index (user_id) WHERE reason = 'welcome'       -- one welcome grant per user
```

Each later day widens the `reason` CHECK in its own migration (D5: `dethrone`,
`dethroned`; D6: `salary`) and adds any reference column it needs.

- **Balance:** `coin_balance(p_user_id uuid) RETURNS integer`, `STABLE`,
  `SECURITY INVOKER`: `COALESCE(SUM(amount), 0)`. The only place the formula lives.
  Called by the app via RPC (RLS limits it to the caller's own rows) and, in D5,
  by `SECURITY DEFINER` RPCs.
- **Welcome grant:** trigger `AFTER INSERT ON profiles` → `grant_welcome_coins()`
  (`SECURITY DEFINER`) inserts `(+20, 'welcome')`. It hangs off `profiles`, not
  `auth.users`, so `handle_new_user` stays untouched and guests get it too. The
  amount is a literal in the function: changing it is a versioned migration.
- **Backfill:** the migration inserts `(+20, 'welcome')` for every existing profile
  without one.
- **Security:** RLS on; `SELECT` policy `auth.uid() = user_id`; `SELECT` granted to
  `authenticated` only; `INSERT/UPDATE/DELETE` revoked from `anon, authenticated`.
  The ledger is written only by the trigger and (D5+) `SECURITY DEFINER` RPCs.
- **D5 spend pattern (validates this design):** the spend RPC locks the spender's
  `profiles` row `FOR UPDATE`, reads `coin_balance`, rejects if insufficient, then
  inserts the debit — concurrent spends by one user serialize on that lock.

## 5. App

- `src/services/wallet.server.ts`: `getBalance(supabase, userId)` (RPC
  `coin_balance`) and `getRecentMovements(supabase, userId, limit = 10)`.
- `src/types/index.ts`: `CoinMovement` derived from the generated `coin_ledger` row.
- `SiteHeader`: for signed-in users, a balance chip (`20 👑`) linking to `/perfil`,
  visible on mobile and desktop.
- `/perfil`: a "Billetera" card above the edit form — balance plus the last 10
  movements (`Saldo inicial` · `+20 👑` · date in es-AR).
- `src/types/database.types.ts` regenerated with `npm run update-types`.

## 6. Docs

- `docs/DESIGN.md` → v2: product framed around Coronas; amounts and the decay floor
  in 👑 (`max(1, 25% of recent peak, 2 × dethrones in 30 days)`); `coin_ledger` in
  the domain model; the manual payment flow marked as transitional until D5.
- `AGENTS.md`: intro and the money rule become "Money is integer Coronas (👑),
  positive integers. Balance is derived from `coin_ledger`, never stored."
- `docs/ROADMAP.md`: tick D4.

## 7. Rollout

One Supabase project serves dev and the live demo. Applying `0006` while `main`
still runs the old code shows "$40" prices and breaks claim creation (old schema
demands multiples of 1000). So:

1. PR green on CI (unit tests + build don't need the DB).
2. Apply `0006` to the Supabase project, regenerate types if anything differs,
   then merge immediately. Downtime window: minutes.

Known transitional state until D5 ships: the payment-instructions screen and the
admin claims table show amounts in 👑.

## 8. Testing

- **Vitest:** `formatCoronas`; `minClaimAmount` / `rarity` at the new scale; the
  dethrone schema accepting non-multiples of 1000; `wallet.server` with the
  chainable Supabase mock; existing tests updated to the new scale.
- **SQL** (`supabase/tests/coronas_test.sql`, same BEGIN/ROLLBACK style as
  `pricing_test.sql`): a new `auth.users` row yields a profile with balance 20; a
  second welcome insert for the same user fails; `coin_balance` sums signed rows.
  `pricing_test.sql` rewritten at the new scale must still pass. `npm run test:sql`
  runs both files.
