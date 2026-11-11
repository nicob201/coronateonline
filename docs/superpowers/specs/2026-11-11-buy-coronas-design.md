# Buy Coronas — Design

*2026-11-11 — roadmap day D28, PENDING Nico's approval (presented in chat, not yet approved). Branch: `feat/buy-coronas`.*

## 1. Context & intent

The roadmap's money model ends with "buy Coronas with a sandbox checkout and an idempotent, signed webhook", to show a real payments integration. Nico doesn't want to pick or sign up for a provider yet: the code must be ready to plug in Stripe or Mercado Pago later, and the flow must already work end to end.

So D28 ships the provider-agnostic part (packs, purchases, signed webhook, idempotent credit) plus a **simulated provider** that plays the provider's role: a checkout page of our own and a signed webhook event. Connecting a real provider later means writing one adapter, nothing else.

## 2. Goals / non-goals / anti-goals

**Goals**
- A signed-in player (guests included) buys a pack of Coronas from `/comprar` and sees the new balance.
- The credit happens only through the webhook path: signature verified, amount checked against the database, credited at most once per purchase.
- Swapping in Stripe or Mercado Pago touches one file (the provider adapter) plus env vars.

**Non-goals**
- A real provider, real card forms, refunds, chargebacks, receipts or invoices.
- Purchase history beyond the wallet's movement list.

**Anti-goals**
- The client deciding the price or the amount credited.
- A double credit when the same webhook arrives twice (providers retry).
- Collecting anything that looks like card data on the simulated checkout.
- An unlimited faucet that wrecks the game: the sandbox is free, so purchases are capped.

## 3. Rules (my calls, tunable)

- Three packs, seeded in a `coin_packs` table so prices live in the database: **10 👑 for $500**, **25 👑 for $1.000**, **60 👑 for $2.000** (fictitious ARS, integer pesos).
- **One paid purchase per player per Argentine day** (same calendar as the salary). Checked when a purchase is created; a payment that does arrive is always credited.
- The simulated checkout says plainly that nothing is charged.

## 4. Database (migration `0020_coin_purchases.sql`)

- `coin_packs (id text PK, coronas int > 0, price_ars int > 0)`: public read, no client writes. Rows `chico`, `mediano`, `grande`.
- `coin_purchases (id uuid PK, user_id → profiles, pack_id → coin_packs, coronas, price_ars, status 'pending' | 'paid', provider text, provider_payment_id text, created_at, paid_at)`. Coronas and price are copied from the pack at creation. Unique `(provider, provider_payment_id)`. RLS: owners read their own rows; no client writes.
- `coin_ledger`: new reason `purchase` (credit), nullable `purchase_id` FK → `coin_purchases`, unique partial index on `purchase_id` so a purchase can be credited only once, even if the function had a bug.
- `create_coin_purchase(p_pack_id) RETURNS coin_purchases`, `SECURITY DEFINER`, for `authenticated`: requires `auth.uid()`, rejects an unknown pack and a second paid purchase today.
- `complete_coin_purchase(p_purchase_id, p_provider, p_provider_payment_id, p_amount_ars) RETURNS boolean`, `SECURITY DEFINER`, **executable only by `service_role`**:
  - Locks the purchase `FOR UPDATE`.
  - Already paid: returns false and credits nothing (idempotent).
  - `p_amount_ars` different from the stored price: raises.
  - Otherwise marks it paid, stores the provider ids and inserts the ledger credit. Returns true.
- SQL tests (`purchases_test.sql`): pack price comes from the table, daily limit, idempotent second completion, amount mismatch, `anon`/`authenticated` cannot execute `complete_coin_purchase` or write either table, ledger sign rule.

## 5. Server

- **Env** (`lib/env.ts`, server-only, optional so the rest of the app runs without them):
  - `SUPABASE_SERVICE_ROLE_KEY` for the new `lib/supabase/admin.ts` client. It is used only by the webhook path: a system operation, as `AGENTS.md` allows.
  - `PAYMENTS_WEBHOOK_SECRET` is the simulated provider's signing secret. A real provider brings its own (`STRIPE_WEBHOOK_SECRET`, Mercado Pago's secret key).
