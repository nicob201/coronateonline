# CoronaTeOnline — Design Spec (v2)

*2026-08-23 — validation MVP. v2 2026-10-07 — Coronas (virtual currency) replace ARS; see `docs/ROADMAP.md`.*

## 1. Product

A status-market platform: users spend **Coronas (👑)**, a virtual currency, to hold unique, absurd/prestigious digital titles — "👑 Rey de Córdoba", "😂 CEO de los Lunes", "🍕 Rey de la Pizza". The holder gets the crown displayed on a shareable public profile. Anyone can dethrone them by paying more.

**Portfolio demo:** a visitor plays in 30 seconds without paying. Every account starts with 20 👑 (guests included); buying Coronas with a sandbox checkout comes later (roadmap D28).

## 2. Core Mechanic — Direct Takeover (NOT an auction)

There are no timers, no auction rounds, no bidding wars with countdowns.

- Every title has a current holder and a current price (what the holder paid).
- An unclaimed title can be claimed for the base price: **1 👑**.
- To dethrone the current holder you must pay at least **current price + 1 👑**.
- All amounts are positive integer Coronas (1 👑 = the $1.000 ARS unit of v1).
- Reigns do NOT expire. You hold the crown until someone pays more.

### Price decay (v1.1)

A held title's **current price is not static**. It is `price_paid` of the active
reign decayed toward a per-title floor: after a 3-day grace period the price
loses ~0.7%/day (compounding). The floor is
`max(1 👑, 25% of the title's recent price peak, 2 👑 × dethrones in the
last 30 days)`. So an undefended crown slowly gets cheaper (~6 months at the
default rate to reach its floor), a hot title keeps a high floor, and a title
that cooled off becomes affordable again. That high floor only holds while the
active reign's `price_paid` is still inside the peak window (`peak_window_days`,
default 90 days); once it ages out the peak term collapses and a long-undefended
crown decays toward the 1 👑 base. The dethrone threshold is `current effective price + 1 👑`.
All decay parameters live in a single-row `pricing_config` table, tunable with an
`UPDATE`. The effective price is computed on read (no cron, no stored column) by
the `title_current_price` Postgres function and exposed through the
`titles_priced` view.

A crown held by a **bot** instead halves every `bot_half_life_hours` (default 6) with
no grace and no floor, so a newcomer can always take it; bot reigns never count
toward the activity floor.

### Dethrone flow (v2 — Coronas, atomic)

