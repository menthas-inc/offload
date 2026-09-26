#!/usr/bin/env bash
# The variable names on a Railway service. Never a value: the JSON is parsed
# and only its keys are printed, which is the one listing that survives a
# multi-line value. The key-value form printed a private key on 2026-09-24.
#
#   .claude/scripts/railway-var-names.sh core-api [production]
set -euo pipefail
service="${1:?service name, for example core-api}"
environment="${2:-production}"
railway variables --service "$service" --environment "$environment" --json \
  | python3 -c 'import json, sys; print("\n".join(sorted(json.load(sys.stdin))))'
