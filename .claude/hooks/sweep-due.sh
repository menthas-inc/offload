#!/usr/bin/env bash
# SessionStart hook. On the main checkout, at most once a day, tells the session
# that the repo sweep (/sweep) is due so it can flag it to the owner and offer a
# worktree. Never blocks and never fails a session start.
exec python3 "${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/sweep_due.py" hook 2>/dev/null || exit 0