1. A logged-in user (guests included) on a title page offers **X 👑** (X ≥ current price + 1, or ≥ 1 if unclaimed; they may offer more to raise the next threshold). The page shows their balance; the button reads "TE FALTAN N 👑" when short.
2. The server action validates with Zod and calls `dethrone_with_coins`, which in one transaction locks the title (then the challenger's profile), re-checks the live price and the balance, ends the active reign, starts the new one and writes the ledger.
3. **Zero-sum:** the dethroned holder is credited exactly X 👑. Claiming an unclaimed title only debits — those Coronas are burned (the economy's only sink).
4. The coronation message (≤ 80 chars) is stored on the reign and shown publicly at once; until moderation exists it is cleared with SQL if needed.

Concurrency: two challengers on one title serialize on the title lock; the second re-reads the new price and is rejected with "El monto no alcanza". Spends by one user serialize on their profile row, locked `FOR NO KEY UPDATE` — never `FOR UPDATE`, which deadlocks against the `KEY SHARE` the foreign keys take when two users dethrone each other at once.

### Daily salary with streak (v2.1)

1. Once per Argentine calendar day (it turns over at 00:00 ART) a logged-in user presses "Cobrar sueldo" in their wallet; `claim_salary()` writes a `salary` ledger row.
2. **Amount:** 5 👑 on streak day 1, +1 per consecutive day, capped at 11 👑 from day 7. Skipping a day resets the next claim to 5 👑.
3. **The streak is derived**, like the balance: `salary_status()` counts the consecutive days with a `salary` row ending today or yesterday, and returns `claimed_today`, `streak` and `next_amount`.
4. One claim per day is enforced by a unique index on `(user_id, ar_date(created_at))` for `salary` rows, so double clicks and concurrent requests cannot pay twice. The header's balance chip shows a dot while today's salary is unclaimed.

### Bots (v2.2)

1. Five declared bots (`profiles.is_bot`, shown with a 🤖 BOT badge; their trash talk lives in the private `bot_lines` table). They have no password, so nobody can sign in as one.
2. **Same rules as humans:** ledger balance, 20 👑 welcome, daily salary. `bot_move()` acts as the bot for one transaction (`request.jwt.claims`) and calls `dethrone_with_coins`, so validation, locks and the zero-sum ledger are the human ones.
3. **Schedule:** pg_cron runs `bot_tick()` every 20 minutes: every bot claims its salary, then with a 1-in-6 chance (~one move every 2 h) a random bot takes a random affordable title.
4. **Limits:** bots bid exactly the minimum (price + 1, or 1 unclaimed) and never more than 15 👑; a human crown is closed to bots for its first 12 hours. Bots are left out of the Hall of Fame.

## 3. Domain Model

Four domain tables plus the single-row `pricing_config`. One source of truth: current holder and current price are always derived from `reigns`; a user's balance is always derived from `coin_ledger`.

### `profiles` (1:1 with `auth.users`)
- `id` (uuid, PK, FK → auth.users), `username` (unique slug, for `/@username`), `display_name`, `avatar_url`, `bio`
- Social links: `instagram`, `tiktok`, `youtube`, `x`, `twitch`, `website` (nullable text)
- `is_admin` (boolean, default false)
- Created automatically by a trigger on signup.

### `titles` (admin-seeded only in MVP)
- `id`, `slug` (unique), `name`, `emoji`, `description`, `created_at`
- No holder/price columns — derived from `reigns`.
- Geographic titles (v2.3): nullable `level` (`provincia` / `ciudad` / `barrio`), `province_code` (FK to `provinces`) and `location` (PostGIS `geography(Point, 4326)`). Either all three are set or none (CHECK), and a province has exactly one `provincia` crown (partial unique index). 24 province crowns ship in migration `0012`; `rey-de-argentina` and `reina-de-las-malvinas` stay non-geographic.

### `provinces` (reference data, public read-only)
- `code` (2-digit INDEC code, PK), `slug` (unique), `name`. 24 rows. `province_leaderboard(p_limit)` ranks every reign (active and ended) of every title in a province by duration.

### `reigns` (the history — feed and rankings are queries over this table)
- `id`, `title_id` (FK), `user_id` (FK → profiles), `price_paid` (integer 👑), `started_at`, `ended_at` (nullable)
- **Active reign = `ended_at IS NULL`.** Partial unique index: at most one active reign per title.
- The **current price is derived, then time-decayed**: `title_current_price(title_id)`
  applies `pricing_config` decay to the active reign's `price_paid` / `started_at`,
  floored by `title_price_floor(title_id)`. `reigns.price_paid` always records the
  real amount paid; decay only affects the live threshold, never stored history.
- Activity feed = recent reigns ordered by `started_at`. Season number = position in the title's reign sequence.

### `coin_ledger` (the wallet — append-only)
- `id`, `user_id` (FK → profiles), `amount` (signed integer 👑: credit > 0, debit < 0), `reason` (`welcome`, `dethrone` (always negative), `dethroned`, `salary`), `reign_id` (FK → reigns, nullable, `ON DELETE SET NULL`), `created_at`
- **Balance is derived**: `coin_balance(user_id)` = sum of the user's rows. Never stored.
- 20 👑 `welcome` row per profile, inserted by a trigger on `profiles`; a unique partial index allows only one.
- One `salary` row per user per Argentine day (unique partial index); see "Daily salary with streak".
- RLS: owners read their own rows; no client writes — only `SECURITY DEFINER` code writes the ledger.

### Database rules
- RLS enabled on every table. Public read for `profiles`, `titles`, `reigns`. No client-side writes to `titles`/`reigns` — transfers happen exclusively inside a `SECURITY DEFINER` function.
- Money integrity enforced by CHECK constraints (positive amounts; non-zero ledger movements).
- Keep-alive: pg_cron jobs do not count as activity for Supabase's free-tier pause, so a daily GitHub Actions request to `/titulos` keeps the project awake.

## 4. Pages (MVP)

| Route | Content |
|---|---|
| `/` | Landing: hero, featured titles with current holder + price, activity feed (latest coronations) |
| `/titulos` | Grid of all titles with crown, holder, current price |
| `/t/[slug]` | Title detail: current holder, price, dethrone button, reign history ("Temporada #N") |
| `/@[username]` | Public shareable profile: avatar, current title(s), bio, social links, reign history |
| `/login` | Supabase Auth: email magic link + Google OAuth; username onboarding on first login |
| `/mapa` | Mapa del Reino: MapLibre globe with IGN country + province borders in neon (static GeoJSON in `public/geo/`, rebuilt by `scripts/build-argentina-geojson.sh`; no tile provider); hover shows a province's top 3 longest reigns (pointer devices only), click/tap opens a panel (bottom sheet on mobile) with the province crown and the top 10; selection lives in `?provincia=<slug>`. Held province crowns get a gold pin at their location (`titles_priced.lon/lat`). Held provinces glow by crown rarity (tier 1–3: border width/opacity, fill and pin size). Live: any new reign refreshes the page (`LiveRefresh`); pins and glow resync, and a crown drops and beats on the pin of each province whose reign just started (D15) |

UI copy in Spanish (es-AR). Visual direction: dark, cyberpunk + digital luxury (electric violet, magenta, gold, neon, glassmorphism) — Stitch designs exist and drive the styling pass.

## 5. Out of Scope (MVP)

Deliberately excluded until the hypothesis validates:
- Realtime beyond the live ticker/prices, the dethrone toast and the map pulses (shipped in D8/D9/D15)
- Email / push notifications ("te destronaron") — dethroned users see it in-app (bell + live toast, D9)
- User-created titles, rankings pages, profile boosts, sponsored titles
- Reign expiry (does not exist in the takeover model)

## 6. Stack

Next.js 16 (App Router) + TypeScript + Tailwind v4 + Supabase (Postgres/Auth) + Zod, deployed on Vercel free tier. Architecture, layers, and code rules: see `AGENTS.md`.

## 7. Build Roadmap

Each step is one feature branch, implemented via one prompt, reviewed by diff:

1. **Supabase foundation** — env validation, Supabase clients, auth middleware, migration 0001 (schema + RLS + functions + trigger), seed titles, generated DB types
2. **Auth** — login (magic link + Google), auth callback, username onboarding
3. **Titles** — landing, titles grid, title detail with history
4. **Dethrone flow** — claim creation + payment instructions screen
5. **Public profiles** — `/@username`
6. **Admin** — claim confirmation
7. **Design pass** — apply Stitch designs, OG/share cards
