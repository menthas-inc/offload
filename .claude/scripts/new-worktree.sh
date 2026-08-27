#!/usr/bin/env bash
# Create an isolated git worktree and branch for an unrelated feature.
# Usage: .claude/scripts/new-worktree.sh <feature-slug>
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: new-worktree.sh <feature-slug>"; exit 1; }
slug="$1"
branch="feat/${slug}"
dir="../$(basename "$PWD")-${slug}"
git worktree add -b "$branch" "$dir"
echo "Worktree: $dir  (branch: $branch)"
echo "Open a separate Claude session there."
echo "NOTE: docs/constitution, docs/tech and .claude/skills/offload-design are shared state. Edit them on main only."
