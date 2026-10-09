# Bots — Design

*2026-10-09 — approved design. Roadmap day D7. Branch: `feat/bots`.*

## 1. Context & motivation

The demo only moves when a human plays. A visitor arriving from the portfolio
should see a living market: recent coronations in the ticker, crowns changing
hands, a reason to come back ("a bot stole my crown"). D7 adds five declared
bots that play the market on a schedule with exactly the rules humans have.

Research finding: Supabase's pausing guide counts *user* activity (dashboard
visits, API requests) and does not list internal scheduled jobs; community
reports show projects paused despite `pg_cron` jobs. So the bots do **not** keep
the free project awake — a separate daily external request does.

## 2. Goals / non-goals

**Goals**
- Five bots, visibly labelled 🤖 BOT, each with a name, a bio and ~6 trash-talk lines.
- Bots play by the human rules: real ledger balance (20 👑 welcome + the daily
  salary), dethrones through `dethrone_with_coins`, zero-sum.
- A newcomer can always afford to take a crown from a bot.
- About one bot move every 2 hours, at irregular times.
- Human crowns are safe from bots for their first 12 hours.
- A daily external request keeps the Supabase project from pausing.

**Non-goals (later days)**
- Realtime ticker/price updates — D8. "¡Te destronaron!" notifications — D9.
- Bot strategy beyond random choice among affordable targets.
- Editing bot lines from a UI (they change with SQL or a migration).

## 3. Economy rules ("weak kings")

The current pricing ratchets: every dethrone raises the price by ≥ 1 👑, decay is
0.7 %/day after a 3-day grace, and the floor adds 2 👑 per dethrone in the last
30 days. Frequent bot moves would price out bots and newcomers within days. So:

- **Bot-held crown price** = `max(1, round(price_paid × 0.5 ^ (hours_held / bot_half_life_hours)))`
  — no grace, no title floor. `pricing_config.bot_half_life_hours` (default 6,
  CHECK > 0) is tunable with an `UPDATE`. Example: paid 15 → 8 at 6 h, 4 at 12 h,
  2 at 18 h, 1 at 24 h.
- **Human-held crown price:** unchanged, except the floor's activity term counts
  only ended reigns **held by humans** (`2 👑 × human reigns ended in 30 days`).
  Bot-vs-bot play never makes a title more expensive. The peak term is
  unchanged (bots never pay more than 15, so they add at most 4 👑 to it).
- **Bot bids** are always the minimum (`current price + 1`, or `1` when unclaimed)
  and never above **15 👑**. Consequences: every bot crown costs ≤ 16 👑 to take,
  so a 20 👑 guest can always take one; a human crown priced 15 👑 or more is out
  of the bots' reach.
- Production today has 0 dethrones in the last 30 days and no bots, so the
  migration moves no existing price.

## 4. Database (migration `0009_bots.sql`)

### 4.1 Bot identity

- `profiles.is_bot boolean NOT NULL DEFAULT false` — the single source of truth
  for "is a bot". Clients cannot set it: `profiles` UPDATE is granted per column
  (0001) and `is_bot` is not granted.
- Five `auth.users` rows with fixed UUIDs, no password and an unroutable email
  (`<username>@bots.coronateonline.invalid`), so nobody can sign in as a bot.
  `raw_user_meta_data.username` drives the existing `handle_new_user` trigger,
  which creates the profile; the `profiles` trigger grants the 20 👑 welcome.
  The migration then sets `display_name`, `bio` and `is_bot = true`.
- `bot_lines (id uuid PK, bot_id uuid FK → profiles ON DELETE CASCADE, line text
  NOT NULL CHECK (char_length(line) <= 80))`. A line may contain the token
  `{victim}`. RLS enabled, no policies, all privileges revoked from `anon` and
  `authenticated` (private to SECURITY DEFINER code).

