#!/usr/bin/env bash
# PreToolUse hook for Read, Grep and Glob. Refuses (exit 2) to open a file that
# holds a secret value, by the one list in _secret_paths.py. A secret is checked
# in-process and reported as a boolean or a length; it is never read into the
# transcript. 2026-09-24, after two printed keys in two days.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
payload="$(cat)"

command -v python3 >/dev/null 2>&1 || exit 0
verdict="$(
  PAYLOAD="$payload" HOOK_DIR="$here" python3 - <<'PY'
import json, os, sys
sys.path.insert(0, os.environ.get("HOOK_DIR", "."))
from _secret_paths import is_secret
try:
    data = json.loads(os.environ.get("PAYLOAD", ""))
except Exception:
    print("ok"); sys.exit(0)
inp = data.get("tool_input", {}) or {}
for key in ("file_path", "path", "glob"):
    value = inp.get(key)
    if isinstance(value, str) and is_secret(value):
        print("secret"); sys.exit(0)
print("ok")
PY
)"

if [ "$verdict" != "ok" ]; then
  echo "BLOCKED: this would read a file holding a secret into the transcript." >&2
  echo "  Names only: .claude/scripts/env-names.sh [NAME]. A value is checked in-process, never opened." >&2
  exit 2
fi
exit 0
