#!/usr/bin/env bash
# One worktree for one swarm worker, from a fixed base commit.
#
#   .claude/scripts/swarm-worktree.sh <name> <base-commit> [agent-cap-usd] [patch]
#
# Makes ../offload_app-swarm-<name> on branch swarm/<name>, links the main
# checkout's .env in (the evals need the key), syncs the agent's venv, and
# writes ~/.offload-swarm/<name>.sh, which the worker sources before every
# eval run so its spend lands in the one log every worktree shares.
#
# A later round starts from the composite of the round before: pass its
# patch as the fourth argument and it is applied on top of the base, so no
# commit is needed between rounds (a commit here runs the shared gate).
#
# The worker never commits. Its candidate is `git diff`, taken by the lead.
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: swarm-worktree.sh <name> <base-commit> [agent-cap-usd] [patch]"; exit 1; }
name="$1"
base="$2"
cap="${3:-3}"
patch="${4:-}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
dir="$(dirname "$root")/$(basename "$root")-swarm-${name}"
swarm_home="$HOME/.offload-swarm"
mkdir -p "$swarm_home"

if [ ! -d "$dir" ]; then
  git -C "$root" worktree add -b "swarm/${name}" "$dir" "$base" >/dev/null
fi
[ -e "$dir/.env" ] || ln -s "$root/.env" "$dir/.env"
if [ -n "$patch" ]; then
  git -C "$dir" apply --3way "$patch"
  echo "applied:  $patch"
fi
(cd "$dir/apps/agent" && uv sync -q)

cat > "$swarm_home/${name}.sh" <<EOF
# Sourced by swarm worker ${name} before every eval run.
export EVAL_SPEND_LOG="$swarm_home/spend.jsonl"
export EVAL_AGENT="${name}"
export EVAL_AGENT_CAP_USD="${cap}"
export EVAL_SPEND_CAP_USD="\${EVAL_SPEND_CAP_USD:-70}"
EOF

echo "worktree: $dir"
echo "branch:   swarm/${name}"
echo "env:      $swarm_home/${name}.sh  (agent cap \$${cap})"
