#!/usr/bin/env bash
# The restore drill, and the tool for a real restore. Lists the nightly backups
# in R2, fetches the one you pick into a private temporary directory, asks for
# the age private key without showing it, reads the backup end to end and says
# what is in it. Then saves the decrypted dump, restores it into a new database,
# both, or nothing.
#
# The key is only ever a shell variable. It reaches age through a pipe, so it is
# never on a command line, in the environment, in a file, in the history or in a
# shell trace, and no message prints it. The R2 credentials and the default
# target come from the repository's .env through dotenv, the loader the API
# uses, and none is printed.
#
# Asks for anything the options do not give, so a run can also be unattended:
#   --file PATH        open this .dump.age instead of fetching one from R2
#   --pick N           the Nth newest backup in R2, 1 being the newest
#   --key-fd N         read the key from file descriptor N instead of asking
#   --do WHAT          verify, save, restore or both
#   --save PATH        where the decrypted dump goes
#   --target URL       the database to create and restore into, which must not
#                      exist yet, in a URL without its password
#   --password-fd N    read that database's password from file descriptor N,
#                      where otherwise PGPASSWORD or a hidden question gives it
#
# ENV_FILE=path reads another .env, such as the main checkout's from a worktree.
# BACKUP_PREFIX is read as backup.sh reads it.

# A shell trace prints every value it touches, the key among them, and bash -x,
# SHELLOPTS=xtrace and a BASH_ENV that runs set -x all start one before the
# first line. So this is the first line. SHELLOPTS is read-only and follows it,
# and BASH_XTRACEFD stays, since unsetting it closes stderr when it was 2. Each
# function that touches a secret turns the trace off again for itself.
set +x
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
env_file="${ENV_FILE:-$root/.env}"
prefix="${BACKUP_PREFIX:-backups}"
counted_tables="accounts threads messages content notes schema_migrations"
# Homebrew's libpq is keg-only, so pg_restore and psql are not on PATH after
# the brew install this script suggests. Look where Homebrew puts them.
for d in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
  if [ -d "$d" ]; then PATH="$d:$PATH"; fi
done
# Anything inherited under these names could arrive exported, and an exported
# secret would reach every child's environment. Start them clean and unexported,
# and drop BASH_ENV so no bash started from here runs a startup file.
unset age_key u_pass u_fresh u_url u_admin BASH_ENV
age_key="" u_pass="" answer="" deadline=""

say() { printf '%s\n' "$@"; }
die() { printf '%s\n' "$@" >&2; exit 1; }
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
awk_human='function human(b) {
  if (b >= 1073741824) return sprintf("%.1f GB", b / 1073741824)
  if (b >= 1048576) return sprintf("%.1f MB", b / 1048576)
  if (b >= 1024) return sprintf("%.0f KB", b / 1024)
  return b " bytes"
}
'
human() { awk "$awk_human"' BEGIN { print human(ARGV[1] + 0) }' "$1"; }

# One line from the terminal, or whatever stdin is. Fails at the end of input,
# so an unattended run stops with a reason instead of hanging.
ask() {
  printf '%s' "$1" >&2
  answer=""
  read -r answer || [ -n "$answer" ] || return 1
  # A terminal echoes the Enter that ends the answer. A pipe does not.
  [ -t 0 ] || printf '\n' >&2
}

file="" pick="" key_fd="" password_fd="" action="" save="" target=""
while [ $# -gt 0 ]; do
  case "$1" in
    --file|--pick|--key-fd|--password-fd|--do|--save|--target)
      [ $# -ge 2 ] || die "$1 needs a value."
      case "$1" in
        --file) file="$2" ;;
        --pick) pick="$2" ;;
        --key-fd) key_fd="$2" ;;
        --password-fd) password_fd="$2" ;;
        --do) action="$2" ;;
        --save) save="$2" ;;
        --target) target="$2" ;;
      esac
      shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1. See --help." ;;
  esac
