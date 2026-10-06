#!/usr/bin/env bash
# Runs lint, typecheck, tests, and build in order. Each command's output streams live to console and to verify.log; failures don't stop the sequence, they're summarized at the end.
set -o pipefail
cd "$(dirname "$0")/.."
LOG="verify.log"
: > "$LOG"
FAILED=()

run() {
  echo "=== $1 ===" | tee -a "$LOG"
  if ! eval "$1" 2>&1 | tee -a "$LOG"; then
    FAILED+=("$1")
  fi
}

run "npm run lint"
run "npm run typecheck"
run "npm run test"
run "npm run build"

echo "===================="
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "All checks passed." | tee -a "$LOG"
else
  echo "FAILED: ${FAILED[*]}" | tee -a "$LOG"
  echo "Full output saved in $LOG"
  exit 1
fi
