# Dethrone with Coronas — Design

*2026-10-07 — approved design. Roadmap day D5. Branch: `feat/dethrone-with-coins`.*

## 1. Context & motivation

D4 shipped the Coronas wallet (`coin_ledger`, derived `coin_balance`, 20 👑 welcome
grant) but dethroning still runs on the validation-MVP flow: a pending `claim`, a
"transfer to this alias" screen, and an admin confirming in `/admin`. D5 makes
dethroning spend Coronas in one atomic step and retires the manual flow, so a
visitor can log in as a guest and take a crown in seconds.

## 2. Goals / non-goals

**Goals**
- One `SECURITY DEFINER` RPC, `dethrone_with_coins`, does the whole transfer
  atomically: validate live price + balance, debit the challenger, end the old
  reign, start the new one, credit the dethroned holder.
- **Zero-sum compensation:** the dethroned holder receives exactly what the new
  holder paid. Claiming an *unclaimed* title only debits — those Coronas are burned
  (the economy's only sink).
- The challenger may offer more than the minimum (a higher price protects the crown).
- Coronation message (≤ 80 chars) kept, stored on the reign.
- Retire the manual flow: `claims` table, `create_claim` / `apply_claim` /
  `reject_claim`, `/admin`, payment instructions, `PAYMENT_ALIAS`.
- Title page shows the viewer's balance and blocks the button when it is short.
- Wallet movements say what happened ("Destronaste a Nico · Rey de Córdoba").
- A thin, non-dismissible "demo" banner on every page.
- Header balance chip refreshes after a dethrone.

**Non-goals (later days)**
- Coronation-message moderation (until D18/D23, an offensive message is cleared
  with SQL: `update reigns set message = null where id = …`).
- Notifications / "¡Te destronaron!" toast — D9. Daily salary — D6. Bots — D7.
- Guest-farming abuse (new guests funding one account) — D23.
- Keeping `/admin` or `requireAdmin` for future use — D18 re-adds what it needs
  (`profiles.is_admin` stays).

## 3. Database (migration `0007_dethrone_with_coins.sql`)

### 3.1 Retire the manual flow

```
DROP FUNCTION public.create_claim(uuid, integer, text);
DROP FUNCTION public.apply_claim(uuid, boolean);
DROP FUNCTION public.reject_claim(uuid);
DROP TABLE public.claims;
```

Production has 0 claims (verified at D4 rollout; re-checked before the push).

### 3.2 Ledger references and integrity

- `coin_ledger.reign_id uuid NULL REFERENCES reigns(id) ON DELETE SET NULL` —
  the reign a `dethrone` / `dethroned` movement belongs to.
- `reason` CHECK becomes `IN ('welcome', 'dethrone', 'dethroned')`.
- Sign rule: `dethrone` amounts are negative, every other reason positive.
- The RPC always sets `reign_id` on `dethrone` / `dethroned` rows, but the column
  stays nullable with no "required" CHECK: deleting an account cascades to its
  reigns, and `SET NULL` must not block that delete nor rewrite other users'
  balances (a CHECK requiring `reign_id` would make the delete fail).

### 3.3 `dethrone_with_coins(p_title_id uuid, p_amount integer, p_message text DEFAULT NULL) RETURNS reigns`

`SECURITY DEFINER`, `SET search_path = ''`, EXECUTE for `authenticated` only.

1. `auth.uid()` NULL → `'Not authenticated'`.
2. `p_amount <= 0` → `'Amount must be positive'`. Message trimmed; empty → NULL;
   > 80 chars → `'Message too long'`.
3. Lock the title row: `SELECT … FROM titles WHERE id = p_title_id FOR UPDATE`;
   not found → `'Title not found'`. This serializes every attempt on one title,
   unclaimed ones included (they have no reign row to lock).
4. Read the active reign. Caller is the holder → `'You already hold this title'`.
5. Minimum = `title_current_price + 1` when held, `1` when unclaimed;
   `p_amount <` minimum → `'Amount must be at least %'`.
6. Lock the challenger's `profiles` row `FOR NO KEY UPDATE`, then
   `coin_balance(caller) < p_amount` → `'Insufficient balance'`. Lock order is
   always title → challenger profile. The profile lock must be `NO KEY UPDATE`,
   not `FOR UPDATE`: the FK checks on `dethroned_user_id` and the ledger credit take
   `KEY SHARE` on the old holder's profile, and `FOR UPDATE` would deadlock two
   users dethroning each other at the same moment (found in review, reproduced).
7. End the active reign (`ended_at = now()`); insert the new reign
   `(title_id, user_id, price_paid = p_amount, message, dethroned_user_id = old holder)`.
8. Ledger: `(caller, -p_amount, 'dethrone', new_reign.id)`; if the title was held,
   `(old_holder, +p_amount, 'dethroned', new_reign.id)`.
9. Return the new reign.

## 4. App

- **Service** `src/services/dethrone.server.ts`: `dethrone(supabase, titleId, amount, message?)`
  → RPC, throws on error. Replaces `services/claims.server.ts`.
- **Action** `src/actions/dethrone.ts` (replaces `actions/claims.ts`): `destronar`
  — auth → `dethroneSchema` → service → `revalidatePath("/", "layout")`. Error
  mapping adds `'Insufficient balance'` → "No te alcanzan las Coronas." and
  `'Title not found'` → generic. `resolverClaim` is deleted.
- **Title page** `/t/[slug]`: drops `getPendingClaim` and `PaymentInstructions`;
  fetches the viewer's balance (`getBalance`) and passes it to `DethroneForm`,
  which shows "Tu saldo: 20 👑" and, when `balance < minAmount`, a disabled button
  "TE FALTAN N 👑". Double submit stays blocked while pending.
- **Wallet card**: `getRecentMovements` joins the reign (title name, holder and
  dethroned names). A pure helper `describeMovement(movement)` builds the label:
  - `welcome` → "Saldo inicial"
  - `dethrone` with a dethroned holder → "Destronaste a {name} · {title}"
  - `dethrone` on an unclaimed title → "Te coronaste · {title}"
  - `dethroned` → "Te destronó {name} · {title}"
- **Demo banner** `src/components/demo-banner.tsx` (server component), first child
  of the content wrapper in `app/layout.tsx` (in flow, right below the fixed
  header): "DEMO DE PORTFOLIO · LAS CORONAS SON FICTICIAS, NO SE USA PLATA REAL".
- **Deleted:** `app/admin/`, `features/admin/`,
  `features/dethrone/components/payment-instructions.tsx`, `services/claims.server.ts`
  (+ test), `actions/claims.ts` (+ test), `requireAdmin`, types `Claim` and
  `PendingClaimListItem`, `PAYMENT_ALIAS` (from `lib/env.ts`, `.env.example`, the
  CI workflow; Nico removes it from Vercel).
- `src/types/database.types.ts` regenerated (`npm run update-types`).

## 5. Docs

- `docs/DESIGN.md`: §2 dethrone flow rewritten for Coronas (atomic RPC, zero-sum
  compensation, burn on unclaimed titles); §3 drops `claims`, adds `reign_id` and
  the new reasons to `coin_ledger`; §4 drops `/admin`; fixes "Five tables" count.
- `AGENTS.md`: the admin-confirm security rule is replaced by "dethrones happen
  only through `dethrone_with_coins`".
- `docs/ROADMAP.md`: tick D5.

## 6. Rollout

Same as D4: PR green → `db push` of `0007` → merge immediately. Old `main` code
queries `claims`, so title pages error for those minutes. Before the push, confirm
the remote still has 0 claims.

## 7. Testing

- **SQL** `supabase/tests/dethrone_test.sql` (BEGIN/ROLLBACK, authenticated role via
  `request.jwt.claims`):
  - held title: challenger −X, old holder +X, new active reign belongs to the
    challenger with `dethroned_user_id` set and the message stored;
  - unclaimed title: only the debit exists (burn);
  - rejects: amount = current price, insufficient balance, own title, message > 80;
  - clients still cannot insert into `coin_ledger` directly.
  `coronas_test.sql` gains "no profile without a welcome row" (deferred D4 minor).
  `npm run test:sql` runs all three files.
- **Vitest:** `dethrone` service, `destronar` action (error mapping incl.
  insufficient balance, `revalidatePath("/", "layout")`), `describeMovement`,
  `getRecentMovements` join shape.
- **Manual:** two guests on the local stack — one claims a free title, the other
  dethrones them; both chips and wallets show the movements.
