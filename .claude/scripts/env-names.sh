#!/usr/bin/env bash
# The names in the repo's .env, or whether one name is set and how long its
# value is. Never a value. Loads the file the way the API does, through dotenv,
# so a multi-line value is one entry and not a run of lines.
#
#   .claude/scripts/env-names.sh                  every name, sorted
#   .claude/scripts/env-names.sh EXPO_ACCESS_TOKEN  "EXPO_ACCESS_TOKEN: set, 40 characters" or "missing"
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root/apps/core-api"
# ENV_FILE=path reads another env file, such as apps/mobile/.env. Names only, as ever.
file="${ENV_FILE:-$root/.env}"
NAME="${1:-}" node -e '
const { parse } = require("dotenv");
const parsed = parse(require("fs").readFileSync(process.argv[1], "utf8"));
const name = process.env.NAME;
if (name) {
  const value = parsed[name];
  console.log(value === undefined ? `${name}: missing` : `${name}: set, ${value.length} characters`);
} else {
  console.log(Object.keys(parsed).sort().join("\n"));
}
' "$file"
