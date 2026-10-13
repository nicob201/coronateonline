# In-app Notifications — Design

*2026-10-13 — design approved in conversation, pending written-spec review. Roadmap day D9. Branch: `feat/notifications`.*

## 1. Context & motivation

Since D7 bots take crowns every ~2 h and since D8 the market is live, but losing a
crown is silent: the only trace is the `/perfil` banner (last dethrone, 14 days) and a
"dethroned" line in the wallet. D9 makes the loss felt: a toast the moment it happens,
and a bell in the header with an unread count and the list of recent dethrones, even for
users who were offline.

## 2. Goals / non-goals

**Goals**
- A user who is dethroned (by a human or a bot) with the site open sees a toast
  "¡Te destronaron!" within ~1–2 s, no reload.
- The header shows a bell with an unread indicator and, on open, the 10 most recent
  dethrones of the last 14 days (who, which title, how many 👑 they paid you, their
  message), each linking to `/t/<slug>`.
- Opening the bell marks everything read.
- The balance chip and any open `/t/[slug]` refresh when you are paid on another title
  (the D8 gap).
- Nothing is duplicated: the notification IS the `reigns` row (`dethroned_user_id = me`).

**Non-goals**
- Other notification kinds (salary ready, etc.), per-user preferences, mark-one-as-read.
- Email / push (out of scope in `DESIGN.md`).
- Bot marker on the notification (existing D7 cleanup, not widened here).
- Live sync of "read" across the user's other open tabs (they update on their next refresh).
- A notifications table + trigger (rejected, see §3).

## 3. Approach

**Derived, no `notifications` table.** The roadmap sketched a trigger on `reigns`
filling a table. Every fact such a table would hold already lives in `reigns`:
`dethroned_user_id` is the victim, `user_id` the new holder, `price_paid` what the victim
was paid (zero-sum), `message` the taunt. Copying it breaks the "derived, never
duplicated" rule and adds a trigger, a table, RLS and a publication. The only new state is
"what has this user already seen".

Trade-off accepted: if the dethroner later deletes their account, the `reigns` row
cascades away and the notification disappears. A table would survive that; one lost
notice about a deleted account is not worth the machinery. A second notification kind
would be the reason to revisit.

