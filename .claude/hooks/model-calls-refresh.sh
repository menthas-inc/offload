#!/usr/bin/env bash
# PostToolUse hook for Write|Edit. When a file that shapes a model call changes,
# rebuild "offload's model calls" so the page never drifts from the code.
#
# A build that fails means the page's map no longer matches a prompt (an anchor
# moved, a prompt has no job): that is fed back to Claude to fix now, while the
# change is fresh. A build that passes says the published copy needs a republish,
# which only a session can do (/model-calls).
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
input=$(cat)
path=$(printf '%s' "$input" | python3 .claude/hooks/_extract.py path 2>/dev/null || true)
case "$path" in
  */apps/agent/src/offload_agent/prompts/*|*/apps/agent/src/offload_agent/harness/plan.py|\
  */apps/agent/src/offload_agent/harness/look.py|*/apps/agent/src/offload_agent/harness/tools.py|\
  */apps/agent/src/offload_agent/nightly.py|*/apps/agent/src/offload_agent/reader.py|\
  */apps/agent/src/offload_agent/worker.py|*/apps/agent/src/offload_agent/config.py|\
  */apps/agent/src/offload_agent/prompt_files.py|*/apps/core-api/src/jobs/handlers.ts|\
  */.claude/skills/model-calls/*) ;;
  *) exit 0 ;;
esac
if ! out=$(node .claude/skills/model-calls/build.mjs 2>&1); then
  printf '%s\n' "$out" >&2
  echo "Update .claude/skills/model-calls/jobs.mjs to match, then the page rebuilds." >&2
  exit 2
fi
python3 - "$out" <<'PY'
import json, sys
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext":
  sys.argv[1] + ". A model call changed: before the turn ends, republish the page with the model-calls skill, and update its list if this change closes or opens an item."}}))
PY
