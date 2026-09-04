#!/usr/bin/env bash
# Print a kit component whole.
#
# `find-kit.sh` answers "is this already designed?". This answers the question
# that comes straight after and is the one that keeps being got wrong: **what
# does it actually contain?**
#
# The failure this exists to stop: grepping a kit for the line you think you
# need, finding it, and missing the props around it. `WThing` passes
# `tools={[["maximize-2","Open full"],["ellipsis","More"]]}` to `WPaneHead` on
# the line after the one with the title on it, so a grep for the title finds
# everything except where the maximize button goes. Open full ended up in the
# crumb bar for exactly that reason.
#
#   .claude/scripts/kit-component.sh WThing
#   .claude/scripts/kit-component.sh WPaneHead
#
# Read the whole thing before building the screen. It is thirty lines.

set -euo pipefail

name="${1:-}"
if [ -z "$name" ]; then
  echo "usage: kit-component.sh <ComponentName>" >&2
  echo "  e.g. WThing, WPaneHead, WRow, WComposer, WSidebar" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/../skills/offload-design/ui_kits" && pwd)"

found=0
while IFS= read -r file; do
  # From `function Name(` to the closing brace at column zero, which is how
  # every component in these files is written.
  if grep -q "^function ${name}(" "$file"; then
    found=1
    echo "── ${file#"$root"/}"
    awk -v n="$name" '
      $0 ~ "^function " n "\\(" { on = 1 }
      on { print }
      on && /^\}/ { exit }
    ' "$file"
    echo
  fi
done < <(find "$root" -name "*.jsx" | sort)

if [ "$found" = 0 ]; then
  echo "No component called ${name}." >&2
  echo "Components available:" >&2
  grep -rhoE "^function W?[A-Za-z0-9_]+\(" "$root" | sed 's/^function //;s/($//;s/(//' | sort -u | tr '\n' ' ' >&2
  echo >&2
  exit 1
fi
