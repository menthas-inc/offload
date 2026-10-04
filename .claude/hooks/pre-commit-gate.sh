#!/usr/bin/env bash
# PreToolUse hook for Bash. If the command is a `git commit`, run the project's
# test and lint gate and block the commit (exit 2) on failure. QUAL-1.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
payload="$(cat)"
# The whole command, parsed as JSON. A grep for the "command" field stopped at
# the first quote inside the command, so anything with a quoted value before
# "commit" walked past the gate (2026-09-25, twice in one day).
cmd="$(printf '%s' "$payload" | python3 "$here/_extract.py" command 2>/dev/null || true)"

# Any git invocation that commits, not only the literal "git commit": a
# `git -c user.name=x commit` walked past the old pattern on 2026-09-25 and
# committed without the gate.
commits="no"
# Loose on purpose: "git" and later the word "commit". A stricter pattern that
# modelled git's options broke on a quoted value with a space in it, and the
# cost of a false match is one extra run of the suites.
if printf '%s' "$cmd" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+([^[:space:]].*[[:space:]]+)?commit([^[:alnum:]_]|$)'; then commits="yes"; fi

case "$commits" in
  yes)
    cd "${CLAUDE_PROJECT_DIR:-.}"

    # Em dashes are a design-system non-negotiable and this is the only gate that
    # sees every file however it was written. design-guard.sh runs on the Write and
    # Edit tools only, so anything authored through a shell heredoc bypasses it.
    # The design system owns its own files and generates some of them, so it is skipped.
    emdash="$(printf '\xe2\x80\x94')"
    offenders=""
    while IFS= read -r f; do
      case "$f" in
        .claude/skills/offload-design/*|*.lock|pnpm-lock.yaml) continue ;;
      esac
      [ -f "$f" ] || continue
      if grep -qF "$emdash" "$f" 2>/dev/null; then offenders="$offenders $f"; fi
    done <<< "$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)"
    if [ -n "$offenders" ]; then
      echo "BLOCKED by pre-commit gate: em dash found in:$offenders" >&2
      echo "The brand uses a comma, a colon or a full stop instead, and a middle dot for metadata (OFF-7)." >&2
      exit 2
    fi
    # Set these once the toolchain exists (see docs/tech/stack.md). Skips gracefully while absent.
    TEST_CMD="${PROJECT_TEST_CMD:-}"
    LINT_CMD="${PROJECT_LINT_CMD:-}"
    # Only fall back to the pnpm scripts once the dependencies are actually there,
    # otherwise a fresh clone cannot make its first commit.
    if [ -d node_modules ]; then
      if [ -z "$TEST_CMD" ] && [ -f package.json ] && grep -q '"test"' package.json; then TEST_CMD="pnpm test"; fi
      if [ -z "$LINT_CMD" ] && [ -f package.json ] && grep -q '"lint"' package.json; then LINT_CMD="pnpm lint"; fi
    fi
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
    # What lint cannot see and CI checks: a class, a CSS module class or an icon
    # name that exists nowhere. Each renders as nothing and fails nothing else.
    if [ -d node_modules ] && [ -f .claude/scripts/dead-classes.mjs ]; then
      for check in dead-classes dead-css dead-icons; do
        if ! node ".claude/scripts/$check.mjs" >&2; then
          echo "BLOCKED by pre-commit gate: $check found something." >&2
          exit 2
        fi
      done
    fi
    # The agent plane has no package.json, so `pnpm lint` never sees it and CI's
    # `ruff check` was the first gate to. Six pushes in a row went red on ruff
    # alone before this line existed. Skipped while the venv is absent so a fresh
    # clone can still make its first commit.
    if [ -d apps/agent/.venv ]; then
      if ! (cd apps/agent && uv run ruff check . >&2); then
        echo "BLOCKED by pre-commit gate: ruff failed in apps/agent." >&2
        exit 2
      fi
    fi
    ;;
esac
exit 0