done
[ -z "$file" ] || [ -z "$pick" ] || die "Use --file or --pick, not both."
# Three digits at most, so the arithmetic below never wraps a long number round.
case "$pick" in *[![:digit:]]*|????*) die "--pick takes a small number, 1 being the newest." ;; esac
case "$key_fd$password_fd" in *[![:digit:]]*) die "--key-fd and --password-fd take a file descriptor number." ;; esac
case "$action" in ""|verify|save|restore|both) ;; *) die "--do takes verify, save, restore or both." ;; esac

need="age pg_restore psql node"
[ -n "$file" ] || need="rclone $need"
missing="" formulas="" node_hint=""
for t in $need; do
  if command -v "$t" >/dev/null 2>&1; then continue; fi
  missing="$missing $t"
  case "$t" in
    node) node_hint="  node, from nvm or Homebrew"; continue ;;
    pg_restore|psql) f=libpq ;;
    *) f="$t" ;;
  esac
  case " $formulas " in *" $f "*) ;; *) formulas="$formulas $f" ;; esac
done
[ -z "$missing" ] || die "Not installed:$missing" ${formulas:+"  brew install$formulas"} ${node_hint:+"$node_hint"}

umask 077
tmp="$(mktemp -d "${TMPDIR:-/tmp}/offload-restore.XXXXXX")"
cleanup() {
  age_key=""
  unset age_key
  rm -rf "$tmp"
  if [ -t 0 ]; then stty echo 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Fill each named variable the environment lacks from .env, through dotenv,
# since a line by line read gets multi-line values wrong. The values come back
# as shell assignments on descriptor 3, which is read into a variable and never
# printed; anything the loader says on stdout goes to stderr instead.
load_env() {
  set +x
  local n need="" out
  for n in "$@"; do
    [ -n "${!n:-}" ] || need="$need $n"
  done
  { [ -n "$need" ] && [ -f "$env_file" ]; } || return 0
  if ! out="$(node -e '
    const fs = require("fs"), path = require("path");
    const [root, file, ...names] = process.argv.slice(1);
    const from = [root, path.dirname(path.resolve(file))];
    require(require.resolve("dotenv", { paths: from })).config({ path: file, quiet: true });
    const q = (v) => "\x27" + v.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
    const set = names.filter((n) => process.env[n] !== undefined);
    fs.writeSync(3, set.map((n) => `${n}=${q(process.env[n])}\n`).join(""));
  ' "$root" "$env_file" $need 3>&1 1>&2)"; then
    die "Could not read $env_file with dotenv. Has pnpm install run?"
  fi
  eval "$out"
}

# rclone with the R2 remote defined in its environment alone, as backup.sh does,
# so no config file carries a key, and the owner's own rclone config is ignored.
# The token is scoped to objects, so rclone must not go looking for the bucket.
r2() {
  RCLONE_CONFIG=/dev/null \
  RCLONE_CONFIG_R2_TYPE="${RCLONE_CONFIG_R2_TYPE:-s3}" \
  RCLONE_CONFIG_R2_PROVIDER="${RCLONE_CONFIG_R2_PROVIDER:-Cloudflare}" \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="${RCLONE_CONFIG_R2_ENDPOINT:-https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com}" \
  RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
  rclone "$@"
}

# A tool's error with the R2 values blanked out, since an error can quote one.
masked() {
  M1="$R2_ACCOUNT_ID" M2="$R2_ACCESS_KEY_ID" M3="$R2_SECRET_ACCESS_KEY" awk '{
    for (i = 1; i <= 3; i++) {
      s = ENVIRON["M" i]
      if (length(s) < 4) continue
      while ((p = index($0, s)) > 0) $0 = substr($0, 1, p - 1) "[hidden]" substr($0, p + length(s))
    }
    print "  " $0
  }' "$1" >&2
}

