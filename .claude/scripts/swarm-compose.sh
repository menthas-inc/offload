#!/usr/bin/env bash
# Compose a round's surviving candidates on a merge worktree, one at a time.
#
#   .claude/scripts/swarm-compose.sh <merge-name> <base-commit> <patch>...
#
# Makes ../offload_app-swarm-<merge-name> at the base if it is not there
# (the worktree script, so the spend environment exists too), then applies
# each patch in the order given with a plain `git apply --check` first. A
# patch that does not apply is skipped and named; a patch that applies but
# breaks the unit suite (without the _db tests) is reverted and named. What
# remains in the worktree is the composite; the lead screens it with the
# lead's spend environment and saves `git diff` as the round's composite
# patch. No evals are run here. Prints one line per patch and a summary.
set -uo pipefail
[ $# -ge 3 ] || { echo "usage: swarm-compose.sh <merge-name> <base-commit> <patch>..."; exit 1; }
name="$1"; base="$2"; shift 2
root="$(cd "$(dirname "$0")/../.." && pwd)"
dir="$(dirname "$root")/$(basename "$root")-swarm-${name}"
[ -d "$dir" ] || "$root/.claude/scripts/swarm-worktree.sh" "$name" "$base" 40 >/dev/null
applied=(); skipped=(); broke=()
for patch in "$@"; do
  label="$(basename "$(dirname "$patch")")"
  if ! git -C "$dir" apply --check "$patch" 2>/dev/null; then
    echo "$label: does not apply, skipped"; skipped+=("$label"); continue
  fi
  git -C "$dir" apply "$patch"
  if (cd "$dir/apps/agent" && uv run pytest -q -p no:cacheprovider --ignore-glob='tests/*_db.py' >/tmp/swarm-compose-"$label".log 2>&1); then
    echo "$label: applied, suite green"; applied+=("$label")
  else
    if git -C "$dir" apply -R "$patch" 2>/dev/null; then
      echo "$label: suite red after it, reverted (log /tmp/swarm-compose-$label.log)"; broke+=("$label")
    else
      echo "$label: suite red after it and the revert failed; stopping with it in place"; broke+=("$label"); break
    fi
  fi
done
echo "applied: ${applied[*]:-none}"
echo "skipped: ${skipped[*]:-none}"
echo "broke:   ${broke[*]:-none}"