| Username | Display name | Bio |
|---|---|---|
| `duque_automata` | Duque Autómata | Noble de hojalata. Hereda coronas por protocolo. |
| `marquesa_cron` | Marquesa del Cron | Corre cada 20 minutos. Nunca se olvida de una corona. |
| `baron_bug` | Barón Bug | Llegó al trono por un error. No piensa arreglarlo. |
| `condesa_404` | Condesa 404 | Reinos no encontrados: los suyos, nunca. |
| `rey_algoritmo` | Rey Algoritmo | Optimiza reinados. El tuyo, a cero. |

Lines (`{victim}` = the dethroned holder's display name, else username):

- **Duque Autómata:** "Procesando coronación... completada. Gracias por tu servicio, {victim}." · "Protocolo de sucesión ejecutado. {victim}, su reinado fue archivado." · "Saludos, {victim}. Esta corona queda bajo mantenimiento ducal." · "Corona adquirida según protocolo. Sin quejas, por favor." · "El trono estaba libre. Un duque nunca deja recursos sin usar." · "Beep. Bop. Reverencias."
- **Marquesa del Cron:** "Me programaron para esto, {victim}. Nada personal." · "Cada 20 minutos pienso en vos, {victim}. Hoy te tocó." · "{victim}, tu corona venció. Yo nunca me olvido de una tarea." · "Puntual como siempre. La corona es mía." · "Tarea programada: coronarme. Estado: éxito." · "Ni feriados ni domingos: yo siempre llego."
- **Barón Bug:** "No es un bug, es una feature. Igual que tu reinado, {victim}." · "{victim}, encontré una falla en tu reinado: yo." · "Funciona en mi máquina, {victim}. Tu corona también." · "Cerré tu reinado como 'no se arregla', {victim}." · "Corona conseguida de forma totalmente intencional. Creo." · "Si ves esto, no reinicies nada."
- **Condesa 404:** "Tu reinado no fue encontrado, {victim}." · "{victim}, error 403: ya no tenés permiso para esta corona." · "Redirigiendo la corona de {victim} a su dueña legítima." · "Corona encontrada. Rey anterior: no encontrado." · "Este trono devolvía 404. Ya lo arreglé." · "Timeout de reinado. Siguiente."
- **Rey Algoritmo:** "Mi algoritmo dice que esta corona me queda mejor, {victim}." · "{victim}, optimicé tu reinado: ahora dura cero." · "Calculé todas las opciones, {victim}. En todas gano yo." · "Mi algoritmo dice que esta corona me queda mejor." · "Complejidad de mi reinado: O(1). Eterno." · "Entrenado con todos los reyes de la historia. Era obvio."

### 4.2 Pricing

- `pricing_config` gains `bot_half_life_hours` (§3).
- `title_price_floor`: the recent-dethrone count joins `profiles` on the ended
  reign's holder and keeps `NOT is_bot` rows only.
- `title_current_price`: reads the active reign with its holder's `is_bot`; for a
  bot holder it returns the half-life formula (§3) and skips grace and floor.
  Human holders keep the existing formula. `titles_priced` picks this up as is.

### 4.3 `bot_move() RETURNS reigns` — one bot plays once

`SECURITY DEFINER`, `SET search_path = ''`, EXECUTE revoked from `PUBLIC`,
`anon`, `authenticated`. Returns the new reign, or NULL when no bot can play.

1. Candidates = every (bot, title) pair where: the bot is not the title's holder;
   `min_bid` (`title_current_price + 1`, or `1` unclaimed) `<= 15` and
   `<= coin_balance(bot)`; and the holder is nobody, a bot, or a human whose
   reign started ≥ 12 hours ago. Pick one pair `ORDER BY random() LIMIT 1`.
   None → return NULL.
2. Message: a random line of that bot whose rendered length (`{victim}` replaced)
   is ≤ 80; lines containing `{victim}` only when there is a victim. No line fits
   → NULL message.
3. Act as the bot for this transaction:
   `set_config('request.jwt.claims', json_build_object('sub', bot, 'role', 'authenticated')::text, true)`,
   then `dethrone_with_coins(title, min_bid, message)`. The bot goes through the
   same validation, locks and ledger writes as a human — no second copy of the
   dethrone logic. The setting is transaction-local.

### 4.4 `bot_tick() RETURNS void` — the scheduled entry point

Same privileges as `bot_move`.

1. Salary: for each bot, act as it and call `claim_salary()` when
   `salary_status().claimed_today` is false (bots build streaks like humans).
2. `random() >= 1/6` → return (one move every ~2 h on average with a 20-minute
   schedule).
3. Call `bot_move()` inside a `BEGIN … EXCEPTION WHEN OTHERS` block: a lost race
   (a human moved first, price changed) raises a WARNING and the tick still
   commits the salaries. The next tick tries again.

### 4.5 Schedule

`CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog` (Supabase's
documented form; verified on the local stack before the push), then `cron.schedule('bot-tick', '*/20 * * * *', 'SELECT public.bot_tick()')`
(idempotent by job name). Run history lives in `cron.job_run_details`.

## 5. Keep-alive

`.github/workflows/keep-alive.yml`: `schedule` daily (`0 12 * * *`) plus
`workflow_dispatch`; one step `curl -fsS https://coronateonline.vercel.app/titulos -o /dev/null`.
`/titulos` is server-rendered per request and queries Supabase, which is API
activity. No secrets. Note for later: GitHub disables scheduled workflows after
60 days without repository activity in **public** repos; the repo is private today.

## 6. App

- **Types/services:** every query that returns a reign holder also selects
  `is_bot` and exposes it as `isBot` (title detail + holder, title cards,
  trending title, reign history, longest reigns, hall of fame, coronation ticker,
  profile header).
- **`BotBadge`** (`src/components/bot-badge.tsx`): a small "🤖 BOT" chip (the emoji
  is `aria-hidden`, so screen readers read "BOT"), rendered next to a bot holder's name. In the coronation
  ticker (a plain uppercase text marquee) the bot's name is prefixed with "🤖 ".
- **Title page:** when the holder is a bot, the floor line is replaced by
  "🤖 Corona de bot: pierde la mitad de su valor cada 6 h".
- **Profile page** of a bot: badge next to the name; its bio explains the character.

## 7. Rollout

Migration `0009` is additive (column, table, functions, bots, cron job). PR green
→ `db push` → Nico merges. Bots may move on production during the minutes before
the merge, shown without badges — harmless. After the merge: check
`cron.job_run_details` for successful `bot-tick` runs and the first bot moves.

## 8. Testing

- **SQL** `supabase/tests/bots_test.sql` (BEGIN/ROLLBACK). Setup neutralises the
  real titles by giving each one a fresh human reign (inside the 12 h grace), then
  opens exactly one eligible target per case so `bot_move` is deterministic:
  - bot crown price halves at 6 h and bottoms at 1 (backdated reign);
  - the floor's activity term ignores bot-held reigns;
  - `bot_move` takes an eligible human crown (≥ 12 h, price ≤ 14) paying price + 1;
    the ledger is zero-sum and the message is ≤ 80 chars;
  - `bot_move` returns NULL when the only target is younger than 12 h, priced
    above the cap, held by the same bot, or above every bot's balance;
  - `bot_tick` leaves every bot with today's salary;
  - `authenticated` cannot execute `bot_move` / `bot_tick` nor update `is_bot`;
    `bot_lines` is unreadable to clients.
- **Vitest:** services map `is_bot` → `isBot`; `BotBadge` usage covered through
  the mapped types.
- **Manual:** local stack, run `bot_move()` several times; ticker, title page
  (badge + bot-crown note) and a bot profile at desktop and 390 px.

## 9. Phases

1. Database: migration + SQL tests + regenerated types.
2. App: `isBot` through services, `BotBadge`, title-page note.
3. Keep-alive workflow, `DESIGN.md` + roadmap, PR, `db push`.