fetch() {
  local n missing="" count line name
  load_env R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
  for n in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
    [ -n "${!n:-}" ] || missing="$missing $n"
  done
  [ -z "$missing" ] || die "R2 is not set up here:$missing not in $env_file or the environment."
  if ! r2 lsf --files-only --format ps --separator '|' --include '*.dump.age' "r2:$R2_BUCKET/$prefix/" 2>"$tmp/r2.err" \
    | LC_ALL=C sort -r >"$tmp/list"; then
    masked "$tmp/r2.err"
    die "Could not list the backups in R2."
  fi
  count="$(wc -l <"$tmp/list" | tr -d ' ')"
  [ "$count" -gt 0 ] || die "There are no backups under $prefix/ in R2 yet."
  say "Backups in R2, newest first:"
  awk -F'|' "$awk_human"'{
    when = $1
    if ($1 ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z/)
      when = substr($1, 1, 10) " " substr($1, 12, 2) ":" substr($1, 14, 2) " UTC"
    printf "  %3d  %s  %9s\n", NR, when, human($2 + 0)
  }' "$tmp/list"
  n="$pick"
  while [ -z "$n" ]; do
    ask "Which one? [1] " || die "No answer. --pick N chooses without asking."
    n="${answer:-1}"
    case "$n" in *[![:digit:]]*|????*) n="" ;; *) n="$((10#$n))" ;; esac
    if [ -z "$n" ] || [ "$n" -lt 1 ] || [ "$n" -gt "$count" ]; then
      say "A number from 1 to $count."
      n=""
    fi
  done
  n="$((10#$n))"
  { [ "$n" -ge 1 ] && [ "$n" -le "$count" ]; } || die "There is no backup number $n, only $count."
  line="$(sed -n "${n}p" "$tmp/list")"
  name="${line%%|*}"
  say "Fetching $name"
  if ! r2 copyto "r2:$R2_BUCKET/$prefix/$name" "$tmp/$name" 2>"$tmp/r2.err"; then
    masked "$tmp/r2.err"
    die "Could not fetch $name."
  fi
  src="$tmp/$name"
}

# The key, from the terminal without echo or from --key-fd. Comment and blank
# lines are skipped, so the whole key file pasted from the password manager works.
read_key() {
  set +x
  local line="" fd="${key_fd:-0}"
  [ -n "$key_fd" ] || printf 'Paste the private key (it will not show): ' >&2
  while IFS= read -rs line <&"$fd" || [ -n "$line" ]; do
    line="${line//[[:space:]]/}"
    case "$line" in ""|"#"*) line=""; continue ;; esac
    age_key="$line"
    line=""
    break
  done
  [ -n "$key_fd" ] || printf '\n' >&2
  if [ -z "$key_fd" ] && [ -t 0 ]; then
    # Take the rest of a multi-line paste now, so none of it reaches a later
    # question, or the shell once this exits, where it would land in history.
    while IFS= read -rs -t 1 line; do line=""; done
  fi
  line=""
  case "$age_key" in
    AGE-SECRET-KEY-1?*) ;;
    *) age_key=""; die "That is not an age private key. The key starts AGE-SECRET-KEY-1." ;;
  esac
}

# The backup's plaintext on stdout. The key goes to age through a pipe that
# only this shell writes to, never as an argument or an environment variable.
decrypt() {
  age --decrypt -i <(set +x; printf '%s\n' "$age_key") "$src"
}

# What to say when age fails. Never age's own words, which can quote the key.
age_says() {
  if grep -q 'no identity matched' "$tmp/age.err"; then
    echo "That key does not open this backup."
  elif grep -q 'malformed secret key' "$tmp/age.err"; then
    echo "That key is mistyped or cut short. Paste the whole line."
  elif grep -q 'header' "$tmp/age.err"; then
    echo "This is not an age file, or not a whole one."
  elif grep -q 'payload' "$tmp/age.err"; then
    echo "This backup is damaged or cut short."
  else
    echo "age could not open this backup."
  fi
}

