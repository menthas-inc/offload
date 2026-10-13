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

[ "$fails" = 0 ] && echo "pre-commit-gate: all passed"
exit "$fails"
