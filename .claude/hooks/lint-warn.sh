#!/usr/bin/env bash
# PostToolUse hook for Write|Edit. Runs the linter and warns, never blocks.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
# Deliberately opt-in. Running the full ESLint pass after every single edit is slow
# and noisy; design-guard.sh already covers the fast checks on the file just written,
# and the pre-commit gate runs the real lint before anything lands.
# Export PROJECT_LINT_CMD to turn this on for a session.
LINT_CMD="${PROJECT_LINT_CMD:-}"
if [ -n "$LINT_CMD" ]; then
  eval "$LINT_CMD" >&2 || echo "lint-warn: linter reported issues (non-blocking)." >&2
fi
exit 0
