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

# A gate that cannot block is worse than none. On 2026-10-07, with Docker down,
# the suite failed 138 files and the commit went through: the summary's
# `grep | head -40` under pipefail and errexit took a broken pipe once the
# matching lines outgrew the pipe buffer, the script exited 141 before its
# `exit 2`, and only 2 blocks. A failure that matches no pattern did the same
# through grep's exit 1.
check_cmd() {
  local name="$1" cmd="$2" out code
  out="$(cd "$tmp" && printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$tmp" PROJECT_TEST_CMD="$cmd" bash "$gate" 2>&1 >/dev/null)"; code=$?
  if [ "$code" != 2 ]; then echo "FAIL $name: exit $code, wanted 2"; fails=$((fails+1)); fi
  if [ "${#out}" -gt "$limit" ]; then echo "FAIL $name: ${#out} bytes on stderr, limit $limit"; fails=$((fails+1)); fi
}
check_cmd "a failure with more matching lines than a pipe holds" \
  'python3 -c "import sys; [print(\"Error: connect ECONNREFUSED 127.0.0.1:4710 line %d\" % i) for i in range(20000)]; sys.exit(1)"'
check_cmd "a failure that matches no pattern" 'python3 -c "import sys; print(\"boom\"); sys.exit(1)"'

# The harness's own tests live outside every workspace, so `pnpm test` never ran
# them: the board, the sweep's trigger and workflows, and the specs' as-built
# checks (sweep, 2026-10-07). A failing one blocks like a failing suite.
mkdir -p "$tmp/.claude/scripts" "$tmp/docs/specs"
printf 'import unittest\nclass T(unittest.TestCase):\n    def test_x(self):\n        self.fail("harness py breaks")\nunittest.main()\n' > "$tmp/.claude/scripts/test_broken.py"
check "failing harness python test" 2 "harness tests failed" 0
rm "$tmp/.claude/scripts/test_broken.py"
printf 'import { test } from "node:test";\nimport assert from "node:assert";\ntest("spec", () => assert.fail("harness js breaks"));\n' > "$tmp/docs/specs/broken.test.mjs"
check "failing harness node test" 2 "harness tests failed" 0
rm "$tmp/docs/specs/broken.test.mjs"

# CI runs `pnpm typecheck`, which also compiles the test folders, and the gate
# did not: a test file with a type error went through the gate and went red on
# CI (2026-10-11, PR 111). A failing typecheck blocks like a failing suite.
check_type() {
  local name="$1" cmd="$2" out code
  out="$(cd "$tmp" && printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$tmp" PROJECT_TEST_CMD="true" PROJECT_TYPECHECK_CMD="$cmd" bash "$gate" 2>&1 >/dev/null)"; code=$?
  if [ "$code" != 2 ]; then echo "FAIL $name: exit $code, wanted 2"; fails=$((fails+1)); fi
  if ! grep -qF "typecheck failed" <<< "$out"; then echo "FAIL $name: no 'typecheck failed' in the output"; fails=$((fails+1)); fi
}
check_type "failing typecheck" 'python3 -c "import sys; print(\"test/x.test.ts(1,1): error TS2322\"); sys.exit(2)"'

# The commit runs in the worktree, but the gate cd'd to CLAUDE_PROJECT_DIR (the
# MAIN checkout for a worktree session) and ran its checks there, so a worktree
# commit's own breakages passed the gate and only failed in CI. The gate must run
# against the checkout the commit targets: the session cwd from the payload,
# resolved to its git top-level. Here the test command only passes in the
# worktree, so a gate running in CLAUDE_PROJECT_DIR fails it.
check_worktree() {
  local main wt payload out code
  main="$(mktemp -d)"; git -C "$main" init -q
  wt="$(mktemp -d)"; git -C "$wt" init -q
  : > "$wt/only-in-worktree"
  payload="$(printf '{"cwd":"%s","tool_input":{"command":"git commit -m x"}}' "$wt")"
  out="$(cd "$main" && printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$main" PROJECT_TEST_CMD="test -f only-in-worktree" bash "$gate" 2>&1 >/dev/null)"; code=$?
  if [ "$code" != 0 ]; then echo "FAIL gate runs in the commit's worktree, not CLAUDE_PROJECT_DIR: exit $code"; fails=$((fails+1)); fi
  rm -rf "$main" "$wt"
}
check_worktree

# The gate runs the suite on the shared database, so it takes the board's
# `suite` hold itself. On 2026-10-26 a command that matched the gate by accident
# ran the suite while another session held `suite`, and both runs failed.
board="$(cd "$(dirname "$0")/../../scripts" && pwd)/board.py"
check_hold() {
  local name="$1" holder="$2" want_exit="$3" want_text="$4" want_left="$5" out code
  export BOARD_DIR="$tmp/board-$RANDOM"
  [ -n "$holder" ] && CLAUDE_CODE_SESSION_ID="$holder" python3 "$board" hold suite "a suite run" >/dev/null
  rm -f "$tmp/ran"
  local p='{"session_id":"me","tool_input":{"command":"git commit -m x"}}'
  out="$(cd "$tmp" && printf '%s' "$p" | CLAUDE_PROJECT_DIR="$tmp" PROJECT_TEST_CMD="test -f '$BOARD_DIR/holds/suite.json' && touch '$tmp/ran'" bash "$gate" 2>&1 >/dev/null)"; code=$?
  if [ "$code" != "$want_exit" ]; then echo "FAIL $name: exit $code, wanted $want_exit"; fails=$((fails+1)); fi
  if ! grep -qF "$want_text" <<< "$out"; then echo "FAIL $name: no '$want_text' in the output"; fails=$((fails+1)); fi
  if [ "$want_exit" = 2 ] && [ -f "$tmp/ran" ]; then echo "FAIL $name: the suite ran under another session's hold"; fails=$((fails+1)); fi
  left=no; [ -f "$BOARD_DIR/holds/suite.json" ] && left=yes
  if [ "$left" != "$want_left" ]; then echo "FAIL $name: hold left behind is $left, wanted $want_left"; fails=$((fails+1)); fi
  unset BOARD_DIR
}
check_hold "suite held by another session" "them" 2 "suite is held by" yes
check_hold "the gate holds suite while it runs, then gives it back" "" 0 "pre-commit gate: passed" no
check_hold "a hold this session took stays its own to release" "me" 0 "pre-commit gate: passed" yes

[ "$fails" = 0 ] && echo "pre-commit-gate: all passed"
exit "$fails"
