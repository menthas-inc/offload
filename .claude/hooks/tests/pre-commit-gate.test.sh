#!/usr/bin/env bash
# The gate's stderr becomes the tool result of the `git commit` call. On
# 2026-10-05 a failing suite returned 5.6 MB of turbo output that way and filled
# the context window of three sessions in a row. Whatever the suite prints, the
# gate has to answer in a few kilobytes and still say what failed.
set -uo pipefail
gate="$(cd "$(dirname "$0")/.." && pwd)/pre-commit-gate.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git -C "$tmp" init -q
payload='{"tool_input":{"command":"git commit -m x"}}'
limit=16384
fails=0

# A suite that prints about 1 MB, names one failing test, and exits with $1.
noisy() { printf 'python3 -c "import sys; [print(\\"ok line %%d \\" %%i + \\"x\\"*80) for i in range(12000)]; print(\\"FAIL src/thing.test.ts > breaks\\"); sys.exit(%s)"' "$1"; }

check() {
  local name="$1" want_exit="$2" want_text="$3" out code
  out="$(cd "$tmp" && printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$tmp" PROJECT_TEST_CMD="$(noisy "$4")" bash "$gate" 2>&1 >/dev/null)"; code=$?
  if [ "$code" != "$want_exit" ]; then echo "FAIL $name: exit $code, wanted $want_exit"; fails=$((fails+1)); fi
  if [ "${#out}" -gt "$limit" ]; then echo "FAIL $name: ${#out} bytes on stderr, limit $limit"; fails=$((fails+1)); fi
  if ! grep -qF "$want_text" <<< "$out"; then echo "FAIL $name: no '$want_text' in the output"; fails=$((fails+1)); fi
}

check "failing suite" 2 "FAIL src/thing.test.ts > breaks" 1
check "failing suite names its log" 2 "full output:" 1
check "passing suite" 0 "pre-commit gate" 0

[ "$fails" = 0 ] && echo "pre-commit-gate: all passed"
exit "$fails"
