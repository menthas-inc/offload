#!/usr/bin/env bash
# Which kit designs this screen?
#
# Answers the question that has to be asked before building anything with a
# visual result: does a mock already exist for it? The design system's kits are
# the real design, and building from the principles instead produces something
# individually defensible and collectively a different product.
#
#   find-kit.sh              list every kit file and the screens it exports
#   find-kit.sh waitlist     find the kits for a screen, by export name or content
#
# Computed from the kits every time, never a checked-in index that can go stale.

set -euo pipefail

KITS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../skills/offload-design/ui_kits" && pwd)"

exports_of() {
  grep -oE "Object\.assign\(window,\{[^}]*" "$1" 2>/dev/null \
    | sed 's/Object.assign(window,{//' | tr ',' '\n' | sed 's/:.*//' \
    | grep -E '^[A-Za-z]' | tr '\n' ' '
}

if [ $# -eq 0 ]; then
  for f in "$KITS"/*/*.jsx "$KITS"/*/*.html; do
    [ -e "$f" ] || continue
    rel="${f#"$KITS"/}"
    ex="$(exports_of "$f")"
    printf "%-44s %s\n" "$rel" "${ex:-(markup, open it)}"
  done
  exit 0
fi

query="$1"
found=0
for f in "$KITS"/*/*.jsx "$KITS"/*/*.html; do
  [ -e "$f" ] || continue
  rel="${f#"$KITS"/}"
  # Match an export name or any text in the file, so "waitlist", "no invite"
  # and "WaitlistPage" all land on the same answer.
  if exports_of "$f" | grep -qi -- "$query" || grep -qi -- "$query" "$f"; then
    printf "%-44s %s\n" "$rel" "$(exports_of "$f")"
    found=1
  fi
done

[ "$found" = 1 ] || echo "No kit matches \"$query\". Check $KITS by hand before assuming there is none."