**Live delivery.** A Realtime `postgres_changes` INSERT subscription on `reigns` filtered
by `dethroned_user_id=eq.<userId>` (same mechanism as D8's `LiveRefresh`) calls
`router.refresh()`. The event payload is a raw `reigns` row (no names), so the toast is
not built from it: the refresh re-renders the header's Server Component, which now
carries the new item, and the client shows the toast when it sees a new top item.
No browser-side queries, no duplicated mapping. Rejected: querying names from the
browser on the event (duplicates server mapping), and a generic payload-only toast
(says nothing useful).

**"Seen" state in its own table, not a `profiles` column.** `profiles` is publicly
readable (`GRANT SELECT` table-wide), so a `notifications_seen_at` column would expose
when each person last opened their bell. A one-row-per-user owner-only table avoids that;
AGENTS.md says to follow the most restrictive rule.

## 4. Database (migration `0011_notification_seen.sql`)

```sql
CREATE TABLE public.notification_seen (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL
);
ALTER TABLE public.notification_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notification state is viewable by its owner"
  ON public.notification_seen FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE ALL ON public.notification_seen FROM anon, authenticated;
GRANT SELECT ON public.notification_seen TO authenticated;

-- Existing users start fully read; no flood of "unread" at launch.
INSERT INTO public.notification_seen (user_id, seen_at)
SELECT id, now() FROM public.profiles;
```

`mark_notifications_seen()` — `SECURITY DEFINER`, `SET search_path = ''`, returns void.
Raises `Not authenticated` when `auth.uid()` is null, otherwise upserts
`(auth.uid(), now())` (`ON CONFLICT (user_id) DO UPDATE SET seen_at = now()`).
`REVOKE EXECUTE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`. Server time, so a
client clock cannot hide a notification.

No row (a user created after this migration who never opened the bell) = nothing seen =
everything in the 14-day window is unread, which is correct: they can only have been
dethroned after signing up.

No Realtime change: `reigns` has been in `supabase_realtime` since 0010, `reigns` is
publicly readable, and filtering on `dethroned_user_id` needs no replica-identity change
for INSERT events. The migration only adds objects the old code does not use, so it can be
pushed before the merge.

## 5. Service and action

**`src/services/notifications.server.ts`** — `getNotifications(supabase, userId)`:
- In parallel: the 10 latest `reigns` with `dethroned_user_id = userId` and
  `started_at` in the last 14 days (joining holder profile and title, the query behind
  today's `getLatestDethrone`), and the user's `notification_seen.seen_at` (`maybeSingle`).
- Returns `{ items: DethroneNotice[]; unread: number }`; `unread` = items newer than
  `seen_at` (all of them when there is no row). It is capped by the 10-item window; the
  UI shows "9+" when it equals 10.
- `getLatestDethrone` in `profiles.server.ts` is deleted (same query, would be
  duplicate logic); `/perfil` reads `items[0] ?? null` for its banner.

**Types (`src/types/index.ts`):** `DethroneNotice` gains `id` and `pricePaid`; new
`Notifications = { items: DethroneNotice[]; unread: number }`. `database.types.ts` is
regenerated, never hand-edited.

**`src/actions/notifications.ts`** — `marcarNotificacionesLeidas(): Promise<ActionResult<null>>`:
auth → `supabase.rpc("mark_notifications_seen")` → `revalidatePath("/", "layout")`. No
input, so no Zod. Errors map to a Spanish message like `cobrarSueldo`.

## 6. UI

**`NotificationBell`** (`"use client"`, `src/components/notification-bell.tsx`, next to the
other header pieces; `SiteHeader` already lives there and imports actions/services) — prop
`initialData: Notifications`.
- Header: rendered by `SiteHeader` for signed-in users only, next to the balance chip.
  Server-fetched with the other header reads; a failed read hides the bell
  (`.catch(() => null)`), like the balance chip, instead of breaking every page.
- Button with the `notifications` Material Symbol; unread > 0 shows a dot/count
  (`aria-label` carries the count, "9+" at the cap).
- Panel: native Popover API (`popover` + `popovertarget`, light-dismiss for free), no
  library. Items: `{byName} te destronó en {emoji} {title} · te pagó {N} 👑`, optional
  «message», relative date via `formatDate`; link to `/t/<slug>`. Empty state: "Nadie te
  destronó todavía."
- Opening (`onToggle`, open + unread > 0): runs `marcarNotificacionesLeidas` in a
  transition; the layout revalidation brings back `unread = 0`. Failure: silently stays
  unread (it will retry on next open); no error UI.
- Realtime: no second copy of the channel code. `LiveRefresh` (D8) is generalized from a
  `titleId` prop to a `filter` string (`title_id=eq.<id>` on `/t/[slug]`, none elsewhere),
  and `SiteHeader` mounts one `<LiveRefresh filter="dethroned_user_id=eq.<viewer>" />` for
  signed-in users. Unique topics, reconnect catch-up and cleanup come for free.
- Toast: "adjust state while rendering" — keep the previous `items[0]?.id` in state; when
  it changes to a different non-null id and `unread > 0`, set the toast to that item
  (first render only records the baseline, so no toast on load). A single toast at a time
  (a new one replaces the old one), `role="status"`, ~6 s auto-dismiss via an effect +
  timer, dismiss button, link to `/t/<slug>`. Rendered through a portal to `document.body`:
  the header's `backdrop-blur` would otherwise become the containing block of its
  `position: fixed` descendants. Fixed bottom-right (bottom-centre below
  `md`), respects `prefers-reduced-motion` (no slide-in), copy: "¡Te destronaron!" +
  "{byName} te sacó {emoji} {title} y te pagó {N} 👑".

**CSS (`globals.css`):** a short slide-in/fade keyframe for the toast, disabled in the
existing reduced-motion block.

**360 px header:** the header is already tight (logo, explore icon, balance chip, logout).
The bell adds ~40 px. Verify at 360 px; if it overflows, drop the redundant "Explorar"
icon below `md` (the footer / home already link to `/titulos`) rather than shrinking tap
targets.

**Free with the refresh:** header balance chip, the open `/t/[slug]` (holder, price,
history) and `DethroneForm`'s new minimum, same as D8.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| You dethrone someone | No event for you: `dethroned_user_id` is the victim. |
| Bot dethrones you | Same `reigns` insert via `dethrone_with_coins` → same path. |
| StrictMode double effect | Unique topic per run (module counter), as `LiveRefresh`. |
| Burst of dethrones | One refresh per event; toast shows the latest item only. |
| Bell opened in tab A, tab B open | B keeps its stale unread until its next refresh. |
| Socket drop / sleeping tab | A later `SUBSCRIBED` triggers one refresh; if a dethrone was missed, the new top item is unread, so the toast fires then (late, but right). |
| Realtime down | Bell still works as a snapshot per navigation; no error UI. |
| Dethroned user deletes account | `dethroned_user_id` becomes NULL; nothing to notify. |

## 8. Testing

- **Vitest** `src/services/__tests__/notifications.server.test.ts` (chainable Supabase
  mock): unread counts items newer than `seen_at`; all unread when there is no row; none
  when `seen_at` is newer; `items` mapped (name fallback to username, "Anónimo"); query
  errors throw. (`getLatestDethrone` has no test today.)
- **SQL** `supabase/tests/notifications_test.sql`, added to `test:sql`: anon cannot call
  `mark_notifications_seen`; unauthenticated authenticated-role call raises `Not
  authenticated`; a call upserts exactly the caller's row and moves `seen_at` forward;
  user A cannot see B's `notification_seen` row; no direct INSERT/UPDATE/DELETE from
  authenticated.
- **Local smoke** (local stack + `npm run dev`, headless Chrome over CDP as in D8): two
  guests; A dethrones B via `psql` (`dethrone_with_coins` impersonating A through
  `request.jwt.claims`); assert B's page shows the toast and the bell's unread without
  reload, the open `/t/<slug>` and balance update, opening the bell clears unread;
  screenshots at desktop and 360 px.
- `npm run verify` green. Automated browser coverage stays in D21 (Playwright).

## 9. Rollout

Two phases, pausing for Nico's go-ahead after each:
1. Migration `0011`, `getNotifications` (+ `/perfil` switch), action, `NotificationBell`
   with list, unread and mark-read; 360 px check; Vitest + SQL tests.
2. Realtime subscription, toast, CSS; docs (ROADMAP D9 checked, `DESIGN.md` out-of-scope
   line on notifications updated).

Then PR → CI green → `supabase db push --db-url` → Nico merges on GitHub.
