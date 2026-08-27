#!/usr/bin/env bash
# PreToolUse hook for Bash. If the command is a `git commit`, run the project's
# test and lint gate and block the commit (exit 2) on failure. QUAL-1.
set -euo pipefail
payload="$(cat)"
cmd="$(printf '%s' "$payload" | grep -oE '"command"\s*:\s*"[^"]*"' | head -1 || true)"

case "$cmd" in
  *"git commit"*)
    cd "${CLAUDE_PROJECT_DIR:-.}"
    # Set these once the toolchain exists (see docs/tech/stack.md). Skips gracefully while absent.
    TEST_CMD="${PROJECT_TEST_CMD:-}"
    LINT_CMD="${PROJECT_LINT_CMD:-}"
    if [ -z "$TEST_CMD" ] && [ -f package.json ] && grep -q '"test"' package.json; then TEST_CMD="pnpm test"; fi
    if [ -z "$LINT_CMD" ] && [ -f package.json ] && grep -q '"lint"' package.json; then LINT_CMD="pnpm lint"; fi
    if [ -n "$TEST_CMD" ]; then
      echo "pre-commit gate: running $TEST_CMD" >&2
      if ! eval "$TEST_CMD" >&2; then
        echo "BLOCKED by pre-commit gate: tests failed (QUAL-1). Fix before committing." >&2
        exit 2
      fi
    fi
    if [ -n "$LINT_CMD" ]; then
      if ! eval "$LINT_CMD" >&2; then
        echo "BLOCKED by pre-commit gate: lint failed." >&2
        exit 2
      fi
    fi
    ;;
esac
exit 0
