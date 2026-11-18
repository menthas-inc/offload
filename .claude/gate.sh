# offload's commit checks, run by the shared gate (~/.claude/hooks/commit-gate.py).
# It decides when: never for words in a command, no tests for a docs-only commit or for
# code that already passed, and the checkout the commit targets. This file decides what,
# and runs only what the commit's files reach.
set -uo pipefail
. "$GATE_LIB"

# Em dashes are a design-system non-negotiable and this is the only check that sees every
# file however it was written. The design system owns and generates its own files.
emdash_check '.claude/skills/offload-design/*' '*.lock' 'pnpm-lock.yaml'

# The specs' as-built checks read the specs' prose, so a spec edit runs them, docs or not.
if grep -q '^docs/specs/' <<< "$GATE_FILES" && ls docs/specs/*.test.mjs >/dev/null 2>&1; then
  step "the specs' as-built checks failed." "node --test docs/specs/*.test.mjs"
fi

tests_due || exit 0
# A fresh clone can make its first commit before the dependencies are there.
[ -d node_modules ] || exit 0

# Only the packages the commit reaches, and what depends on them. A code file outside
# apps/ and packages/ (root config, the lockfile, turbo.json) can reach anything.
filter="--filter=...[HEAD]"
if grep -vE '^(apps|packages)/|^\.claude/|^docs/' <<< "$GATE_CODE_FILES" | grep -q .; then filter=""; fi
packages="$(pnpm -s turbo run test $filter --dry=json 2>/dev/null | python3 -c 'import json,sys; print(" ".join(json.load(sys.stdin).get("packages", [])))' 2>/dev/null || echo all)"
echo "packages reached: ${packages:-none} (${filter:-full run})"

if [ -n "$packages" ] && [ "$packages" != "//" ]; then
  # The API's suite runs on the shared database, so the gate takes the board's `suite` hold
  # itself when that suite is in the run. A hold the session took first stays its to release.
  if [ "$packages" = all ] || grep -q '@offload/core-api' <<< "$packages"; then
    scripts="$PWD/.claude/scripts"
    [ -f "$scripts/board.py" ] || scripts="$(git worktree list --porcelain | sed -n '1s/^worktree //p')/.claude/scripts"
    mine="$(python3 -c "import sys,time; sys.path.insert(0, sys.argv[1]); import board; h = board.read_hold(board.hold_path(board.board_dir(), 'suite')); print('yes' if h and h['sid'] == board.session() and h['until'] > time.time() else '')" "$scripts" 2>/dev/null || true)"
    if ! held="$(python3 "$scripts/board.py" hold suite "the gate" --for 20 2>&1)"; then
      echo "BLOCKED: $held"
      exit 1
    fi
    [ -n "$mine" ] || trap 'python3 "$scripts/board.py" release suite >/dev/null 2>&1 || true' EXIT
  fi
  step "tests failed (QUAL-1). Fix before committing." "pnpm turbo run test $filter"
  # CI's typecheck compiles the test folders too, which a package's own tsc does not.
  step "typecheck failed, as CI's would." "pnpm turbo run typecheck $filter"
fi

# Lint is ESLint over the repo, not a turbo task: the changed files, or all of it when
# its config or the root changed.
lintable="$(grep -E '\.(js|jsx|ts|tsx|mjs|cjs)$' <<< "$GATE_CODE_FILES" | while IFS= read -r f; do [ -f "$f" ] && echo "$f"; done)"
if [ -z "$filter" ]; then
  step "lint failed." "pnpm lint"
elif [ -n "$lintable" ]; then
  step "lint failed." "pnpm exec eslint --no-warn-ignored $(tr '\n' ' ' <<< "$lintable")"
fi

# What lint cannot see and CI checks: a class, a CSS module class or an icon name that
# exists nowhere. Each renders as nothing and fails nothing else.
if touches '^(apps/(web|mobile)|packages)/|^\.claude/skills/offload-design/' && [ -f .claude/scripts/dead-classes.mjs ]; then
  for check in dead-classes dead-css dead-icons; do
    step "$check found something." "node .claude/scripts/$check.mjs"
  done
fi

# The harness's own tests sit outside every workspace.
if touches '^\.claude/|^docs/specs/.*\.test\.mjs$'; then
  for f in .claude/scripts/test_*.py; do [ -f "$f" ] && step "harness tests failed ($f)." "python3 '$f'"; done
  js="$(ls .claude/workflows/*.test.mjs docs/specs/*.test.mjs 2>/dev/null | tr '\n' ' ')"
  [ -n "$js" ] && step "harness tests failed." "node --test $js"
  for f in .claude/hooks/tests/*.test.sh; do [ -f "$f" ] && step "hook tests failed ($f)." "bash '$f'"; done
fi

# The agent plane has no package.json, so neither turbo nor ESLint sees it.
if touches '^apps/agent/' && [ -d apps/agent/.venv ]; then
  step "ruff failed in apps/agent." "(cd apps/agent && uv run ruff check .)"
fi
exit 0
