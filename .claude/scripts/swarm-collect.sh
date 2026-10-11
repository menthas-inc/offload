#!/usr/bin/env bash
# Collect a round's candidates from the workers' worktrees into the repo.
#
#   .claude/scripts/swarm-collect.sh <round> <worker-name>...
#
# For each worker: its RESULT.md, its candidate.patch (taken fresh from the
# worktree, new files included) and the eval records it wrote, copied to
# docs/experiments/2026-10-swarm-tuning/rounds/<round>/candidates/<name>/.
# Nothing in a worktree is changed. Prints one line per worker.
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: swarm-collect.sh <round> <worker-name>..."; exit 1; }
round="$1"; shift
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="$root/docs/experiments/2026-10-swarm-tuning/rounds/$round/candidates"
mkdir -p "$out"
for name in "$@"; do
  dir="$(dirname "$root")/$(basename "$root")-swarm-${name}"
  if [ ! -d "$dir" ]; then echo "$name: no worktree at $dir"; continue; fi
  dest="$out/$name"
  mkdir -p "$dest/results"
  (cd "$dir" && git add -N . && git diff > "$dest/candidate.patch" && git reset -q)
  [ -f "$dir/RESULT.md" ] && cp "$dir/RESULT.md" "$dest/RESULT.md"
  find "$dir/apps/agent/evals/results" -name '*.json' -newer "$dir/.env" -exec cp {} "$dest/results/" \; 2>/dev/null || true
  lines=$(wc -l < "$dest/candidate.patch" | tr -d ' ')
  records=$(ls "$dest/results" | wc -l | tr -d ' ')
  echo "$name: patch $lines lines, $records records, $([ -f "$dest/RESULT.md" ] && echo RESULT.md || echo 'no RESULT.md')"
done
