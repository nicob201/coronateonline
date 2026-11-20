#!/usr/bin/env bash
# Verifies the locking claims of dethrone_with_coins (docs/DESIGN.md "Concurrency") with REAL concurrent sessions:
#   1. three challengers bid the same amount on one title -> exactly one wins, the others see the new price
#   2. one user spends the same Coronas on two titles at once -> the profile lock rejects the second
#   3. two users dethrone each other at once -> no deadlock, both crowns move, Coronas are conserved
# Unlike the other SQL tests this one COMMITS its fixtures (separate connections cannot see an open transaction),
# so it only runs against the local stack and cleans up after itself.
# Run: SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash supabase/tests/concurrency_test.sh
set -euo pipefail

URL="${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
case "$URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "concurrency_test: refusing to run against a non-local database" >&2; exit 1 ;;
esac

PSQL=(psql "$URL" -v ON_ERROR_STOP=1 -X -q -At)
OUT="$(mktemp -d)"
FAILS=0

# User/title ids share a recognisable prefix so cleanup can find them.
uid() { printf 'c0%06x-0000-4000-8000-000000000000' "$1"; }
tid() { printf 'c1%06x-0000-4000-8000-000000000000' "$1"; }

purge() {
  "${PSQL[@]}" -c "DELETE FROM auth.users WHERE email LIKE 'conc\_%@coronate.test'; DELETE FROM public.titles WHERE slug LIKE 'conc-%';" >/dev/null
}
cleanup() { purge; rm -rf "$OUT"; }
trap cleanup EXIT
purge

assert() { # assert <description> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (expected '$2', got '$3')"; FAILS=$((FAILS + 1)); fi
}
q() { "${PSQL[@]}" -c "$1"; }
result() { if grep -qx OK "$OUT/$1"; then echo OK; else echo "$(tail -1 "$OUT/$1")"; fi; }

# dethrone_as <out-name> <user n> <title n> <amount> <hold seconds>: one session, lock held until COMMIT.
dethrone_as() {
  local start end
  start=$(date +%s)
  "${PSQL[@]}" >"$OUT/$1" 2>&1 <<SQL || true
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"$(uid "$2")","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'OK' FROM public.dethrone_with_coins('$(tid "$3")', $4);
SELECT pg_sleep($5);
COMMIT;
SQL
  end=$(date +%s)
  echo $((end - start)) >"$OUT/$1.secs"
}

# Fixtures (committed): users 1-3 race, 4 double-spends, 5-6 dethrone each other; titles 1 race, 2-3 free, 4-5 held by 5 and 6.
for n in 1 2 3 4 5 6; do
  q "INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ('$(uid $n)', 'authenticated', 'authenticated', 'conc_$n@coronate.test', '{}', '{}', now(), now());
     UPDATE public.profiles SET display_name = 'Concurrencia $n' WHERE id = '$(uid $n)';"
done
for n in 1 2 3 4 5; do
  q "INSERT INTO public.titles (id, slug, name, emoji, description) VALUES ('$(tid $n)', 'conc-$n', 'Conc $n', '👑', 'x');"
done
q "INSERT INTO public.reigns (title_id, user_id, price_paid, started_at) VALUES
   ('$(tid 4)', '$(uid 5)', 1, now()), ('$(tid 5)', '$(uid 6)', 1, now());"

echo "1. three challengers bid 5 on one title at once"
dethrone_as a 1 1 5 2 &
sleep 0.7
dethrone_as b 2 1 5 0 &
dethrone_as c 3 1 5 0 &
wait
assert "the first session wins" "OK" "$(result a)"
assert "the second waited for the title lock (>= 1 s)" "1" "$([ "$(cat "$OUT/b.secs")" -ge 1 ] && echo 1 || echo 0)"
assert "the second sees the new price" "1" "$(grep -c 'Amount must be at least 6' "$OUT/b")"
assert "the third sees the new price" "1" "$(grep -c 'Amount must be at least 6' "$OUT/c")"
assert "one active reign on the title" "1" "$(q "SELECT count(*) FROM public.reigns WHERE title_id = '$(tid 1)' AND ended_at IS NULL")"
assert "only the winner paid" "15|20|20" "$(q "SELECT string_agg(public.coin_balance(id)::text, '|' ORDER BY id) FROM public.profiles WHERE id IN ('$(uid 1)', '$(uid 2)', '$(uid 3)')")"

echo "2. one user spends 15 of 20 Coronas on two titles at once"
dethrone_as d 4 2 15 2 &
sleep 0.7
dethrone_as e 4 3 15 0 &
wait
assert "the first spend succeeds" "OK" "$(result d)"
assert "the second is rejected after the profile lock" "1" "$(grep -c 'Insufficient balance' "$OUT/e")"
assert "the balance never goes negative" "5" "$(q "SELECT public.coin_balance('$(uid 4)')")"

echo "3. two users dethrone each other at the same time"
dethrone_as f 5 5 2 2 &
dethrone_as g 6 4 2 2 &
wait
assert "no deadlock, first crossed dethrone" "OK" "$(result f)"
assert "no deadlock, second crossed dethrone" "OK" "$(result g)"
assert "the crowns swapped (title 4 -> user 6, title 5 -> user 5)" "$(uid 6)|$(uid 5)" "$(q "SELECT string_agg(user_id::text, '|' ORDER BY title_id) FROM public.reigns WHERE title_id IN ('$(tid 4)', '$(tid 5)') AND ended_at IS NULL")"
assert "Coronas are conserved (zero-sum)" "40" "$(q "SELECT sum(public.coin_balance(id)) FROM public.profiles WHERE id IN ('$(uid 5)', '$(uid 6)')")"

if [ "$FAILS" -ne 0 ]; then echo "concurrency_test: $FAILS assertion(s) failed"; exit 1; fi
echo "concurrency_test: all assertions passed"
