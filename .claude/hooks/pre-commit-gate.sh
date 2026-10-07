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
    # Every step writes to a log and only a summary comes back. The gate's stderr
    # is the tool result of the commit call, and on 2026-10-05 a failing suite
    # returned 5.6 MB of turbo output that way and filled the context window of
    # three sessions in a row. Tested by .claude/hooks/tests/pre-commit-gate.test.sh.
    logdir="${TMPDIR:-/tmp}/offload-gate"; mkdir -p "$logdir"
    log="$logdir/$(date +%Y%m%d-%H%M%S)-$$.log"
    step() { # step <blocked message> <command...>
      local msg="$1"; shift
      echo "== $*" >> "$log"
      if ! eval "$@" >> "$log" 2>&1; then
        {
          echo "$msg"
          echo "failing lines (first 40):"
          grep -E '(FAIL|✗|×|[Ee]rror|ERR!|AssertionError|Expected|Received)' "$log" | grep -vE '^\s*$' | cut -c1-200 | head -40
          echo "last 30 lines:"
          tail -30 "$log" | cut -c1-200
          echo "full output: $log"
        } >&2
        exit 2
      fi
    }
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
      step "BLOCKED by pre-commit gate: tests failed (QUAL-1). Fix before committing." "$TEST_CMD"
    fi
    if [ -n "$LINT_CMD" ]; then
      step "BLOCKED by pre-commit gate: lint failed." "$LINT_CMD"
    fi
    # What lint cannot see and CI checks: a class, a CSS module class or an icon
    # name that exists nowhere. Each renders as nothing and fails nothing else.
    if [ -d node_modules ] && [ -f .claude/scripts/dead-classes.mjs ]; then
      for check in dead-classes dead-css dead-icons; do
        step "BLOCKED by pre-commit gate: $check found something." node ".claude/scripts/$check.mjs"
      done
    fi
    # The harness's own tests sit outside every workspace, so `pnpm test` never
    # ran them, and the sweep of 2026-10-07 found three that nothing ran: the
    # board's, the sweep's trigger and workflows, the specs' as-built checks.
    harness=""
    for f in .claude/scripts/test_*.py; do
      if [ -f "$f" ]; then harness="$harness python3 '$f' &&"; fi
    done
    js=""
    for f in .claude/workflows/*.test.mjs docs/specs/*.test.mjs; do
      if [ -f "$f" ]; then js="$js '$f'"; fi
    done
    if [ -n "$js" ]; then harness="$harness node --test $js &&"; fi
    if [ -n "$harness" ]; then
      step "BLOCKED by pre-commit gate: harness tests failed." "$harness true"
    fi
    # The agent plane has no package.json, so `pnpm lint` never sees it and CI's
    # `ruff check` was the first gate to. Six pushes in a row went red on ruff
    # alone before this line existed. Skipped while the venv is absent so a fresh
    # clone can still make its first commit.
    if [ -d apps/agent/.venv ]; then
      step "BLOCKED by pre-commit gate: ruff failed in apps/agent." "(cd apps/agent && uv run ruff check .)"
    fi
    echo "pre-commit gate: passed, full output: $log" >&2
    ;;
esac
exit 0
