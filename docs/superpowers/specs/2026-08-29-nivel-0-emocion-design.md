# Nivel 0 — Capa de emoción y exposición (design spec)

*2026-08-29 — approved design. Scope: five small features on top of the existing MVP.*

## Goal

The takeover MVP is mechanically complete but emotionally flat: you pay, your name
sits on a page. Nivel 0 adds cheap, query-driven drama and a reason to share —
without new subsystems. Deliberately excludes the "challenge while holding" game
(Nivel 1) and the public head-to-head (Nivel 2).

Everything here is either a query over existing data or a single denormalised
column. One migration.

## Features

### A. Coronation message (one-shot trash talk)

When a user submits a dethrone claim they may attach one line (≤ 80 chars). It is
stored on the `claims` row, copied onto the `reigns` row when the admin confirms,
and shown publicly from then on. The holder cannot edit it later. The admin can
drop it at confirm time.

Shown in: title page (`/t/[slug]`, quote in "Estado del trono"), reign history,
public profile reign list, activity ticker.

### B. "Te destronaron" as an event

**Public feed:** the activity ticker names the loser. `Fran destronó a Nico —
Rey de Córdoba — $53.000` when the title was held; falls back to the current
`Fran se coronó Rey de Córdoba` when the title was previously unclaimed.