# Read every byte: age authenticates the whole file and pg_restore reads every
# block, which catches a dump cut short inside a sound envelope. Then list it.
verify() {
  local st made from by tables entries
  set +e
  decrypt 2>"$tmp/age.err" | pg_restore --file=/dev/null 2>"$tmp/read.err"
  st="${PIPESTATUS[0]} ${PIPESTATUS[1]}"
  set -e
  # 141 is age stopped by a closed pipe: pg_restore gave up first, and says why.
  case "${st%% *}" in 0|141) ;; *) die "$(age_says)" ;; esac
  if [ "${st##* }" != 0 ]; then
    sed 's/^/  /' "$tmp/read.err" >&2
    if grep -q 'unsupported version' "$tmp/read.err"; then
      die "This pg_restore is older than the pg_dump that made the backup: brew upgrade libpq"
    fi
    die "The backup opens, but the dump inside does not read to the end."
  fi
  set +e
  decrypt 2>/dev/null | pg_restore --list >"$tmp/toc" 2>"$tmp/list.err"
  st="${PIPESTATUS[1]}"
  set -e
  [ "$st" = 0 ] || { sed 's/^/  /' "$tmp/list.err" >&2; die "pg_restore could not list what is in it."; }
  made="$(sed -n 's/^; Archive created at //p' "$tmp/toc")"
  from="$(sed -n 's/^;[[:space:]]*Dumped from database version: //p' "$tmp/toc")"
  by="$(sed -n 's/^;[[:space:]]*Dumped by pg_dump version: //p' "$tmp/toc")"
  tables="$(awk '$4 == "TABLE" && $5 != "DATA" { n++ } END { print n + 0 }' "$tmp/toc")"
  entries="$(grep -c '^[0-9]' "$tmp/toc" || true)"
  # The privacy page promises that the backups roll over within 30 days. A
  # copy taken out of one does not, so it gets the same deadline, counted from
  # the day the backup was made.
  deadline="$(node -e '
    const [y, m, d] = process.argv[1].split("-").map(Number);
    process.stdout.write(new Date(Date.UTC(y, m - 1, d + 30)).toISOString().slice(0, 10));
  ' "${made%% *}" 2>/dev/null)" || deadline=""
  say "" "It opens and reads to the end." \
    "  made      $made" \
    "  postgres  ${from%% (*}, dumped by pg_dump ${by%% (*}" \
    "  holds     $tables tables, $entries entries in its table of contents"
}

# Said after a save and after a restore, since the copy outlives the backups.
kept() {
  if [ -n "$deadline" ]; then
    say "This copy does not expire with the backups. Delete it by $deadline."
  else
    say "This copy does not expire with the backups. Delete it within 30 days of the backup."
  fi
}

choose() {
  [ -z "$action" ] || return 0
  say "" "What now?" \
    "  1  save the decrypted dump to a file" \
    "  2  restore it into a new database" \
    "  3  both" \
    "  4  nothing more, verify only"
  while :; do
    ask "Choice [4]: " || die "No answer. --do chooses without asking."
    case "${answer:-4}" in
      1) action=save; return ;;
      2) action=restore; return ;;
      3) action=both; return ;;
      4) action=verify; return ;;
    esac
    say "1, 2, 3 or 4."
  done
}

# Why a path will not do for the plaintext dump, or nothing when it will. Any
# git work tree is refused, not only this repository, since a sibling
# worktree commits just as easily.
unsuitable() {
  local dir inside="That is inside a git work tree, where it could be committed. Choose a path outside it."
  [ -n "$1" ] || { echo "It needs a path."; return; }
  [ ! -e "$1" ] || { echo "$1 exists already. Choose a new file."; return; }
  dir="$(cd "$(dirname "$1")" 2>/dev/null && pwd -P)" || { echo "$(dirname "$1") is not a directory."; return; }
  case "$dir/" in "$(cd "$root" && pwd -P)/"*) echo "$inside"; return ;; esac
  if command -v git >/dev/null 2>&1 && git -C "$dir" rev-parse --show-toplevel >/dev/null 2>&1; then
    echo "$inside"
  fi
}

