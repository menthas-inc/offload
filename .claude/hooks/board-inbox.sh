#!/usr/bin/env bash
# SessionStart, UserPromptSubmit and PreToolUse(Bash) hook. Hands this session
# whatever the other coding sessions posted to the board since it last looked:
# messages, plans, holds taken and released. Never blocks and never fails a call;
# a hold is something the session reads and respects, not something enforced here.
exec python3 "${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/board.py" hook 2>/dev/null || exit 0
