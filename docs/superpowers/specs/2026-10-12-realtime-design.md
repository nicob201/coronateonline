# Realtime Ticker and Live Price — Design

*2026-10-12 — approved design. Roadmap day D8. Branch: `feat/realtime`.*

## 1. Context & motivation

Since D7 five bots move every ~2 h and humans dethrone each other with Coronas,
but every page is a snapshot: the ticker, the prices and the holders only change
on reload. D8 makes the market feel alive — open the home in two tabs, dethrone in
one, and the other shows the new ticker entry and price within a second or two,
with a subtle flash on what changed.

## 2. Goals / non-goals

**Goals**
- Home (ticker + trending), `/titulos` (grid) and `/t/[slug]` (holder, value,
  minimum bid, history) update by themselves when a reign starts.
- Data still comes from the existing Server Components and services: the price
  (decay, floor, bot half-life) stays computed only in Postgres; no TS copy.
- What changed flashes briefly; nothing flashes on first load.
- A dropped socket (wifi, sleeping tab) catches up when it reconnects.
- The server stays authoritative: a stale price on screen never lets anyone pay
  less (`dethrone_with_coins` re-validates, as today).

**Non-goals (later days)**
- Prices "ticking down" on screen between events (decay is only re-read on a
  refresh or navigation).
- Toasts / notifications, "¡Te destronaron!" — D9.
- Realtime on the map — D15.
- Broadcast from a DB trigger with an enriched payload — only if volume ever
  makes per-subscriber RLS checks a problem.
- Automated browser test — D21 (Playwright: guest → dethrone → ticker).

## 3. Approach

`postgres_changes` on `reigns` INSERT → `router.refresh()`. Every dethrone (human
or bot) inserts exactly one `reigns` row, so INSERT is the one event that means
"something changed". On the event the client asks Next to re-render the route's
Server Components; Next 16 merges the new RSC payload keeping client state and
scroll position. One RSC round-trip per event per open tab is negligible at demo
volume (~12 bot moves a day plus humans).

Rejected: patching client state from the event payload (the payload is a raw
`reigns` row — no names, no decayed price — so it would need browser queries and
duplicated mapping, against the "fetch in Server Components" rule); Broadcast via
`realtime.send` from a trigger (more SQL and private channels, and prices would
still need a refresh).

## 4. Database (migration `0010_realtime_reigns.sql`)

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.reigns;
```

Nothing new is exposed: `reigns` is already publicly readable (policy "Reigns are
viewable by everyone", SELECT granted to anon/authenticated) and Realtime applies
the same RLS to each subscriber. Old app code is unaffected, so the migration can
be pushed before the merge.

## 5. Components

**`src/components/live-refresh.tsx`** (`"use client"`, renders `null`)
- Props: `titleId?: string`.
- In a `useEffect`: creates the browser client (`@/lib/supabase/client`), opens a
  channel and listens to `postgres_changes` `{ event: "INSERT", schema: "public",
  table: "reigns" }`, adding `filter: "title_id=eq.<titleId>"` when `titleId` is
  given. On each event: `router.refresh()`.
- Subscribe callback: the first `SUBSCRIBED` does nothing; any later `SUBSCRIBED`
  (a reconnect) calls `router.refresh()` once to pick up events missed while
  disconnected.
- Cleanup: `supabase.removeChannel(channel)`.
- It is a subscription effect, not a fetch-on-render, so it fits the AGENTS.md
  data-fetching rule.

**`src/components/live-flash.tsx`** (`"use client"`)
- `<LiveFlash value={string | number | null}>{children}</LiveFlash>`.
- Keeps the previous `value` in state, updated during render (React's "adjust
  state when a prop changes" pattern, no effect). When `value` differs from the
  previous one it bumps a counter used as the `key` of a wrapping `<span>`, which
  remounts it with class `live-flash` and restarts the animation. Counter 0 (first
  render) → no class, no flash.
- Optional `className` passthrough for layout (e.g. a block wrapper).

**CSS (`src/app/globals.css`)**
- `.live-flash`: ~1.2 s keyframe, tertiary (gold) glow / tinted background that
  fades out to transparent.
- Added to the existing `prefers-reduced-motion` block (`animation: none`).

## 6. Where it is mounted

| Page | `LiveRefresh` | `LiveFlash` around |
|---|---|---|
| `/` (`app/page.tsx`) | all titles | ticker bar (`value` = newest coronation id); `TrendingTitle` "Rey · Valor" row (`value` = holder + price) |
| `/titulos` | all titles | `TitleCard` "Rey · Valor" row (`value` = holder + price) |
| `/t/[slug]` | `titleId={title.id}` | DUEÑO ACTUAL, VALOR ACTUAL, PRECIO MÍNIMO |

Not in the root layout: `/perfil`, the wallet and public profiles don't refresh on
other people's moves.

A refresh re-reads every title, so a title whose price decayed since the last load
also flashes — read as "live market", accepted.

**Free with the refresh, no extra code**
- Header balance chip on those pages (e.g. you were just dethroned and got paid).
- `DethroneForm`: `min` and `defaultValue` take the new minimum (an untouched input
  shows it; a typed lower offer is blocked by native validation and, regardless,
  rejected by the RPC). Its `useActionState` result survives the refresh.

## 7. Error handling

- Realtime unavailable / channel error: the page keeps working as a static
  snapshot (today's behaviour); no error UI. supabase-js retries the socket on its
  own; the reconnect refresh covers the gap.
- Own dethrone: the action's `revalidatePath` and the INSERT event both refresh —
  a harmless double refresh.

## 8. Testing

- No new Vitest: the repo has no DOM test environment and the logic is a few
  lines; the automated browser test is D21.
- Local check: local Supabase stack + `npm run dev`; headless Chrome (CDP) on `/`,
  `/titulos` and `/t/<slug>`; trigger a dethrone with `psql`
  (`dethrone_with_coins` impersonating a user via `request.jwt.claims`); assert
  the DOM shows the new holder/price without reload and a `.live-flash` element
  appears; screenshots.
- `npm run verify` green.
- Prod: two tabs + a dethrone by Nico, or wait for a bot move.

## 9. Rollout

Two phases, pausing for Nico's go-ahead after each:
1. Migration + `LiveRefresh` mounted on the three pages; verified locally.
2. `LiveFlash` + CSS; docs (ROADMAP D8 checked, `DESIGN.md` out-of-scope line on
   Realtime updated).

Then PR → CI green → `supabase db push --db-url` → Nico merges on GitHub.