save_dump() {
  local path="$save" why
  say "" "The saved dump is not encrypted. Anyone who can read the file can read everything in it."
  while :; do
    if [ -z "$path" ]; then
      ask "Save to: " || die "No answer. --save PATH says where without asking."
      path="$answer"
    fi
    case "$path" in "~/"*) path="$HOME/${path#"~/"}" ;; esac
    why="$(unsuitable "$path")"
    [ -n "$why" ] || break
    [ -z "$save" ] || die "$why"
    say "$why"
    path=""
  done
  # Created empty first, and only if new, so a failure never removes a file
  # that was already there.
  ( set -C; : >"$path" ) 2>/dev/null || die "Could not create $path."
  if ! decrypt 2>"$tmp/age.err" >"$path"; then
    rm -f "$path"
    die "Could not write $path."
  fi
  say "Saved $path, $(human "$(wc -c <"$path")")."
  kept
}

# Take a Postgres URL apart without it reaching a command line or an
# environment: into node on stdin, out as shell assignments on descriptor 3.
#   url_parts URL        sets u_db, u_host, u_hostport, u_local, u_pass,
#                        u_url (no password) and u_admin
#   url_parts URL NAME   sets u_fresh, URL with its database swapped for NAME, when URL is local
url_parts() {
  set +x
  local out
  out="$(printf '%s' "$1" | node -e '
    const fs = require("fs");
    const q = (v) => "\x27" + String(v).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
    let u;
    try { u = new URL(fs.readFileSync(0, "utf8")); } catch { process.exit(1); }
    if (!["postgres:", "postgresql:"].includes(u.protocol) || !u.hostname) process.exit(1);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      && !["host", "hostaddr", "service"].some((k) => u.searchParams.has(k));
    const fresh = process.argv[1];
    const out = {};
    if (fresh) {
      if (!local) process.exit(1);
      u.pathname = "/" + fresh;
      out.u_fresh = u.href;
    } else {
      out.u_db = decodeURIComponent(u.pathname.slice(1));
      out.u_host = u.hostname;
      out.u_hostport = `${u.hostname}:${u.port || "5432"}`;
      out.u_local = local ? "yes" : "";
      out.u_pass = decodeURIComponent(u.password);
      u.password = "";
      out.u_url = u.href;
      u.pathname = "/postgres";
      out.u_admin = u.href;
    }
    fs.writeSync(3, Object.entries(out).map(([k, v]) => `${k}=${q(v)}\n`).join(""));
  ' ${2:+"$2"} 3>&1 1>&2)" || return 1
  eval "$out"
}

new_db_name() { case "$1" in ""|[[:digit:]]*|*[![:lower:][:digit:]_]*) return 1 ;; esac; [ "${#1}" -le 63 ]; }

# The target's password when its URL has none: from --password-fd, else from
# PGPASSWORD as libpq reads it, else asked for without echo. Enter means none.
read_password() {
  set +x
  if [ -n "$password_fd" ]; then
    IFS= read -r u_pass <&"$password_fd" || true
  elif [ -z "${PGPASSWORD:-}" ]; then
    printf 'Database password (it will not show, Enter if none): ' >&2
    IFS= read -rs u_pass || true
    printf '\n' >&2
  fi
}

# A Postgres tool with the target's password in its own environment, not on
# its command line.
pg() {
  if [ -n "$u_pass" ]; then PGPASSWORD="$u_pass" "$@"; else "$@"; fi
}

