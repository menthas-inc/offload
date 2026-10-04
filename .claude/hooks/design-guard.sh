#!/usr/bin/env bash
# PostToolUse hook for Write|Edit|MultiEdit. Warns, never blocks (exit 0).
#
# Checks the design system's non-negotiables that a linter cannot see yet.
# See .claude/skills/offload-design/handoff/CONTRIBUTING.md and OFF-7.
# Tune the patterns as the codebase grows; noise here is worse than a miss.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
payload="$(cat)"

command -v python3 >/dev/null 2>&1 || exit 0
path="$(printf '%s' "$payload" | python3 "$here/_extract.py" path)"
content="$(printf '%s' "$payload" | python3 "$here/_extract.py" content)"

[ -n "$content" ] || exit 0

# The design system owns its own files, and this hook's own patterns would trip on it.
case "$path" in
  */.claude/skills/offload-design/*|*/.claude/hooks/*) exit 0 ;;
esac

warn() { echo "design-guard: $1" >&2; }

# 1. No em dashes anywhere, including comments and commit messages.
if printf '%s' "$content" | grep -qF "$(printf '\xe2\x80\x94')"; then
  warn "found an em dash. The brand uses a comma, a colon or a full stop instead, and a middle dot for metadata."
fi

# 2. Vocabulary, in identifiers as well as copy.
if printf '%s' "$content" | grep -qiE '(const|let|var|function|class|interface|type|enum|def|CREATE TABLE|REFERENCES)[[:space:]]+[A-Za-z_]*(space|folder|workspace|board)'; then
  warn "an identifier says space, folder, workspace or board. A collection is a thread, and what it holds is content in code and has no noun in anything a person reads."
fi
if printf '%s' "$content" | grep -qiE '(capture|ingest|classif(y|ied|ication)|auto-?tag)'; then
  warn "vocabulary: offload dumps and sorts. Not captures, ingests, classifies or auto-tags."
fi

# 3. Token fidelity. A literal value in client code is a bug, reference the custom property.
case "$path" in
  */apps/mobile/*|*/apps/web/*|*/packages/widgets/*|*/packages/markup/*)
    if printf '%s' "$content" | grep -qE '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\b'; then
      warn "a literal hex colour in client code. Reference the token, and the semantic alias rather than the ramp."
    fi
    if printf '%s' "$content" | grep -qE '[^-]height:[[:space:]]*[0-9]'; then
      warn "a fixed height. Rows and bars take min-height, because text scales to 200 percent."
    fi
    ;;
esac

exit 0
