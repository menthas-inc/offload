#!/usr/bin/env bash
# PostToolUse hook for Write|Edit. Runs the linter and warns, never blocks.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
LINT_CMD="${PROJECT_LINT_CMD:-}"
if [ -n "$LINT_CMD" ]; then
  eval "$LINT_CMD" >&2 || echo "lint-warn: linter reported issues (non-blocking)." >&2
fi
exit 0
