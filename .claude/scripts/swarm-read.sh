#!/usr/bin/env bash
# Read a candidate's record the way the lead reads it: paired against the
# main checkout's history on the base's prompts hashes, never against a
# worktree's copy, which lacks the calibration runs and holds the
# candidate's own run (found 2026-10-13: every worker's z was self-referential).
#
#   .claude/scripts/swarm-read.sh <base record> <candidate record> [surface]
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
hashes="${SWARM_BASE_PROMPTS:-b6223f6e,bd84f3e2}"
cd "$root/apps/agent"
surface=""
[ -n "${3:-}" ] && surface="--surface $3"
uv run python evals/compare.py "$1" "$2" --paired --log "$root/apps/agent/evals/cases.jsonl" --prompts "$hashes" ${surface:+--surface "$3"} | grep -E '^(accuracy|latency|warm day|prod day|paired|gate|now )' 