restore_dump() {
  local url="$target" shown="" st env_db=""
  local bad="It needs a postgres:// URL with a host and a new database name of lowercase letters, digits and underscores."
  # The local database in .env, if there is one. The default target is a fresh
  # database beside it, and a target anywhere else takes a typed yes, even on
  # localhost, since a tunnel to production is on localhost too.
  load_env DATABASE_URL
  if [ -n "${DATABASE_URL:-}" ] && url_parts "$DATABASE_URL" && [ -n "$u_local" ]; then
    env_db="$u_hostport"
    if [ -z "$url" ] && url_parts "$DATABASE_URL" "offload_restore_$(date -u +%Y%m%d_%H%M%S)"; then
      url_parts "$u_fresh"
      shown="$u_url"
    fi
  fi
  if [ -n "$url" ]; then
    url_parts "$url" || die "--target: $bad"
  else
    say ""
    while :; do
      if [ -n "$shown" ]; then
        ask "Restore into [$shown]: " || die "No answer. --target URL says where without asking."
        url="${answer:-$u_fresh}"
      else
        ask "Restore into (a postgres:// URL): " || die "No answer. --target URL says where without asking."
        url="$answer"
      fi
      if url_parts "$url" && new_db_name "$u_db"; then break; fi
      say "$bad"
    done
  fi
  if [ -z "$u_local" ] || [ "$u_hostport" != "$env_db" ]; then
    say "" "$u_hostport is not the local database in .env, and it could be production." \
      "This creates the database $u_db there and fills it from the backup."
    ask "Type yes to go ahead: " || true
    [ "$answer" = yes ] || die "Nothing was restored."
  fi
  [ -n "$u_pass" ] || read_password
  pg psql -X -q -v ON_ERROR_STOP=1 -v db="$u_db" "$u_admin" <<'SQL' || die "Could not create $u_db, so nothing was restored."
CREATE DATABASE :"db" TEMPLATE template0;
SQL
  say "Created $u_db. Restoring into it."
  set +e
  decrypt 2>"$tmp/age.err" \
    | pg pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --dbname="$u_url" 2>"$tmp/restore.err"
  st="${PIPESTATUS[1]}"
  set -e
  if [ "$st" != 0 ]; then
    # The first error alone: the lines after it can quote a row of the dump.
    grep -m 1 'error:' "$tmp/restore.err" | sed 's/^/  /' >&2 || true
    # ON_ERROR_STOP, or psql answers 0 for a DROP that failed.
    if pg psql -X -q -v ON_ERROR_STOP=1 -v db="$u_db" "$u_admin" >/dev/null 2>&1 <<'SQL'
DROP DATABASE :"db";
SQL
    then
      die "The restore stopped at its first error, and $u_db was dropped."
    fi
    die "The restore stopped at its first error, and dropping $u_db failed, so it is still there."
  fi
  say "Restored. Rows in some of its tables:"
  pg psql -X -q -A -t -F '|' -v ON_ERROR_STOP=1 -v tables="$counted_tables" "$u_url" <<'SQL' \
    | awk -F'|' '{ printf "  %-18s %s\n", $1, $2 }'
select t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]
from unnest(string_to_array(:'tables', ' ')) with ordinality as k(t, i)
where to_regclass(format('public.%I', t)) is not null
order by i;
SQL
  say "" "It is at $u_url"
  kept
}

# A --target is checked before anything is fetched or asked: it must not
# carry a password, which would sit on a command line and in shell history.
if [ -n "$target" ]; then
  { url_parts "$target" && new_db_name "$u_db"; } \
    || die "--target needs a postgres:// URL with a host and a new database name of lowercase letters, digits and underscores."
  [ -z "$u_pass" ] || die "--target takes a URL without its password, which comes from PGPASSWORD, --password-fd or a question."
fi
if [ -n "$file" ]; then
  { [ -f "$file" ] && [ -r "$file" ]; } || die "Cannot read $file."
  src="$file"
else
  fetch
fi
read_key
verify
choose
case "$action" in save|both) save_dump ;; esac
case "$action" in restore|both) restore_dump ;; esac
age_key=""
[ "$action" != verify ] || say "" "Verified. Nothing was saved or restored."