**Personal banner:** on `/perfil` (the user's own page), if the user lost a crown
in the last 14 days, a banner shows the title, who took it, their coronation
message, and a "Recuperala" button linking to `/t/[slug]`. No read/seen state —
the 14-day window is the whole mechanism.

Both are powered by one new column: `reigns.dethroned_user_id` (the holder who was
ended by this reign; `NULL` when the title was unclaimed).

### C. Longevity ranking, per title

On `/t/[slug]`: a "Reinados más largos" block — top 5 reigns for that title by
duration (`COALESCE(ended_at, now()) - started_at`), the active reign included and
flagged. No new query: `getTitleBySlug` already fetches every past reign plus the
active one. A pure helper ranks them.

Out of scope for Nivel 0: global ranking page, changes to the home Hall of Fame,
"más caro" / "más defendido" boards.

### D. Price history on the title page

On `/t/[slug]`: a "Historia de precio" panel — "valió hasta $X" (peak `price_paid`
across all reigns) plus a "🔻 mínimo histórico" tag when the current effective
price is ≤ 35 % of that peak, and a small sparkline of `price_paid` over the
title's reigns in chronological order. Sparkline is an inline SVG `<polyline>`,
no charting library. Data already in hand in `getTitleBySlug`.

### E. Share button + normalised social links

**`<ShareButton>`** — client component. `navigator.share()` with a
`navigator.clipboard.writeText()` + transient "copiado" fallback. Placed on
`/@[username]` and `/t/[slug]`. On `/perfil` a "Compartí tu corona" CTA links to
the user's public `/@username`.

**`socialUrl(key, value)`** — pure helper in `src/lib/socials.ts`. Turns
`juanita`, `@juanita`, or a full URL into a canonical profile URL per platform
(`website` passes through, prefixed with `https://` if it has no scheme).
Normalisation happens at render time only — stored values are not migrated.
Replaces the raw-`href` rendering in `ProfileHeader` (the existing `ponytail:`
comment there).

The profile OG image (`src/app/[username]/opengraph-image.tsx`) gains one line
listing the holder's socials.

## Data model changes — migration `0005_emotion_layer.sql`

```sql
-- 1. Columns
ALTER TABLE claims
  ADD COLUMN message text
    CONSTRAINT claims_message_len CHECK (message IS NULL OR char_length(message) <= 80);

ALTER TABLE reigns
  ADD COLUMN message text
    CONSTRAINT reigns_message_len CHECK (message IS NULL OR char_length(message) <= 80);

ALTER TABLE reigns
  ADD COLUMN dethroned_user_id uuid
    CONSTRAINT reigns_dethroned_user_id_fkey
      REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reigns_dethroned_user_id_idx
  ON reigns (dethroned_user_id) WHERE dethroned_user_id IS NOT NULL;
```

### `create_claim` — now 3-arg

`DROP FUNCTION public.create_claim(uuid, integer);` then recreate as
`create_claim(p_title_id uuid, p_amount integer, p_message text DEFAULT NULL)`.
Identical body to the `0004` version plus, before the INSERT:

```sql
p_message := nullif(btrim(p_message), '');
IF p_message IS NOT NULL AND char_length(p_message) > 80 THEN
  RAISE EXCEPTION 'Message too long';
END IF;
```

and `INSERT INTO public.claims (title_id, user_id, amount, message)
VALUES (p_title_id, v_user_id, p_amount, p_message)`.

### `apply_claim` — now 2-arg

`DROP FUNCTION public.apply_claim(uuid);` then recreate as
`apply_claim(p_claim_id uuid, p_clear_message boolean DEFAULT false)`. Identical
body to the `0004` version except the final INSERT:

```sql
INSERT INTO public.reigns (title_id, user_id, price_paid, message, dethroned_user_id)
VALUES (
  v_claim.title_id,
  v_claim.user_id,
  v_claim.amount,
  CASE WHEN p_clear_message THEN NULL ELSE v_claim.message END,
  v_active_reign.user_id   -- NULL when the title was unclaimed (v_active_reign not FOUND)
);
```

`v_active_reign.user_id` is already selected earlier in the function; it is `NULL`
when there was no active reign, which is exactly the wanted semantics.

### `titles_priced` view

`CREATE OR REPLACE VIEW` unchanged except add, at the end of the select list:

```sql
  r.message AS holder_message
```

### Grants

Re-run the `REVOKE ... FROM PUBLIC, anon` / `GRANT EXECUTE ... TO authenticated`
block for both recreated functions (the `DROP` removes the old grants).

### PostgREST embedding — breaking change to guard

`reigns` now has **two** FKs to `profiles` (`user_id`, `dethroned_user_id`). Every
existing embed of `profiles` on a `reigns` query becomes ambiguous and must switch
to an explicit FK hint:

| File | Query | Change |
|---|---|---|
| `services/titles.server.ts` | `coronationsQuery` | `profiles (...)` → `profiles!reigns_user_id_fkey (...)`; add `dethroned:profiles!reigns_dethroned_user_id_fkey ( username, display_name )` |
| `services/titles.server.ts` | `hallOfFameQuery` | `profiles (...)` → `profiles!reigns_user_id_fkey (...)` |
| `services/titles.server.ts` | `pastReignsQuery` | `profiles (...)` → `profiles!reigns_user_id_fkey (...)` |
| `services/profiles.server.ts` | `publicProfileQuery` | `reigns ( ... )` → `reigns!reigns_user_id_fkey ( ... )` |

`getPendingClaims` embeds `profiles` on `claims` (one FK) — unaffected.

### Types

Regenerate `src/types/database.types.ts` from the linked project after the
migration is applied (user's step). Hand edits are forbidden.

## Type shapes (`src/types/index.ts`)

```ts
// extend
type Coronation      = { …existing, dethronedName: string | null }
type PastReign       = { …existing, message: string | null }
type ProfileReign    = { …existing, message: string | null }
type TitleDetail     = { …existing,
                         holderMessage: string | null,
                         longestReigns: RankedReign[],
                         priceHistory: number[],   // price_paid, chronological
                         pricePeak: number }
type PendingClaimListItem = { …existing, message: string | null }

// new
type RankedReign = {
  id: string
  holderName: string
  durationLabel: string   // via formatReignDuration
  pricePaid: number
  isActive: boolean
}
type DethroneNotice = {
  titleName: string
  titleEmoji: string
  titleSlug: string
  byName: string          // who took the crown
  message: string | null  // their coronation message
  at: string              // reign.started_at of the taker
}
```

## Helpers

- `src/lib/socials.ts` → `socialUrl(key: SocialKey, value: string): string` (pure).
- `src/lib/titles.ts` → `rankReignsByDuration(reigns: ReignForRanking[], limit = 5): RankedReign[]`
  (pure). `ReignForRanking = { id; holderName; pricePaid; startedAt; endedAt: string | null }`.
  `getTitleBySlug` builds one array from its past reigns plus a synthesised entry
  for the active reign (`endedAt: null`); the helper sorts by
  `(endedAt ?? now) - startedAt` desc, sets `isActive = endedAt === null`, slices.

## Services

- `services/claims.server.ts`
  - `createClaim(supabase, titleId, amount, message?: string)` → passes
    `p_message: message ?? null`.
  - `applyClaim(supabase, claimId, clearMessage = false)` → passes
    `p_clear_message`.
  - `getPendingClaims` → select `message`, map into `PendingClaimListItem.message`.
- `services/titles.server.ts`
  - `getRecentCoronations` → read the `dethroned` embed, set `dethronedName`
    (via the existing `displayName` fallback, `null` when no dethroned user).
  - `getTitleBySlug` → map `holder_message` from the view; build `longestReigns`
    (`rankReignsByDuration` over past reigns + active), `priceHistory`,
    `pricePeak`. `ReignHistory` past-reign mapping gains `message`.
- `services/profiles.server.ts`
  - `publicProfileQuery` → select `message` in the embedded reigns; `toProfileReign`
    maps it.
  - new `getLatestDethrone(supabase, userId): Promise<DethroneNotice | null>` —
    `reigns` where `dethroned_user_id = userId` and `started_at > now() -
    interval '14 days'`, order by `started_at` desc, limit 1, embed
    `profiles!reigns_user_id_fkey ( username, display_name )` and
    `titles ( name, emoji, slug )`.

## Server action & schema

- `features/dethrone/schemas/dethrone.schema.ts` → add
  `message: z.string().trim().max(80).optional()` (empty string coerces to
  `undefined`).
- `actions/claims.ts`
  - `destronar` → read `message` from `formData`, pass to `createClaim`.
  - `resolverClaim` → read an optional `clearMessage` checkbox
    (`formData.get("clearMessage") === "on"`), pass to `applyClaim` on the
    `apply` branch. Add a `translateRpcError` case for `Message too long`.

## Components

| Component | Change |
|---|---|
| `features/dethrone/components/dethrone-form.tsx` | optional `<textarea name="message" maxLength={80}>` with a Spanish label |
| `features/admin/components/pending-claims-table.tsx` | show `claim.message` when present; add a `clearMessage` checkbox next to CONFIRMAR |
| `components/coronation-ticker.tsx` | dethrone phrasing when `dethronedName` is set |
| `components/reign-history.tsx` | render `r.message` as a quote under each row when present |
| `features/profile/components/profile-reign-list.tsx` | render reign `message` when present |
| `features/profile/components/profile-header.tsx` | use `socialUrl`; render `<ShareButton>` |
| `components/price-sparkline.tsx` | **new** — `{ prices: number[] }`, inline SVG polyline, ~25 lines, no lib |
| `components/longest-reigns.tsx` | **new** — `{ reigns: RankedReign[] }`, list, active row flagged |
| `components/share-button.tsx` | **new** — client, `navigator.share` + clipboard fallback |

## Pages

- `app/t/[slug]/page.tsx` — render holder message in "Estado del trono";
  add "Historia de precio" panel (peak text + `<PriceSparkline>` + mínimo-histórico
  tag); add `<LongestReigns>`; add `<ShareButton>`.
- `app/perfil/page.tsx` — call `getLatestDethrone`; render the banner when non-null.
- `app/[username]/opengraph-image.tsx` — one socials line.

## Seed (`supabase/seed.sql`)

- Set `dethroned_user_id` on the `rey-de-cordoba` chain: `b2` → `a4`, `b3` → `a2`.
- Add `message` to `b3`, `b6`, `b7` (short, in character).
- Keep all inserts idempotent.

## Out of scope

Notifications table · email · global ranking page · Hall of Fame changes ·
charting library · holder-editable message · storing normalised social URLs ·
"más caro" / "más defendido" boards.

## Tests (one runnable check per non-trivial unit)

- `src/lib/__tests__/socials.test.ts` — handle / `@handle` / full URL / `website`
  without scheme, per platform.
- `dethrone.schema` test — `message` at 80 passes, 81 fails, `""` → `undefined`.
- `src/lib/__tests__/titles.test.ts` (or co-located) — `rankReignsByDuration`
  ordering, active reign uses `now()`, `limit`.
- `claims.server` test — `createClaim` sends `p_message`; `applyClaim` sends
  `p_clear_message`.
- RPC-internal behaviour (`dethroned_user_id`, message passthrough, clear flag) is
  verified manually against a local DB — `ponytail:` comment in the migration
  noting the no-DB-test ceiling.

## Manual verification checklist

1. Claim with a message → appears on `/admin`; confirm with the checkbox unticked
   → message shows on `/t/[slug]`, ticker, both profiles.
2. Confirm another claim with the checkbox ticked → reign has no message.
3. Ticker reads "X destronó a Y" for a held title, "X se coronó" for a first claim.
4. Dethroned user's `/perfil` shows the banner with the taker's message; it is gone
   after 14 days.
5. `/t/[slug]` shows top-5 longest reigns (active flagged) and the price sparkline
   with the mínimo-histórico tag when applicable.
6. Share button: native sheet on mobile, clipboard + "copiado" on desktop.
7. Social links resolve to real profile URLs from bare handles.