- **Provider seam** (`services/payments/`): a `PaymentProvider` type with two functions:
  - `createCheckout(purchase)` returns the URL to send the player to.
  - `parseWebhook(rawBody, headers)` verifies the signature and returns `{ purchaseId, paymentId, amountArs }`, or `null` for an event to ignore. It throws on an invalid signature.
  - One implementation today, `simulatedProvider`, selected in one line.
- **Simulated provider:**
  - `createCheckout` returns `/comprar/simulado/<purchaseId>`.
  - Its event is JSON `{ type: "payment.approved", purchase_id, payment_id, amount_ars }`, signed Stripe-style: header `x-simulado-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`.
  - Verification uses `node:crypto` with a constant-time compare and rejects timestamps more than 5 minutes off.
- **`handlePaymentWebhook(rawBody, headers)`**:
  - Invalid signature → 400.
  - Ignored event → 200.
  - Otherwise calls `complete_coin_purchase` with the admin client → 200, also when it was already paid, so providers stop retrying.
- **Route** `app/api/pagos/webhook/route.ts`: `POST` reads the raw body and delegates to `handlePaymentWebhook`. The proxy matcher already skips `/api`.
- **Server Actions:**
  - `startPurchase(packId)`: auth, Zod enum, `create_coin_purchase`, then redirect to `createCheckout`.
  - `paySimulated(purchaseId)`: auth, the purchase must be the player's own and pending. It builds and signs the event, then passes it through `handlePaymentWebhook`, the same code a real webhook hits. It calls the function directly instead of over HTTP, because Vercel previews are behind SSO. Then it revalidates the layout and redirects to `/comprar?compra=<id>`.

## 6. UI

- `/comprar` (signed-in, onboarded):
  - Balance, the three packs (each a form with a pending state against double submit), and a note: "Pago simulado: no se cobra nada".
  - Shows "Ya compraste hoy" when the daily purchase is used.
  - With `?compra=<id>` it shows a banner from that purchase's status: paid → "¡Listo! Sumaste N 👑", pending → "Esperando la confirmación del pago". This is where a real provider's return URL will land too.
- `/comprar/simulado/[id]`:
  - A checkout look-alike: pack, price, "PAGAR $X (SIMULADO)" and "Cancelar".
  - 404 unless the purchase is the viewer's own and pending.
  - No inputs.
- Wallet card on `/perfil` gets a "COMPRAR CORONAS" link; the movement label for `purchase` is "Compraste N 👑".
- `robots.ts` disallows `/comprar`.

## 7. Tests

- Vitest: signature sign/verify (valid, tampered body, wrong secret, stale timestamp), `handlePaymentWebhook` (400 on bad signature, completes once, 200 on repeat), `startPurchase` validation.
- SQL: as in §4.
- E2E: a guest buys the small pack through the simulated checkout and the header balance goes 20 → 30. CI gets the service role key from `supabase status` and a test webhook secret.

## 8. Rollout

1. PR green.
2. Push migration `0020` (additive) after Nico's OK.
3. Nico adds `SUPABASE_SERVICE_ROLE_KEY` on Vercel (Supabase → Settings → API keys). It's a secret, so it never goes through the chat.
4. Set `PAYMENTS_WEBHOOK_SECRET` on Vercel: a random value I generate and set with the CLI, after Nico's OK.
5. Merge.

## 9. Connecting a real provider later

- Write `stripeProvider` or `mercadoPagoProvider` implementing the same two functions:
  - Checkout Session / Preference creation with the purchase id as the reference.
  - Signature check with the provider's secret. Mercado Pago also needs a GET of the payment to read its status and amount.
- Switch the one-line selection and add the provider's keys.
- Point the provider's webhook at `/api/pagos/webhook`.
- Delete the simulated checkout page and `paySimulated`, or keep them for local dev.
