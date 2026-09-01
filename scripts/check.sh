#!/usr/bin/env bash
#
# The full check, reported honestly.
#
# This exists because the one-liner it replaces was wrong in the direction that
# matters. Summing "test result: ok. N passed" lines counts only the runs that
# succeeded: a crate whose tests fail prints a different line and stops the run,
# so the total quietly drops and the failure count stays at zero. It reported
# "213 passed, 0 failed" for a run with a failing test in it.
#
# So this checks exit codes rather than parsing output for good news.
#
#     scripts/check.sh
#
set -uo pipefail

fail=0
step() {
  local name="$1"; shift
  printf "%-24s" "$name"
  if out=$("$@" 2>&1); then
    # Totals are still useful, they are just not the pass criterion.
    local n
    n=$(printf '%s' "$out" | grep -oE "^test result: ok\. [0-9]+" | grep -oE "[0-9]+" | paste -sd+ - | bc 2>/dev/null)
    [ -z "$n" ] && n=$(printf '%s' "$out" | grep -oE "Tests +[0-9]+ passed" | grep -oE "[0-9]+" | paste -sd+ - | bc 2>/dev/null)
    echo "ok${n:+  ($n tests)}"
  else
    echo "FAILED"
    printf '%s\n' "$out" | grep -E "FAILED|error|panicked|✗|×" | head -8 | sed 's/^/    /'
    fail=1
  fi
}

step "lint"          pnpm lint
step "typecheck"     pnpm typecheck
step "bindings"      python3 scripts/check-type-collisions.py
step "rust"          pnpm test:rust:core
step "javascript"    pnpm test
step "build"         pnpm build

if [ "$fail" -ne 0 ]; then
  echo
  echo "Something failed. The totals above are not the point; the exit codes are."
  exit 1
fi
echo
echo "All green."
