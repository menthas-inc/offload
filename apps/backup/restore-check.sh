#!/bin/sh
# Runs restore.sh inside the backup image against the local Docker Postgres,
# with a throwaway key and a directory standing in for R2. The real backup.sh
# seals a dump of the local database, then restore.sh lists, fetches, opens,
# checks, saves and restores it into scratch databases, which are dropped at
# the end whatever happens. It also has to keep the key out of a shell trace,
# load .env through dotenv, offer a default target only beside a local
# database, ask before any other, and refuse what it should. Proves the script
# and the round trip; it cannot prove R2, or the Mac's own bash and tools.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" != inside ]; then
  # restore.sh reads .env with the repository's own dotenv, so the container
  # borrows that copy, found the way node finds it.
  dotenv="$(node -p 'require("path").dirname(require.resolve("dotenv/package.json", { paths: [process.argv[1]] }))' "$here/../.." 2>/dev/null)" \
    || { echo "FAIL  dotenv is not installed here. Run pnpm install and try again."; exit 1; }
  scratch="offload_restore_check_$(date -u +%Y%m%d%H%M%S)"
  # The local database's password from docker-compose.yml, passed by name so
  # it is on no command line.
  PGPASSWORD=offload
  export PGPASSWORD
  finish() {
    docker run --rm -e PGPASSWORD offload-backup-check psql -X -q "postgres://offload@host.docker.internal:4710/postgres" \
      -c "drop database if exists $scratch" -c "drop database if exists ${scratch}_refused" \
      -c "drop database if exists ${scratch}_tunnel" -c "drop database if exists ${scratch}_fails" \
      -c "drop database if exists ${scratch}_src" -c "drop database if exists ${scratch}_pw" >/dev/null 2>&1 || true
  }
  trap finish EXIT
  trap 'exit 1' INT TERM HUP
  docker build -q -t offload-backup-check "$here" >/dev/null
  docker run --rm -e SCRATCH="$scratch" -e PGPASSWORD \
    -v "$here:/repo/apps/backup:ro" -v "$dotenv:/repo/node_modules/dotenv:ro" \
    offload-backup-check sh /repo/apps/backup/restore-check.sh inside
  exit
fi

# Inside the backup image from here on. Nothing leaves it but what is printed.
ok() { echo "ok    $*"; }
fail() { echo "FAIL  $*"; exit 1; }
says() { grep -qF -- "$2" "/work/$1.log" || { cat "/work/$1.log"; fail "$1: expected to see: $2"; }; }
never() { if grep -qF -- "$2" "/work/$1.log"; then fail "$1: printed $3"; fi; }
clean() { [ -z "$(ls -A /work/tmp)" ] || fail "$1: left its temporary directory behind"; }
run() { log="/work/$1.log"; shift; TMPDIR=/work/tmp bash /repo/apps/backup/restore.sh "$@" >"$log" 2>&1; }
exists() { [ "$(psql -X -At "$db/postgres" -c "select count(*) from pg_database where datname = '$1'")" = 1 ]; }
migrations_in() { psql -X -At "$db/$1" -c "select count(*) from schema_migrations"; }

apk add -q bash nodejs socat git >/dev/null 2>&1 || fail "could not add bash, node, socat and git to the check container"
db="postgres://offload@host.docker.internal:4710"
pw="$PGPASSWORD"
pg_isready -q -h host.docker.internal -p 4710 \
  || fail "Postgres is not reachable on localhost:4710. Start it with docker compose up -d and run this again."
# The same server on this container's own localhost, as .env has it on the Mac,
# and again on another port, which is how a tunnel to production looks.
socat TCP-LISTEN:4710,fork,reuseaddr TCP:host.docker.internal:4710 &
socat TCP-LISTEN:4799,fork,reuseaddr TCP:host.docker.internal:4710 &
i=0
until pg_isready -q -h localhost -p 4710 && pg_isready -q -h localhost -p 4799; do
  i=$((i + 1)); [ "$i" -lt 50 ] || fail "the forwards to the local Postgres did not come up"; sleep 0.1
done
default_db=""
trap '[ -z "$default_db" ] || psql -X -q "$db/postgres" -c "drop database if exists $default_db" >/dev/null 2>&1' EXIT
mkdir -p /work/tmp

age-keygen -o /work/check.key 2>/dev/null
age-keygen -o /work/other.key 2>/dev/null
key="$(grep '^AGE-SECRET-KEY-1' /work/check.key)"
other="$(grep '^AGE-SECRET-KEY-1' /work/other.key)"
recipient="$(age-keygen -y /work/check.key)"
export R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET=/work/r2 RCLONE_CONFIG_R2_TYPE=local
DATABASE_URL="$db/offload" BACKUP_RECIPIENT="$recipient" /backup.sh >/dev/null 2>/work/backup.err \
  || { cat /work/backup.err; fail "backup.sh could not make the fixture"; }
newest="$(ls /work/r2/backups)"
backup="/work/r2/backups/$newest"
# Older, and not a backup at all, so taking it instead of the newest fails loudly.
echo "not a backup" >/work/r2/backups/2020-01-01T000000Z.dump.age
tables="$(psql -X -At "$db/offload" -c "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')")"
migrations="$(migrations_in offload)"
deadline="$(date -u -d "@$(( $(date -u -d "${newest%%T*} 00:00" +%s) + 30 * 86400 ))" +%Y-%m-%d)"
echo "fixture: $newest, the local offload database sealed by backup.sh: $tables tables, $migrations migrations"

# .env as the Mac has it, with the local database. And one whose database is
# somewhere else, with the R2 names, where a quoted value over two lines hides
# a second R2_BUCKET that a line by line reader would take instead.
echo "DATABASE_URL=postgres://offload:$pw@localhost:4710/offload" >/work/local.env
cat >/work/remote.env <<'EOF'
R2_ACCOUNT_ID=x
R2_ACCESS_KEY_ID=x
R2_SECRET_ACCESS_KEY=x
R2_BUCKET=/work/r2
NOTES="a quoted value over two lines,
R2_BUCKET=/nowhere"
DATABASE_URL=postgres://someone:hunter2@db.example.com:5432/railway
EOF

# Everything at once, from the stand-in bucket, into a new database on a host
# that is not the local one, so it has to be answered with a yes.
printf 'yes\n' | run a --pick 1 --key-fd 3 --do both --save /work/plain.dump --target "$db/$SCRATCH" 3</work/check.key \
  || { cat /work/a.log; fail "restore.sh did not get through fetch, check, save and restore"; }
sed 's/^/      | /' /work/a.log
says a "Fetching $newest"
ok "lists the stand-in bucket newest first and fetches the newest"
says a "$tables tables"
ok "opens it with the key from a file descriptor and counts $tables tables"
[ "$(stat -c %a /work/plain.dump)" = 600 ] || fail "the saved dump can be read by others"
for t in accounts threads messages schema_migrations; do
  pg_restore --list /work/plain.dump | grep -q " TABLE public $t " || fail "the saved dump has no $t"
done
ok "saves the decrypted dump readable by its owner alone, with its tables in it"
restored="$(migrations_in "$SCRATCH")"
{ [ "$migrations" -gt 0 ] && [ "$restored" = "$migrations" ]; } || fail "restored $restored of $migrations migrations"
grep -Eq "schema_migrations +$migrations\$" /work/a.log || fail "restore.sh did not report $migrations migrations"
ok "restores into a new database with all $migrations migrations, and reports them"
says a "is not the local database"
says a "postgres://offload@host.docker.internal:4710/$SCRATCH"
never a "$key" "the key"
ok "asks before a server that is not the local one, says where it restored, and never prints the key"
[ "$(grep -c "Delete it by $deadline" /work/a.log)" = 2 ] || fail "a: did not name $deadline after the save and after the restore"
ok "names the day to delete the saved dump and the restored database by, 30 days after the backup"
clean a
ok "leaves no temporary directory behind"

run b --file "$backup" --key-fd 3 --do verify 3</work/check.key </dev/null \
  || { cat /work/b.log; fail "verifying a file on its own did not pass"; }
says b "$tables tables"
never b "$key" "the key"
clean b
ok "verifies a backup file on its own, which is the drill"

echo "set -x" >/work/trace.sh
for how in "env SHELLOPTS=xtrace bash" "env BASH_ENV=/work/trace.sh bash" "bash -x"; do
  TMPDIR=/work/tmp $how /repo/apps/backup/restore.sh --file "$backup" --key-fd 3 --do verify 3</work/check.key </dev/null >/work/x.log 2>&1 \
    || { cat /work/x.log; fail "$how: verifying did not pass"; }
  never x "$key" "the key under $how"
done
clean x
ok "keeps the key out of a shell trace, however the trace was turned on"

# The last thousand bytes gone: the table of contents at the front is intact,
# so a listing alone calls it good, and only reading every block does not.
size="$(age --decrypt -i /work/check.key "$backup" | wc -c)"
age --decrypt -i /work/check.key "$backup" | head -c $((size - 1000)) | age -r "$recipient" >/work/cut.dump.age
age --decrypt -i /work/check.key /work/cut.dump.age | pg_restore --list >/dev/null 2>&1 \
  || fail "the cut dump does not even list, so it proves less than it should"
if run g --file /work/cut.dump.age --key-fd 3 --do verify 3</work/check.key </dev/null; then
  fail "called a dump cut short a good backup"
fi
says g "does not read to the end"
clean g
ok "reads every byte, so a dump cut short inside a whole age file fails, where a listing alone passes"

if printf 'not-a-key\n' | run c --file "$backup" --do verify; then fail "accepted a key that is not one"; fi
says c "not an age private key"
never c "not-a-key" "what was pasted"
clean c
ok "refuses a key that is not one, without repeating it"

if run d --file "$backup" --key-fd 3 --do verify 3</work/other.key </dev/null; then fail "opened the backup with the wrong key"; fi
says d "does not open this backup"
never d "$other" "the key"
clean d
ok "refuses a key that does not open the backup"

if run t --file "$backup" --key-fd 3 --do restore --target "postgres://offload:$pw@host.docker.internal:4710/${SCRATCH}_pw" \
  3</work/check.key </dev/null; then
  fail "took a --target with a password in it"
fi
says t "without its password"
never t "offload:$pw@" "the password it was given"
[ "$(wc -l </work/t.log)" = 1 ] || { cat /work/t.log; fail "t: took more than one line to refuse"; }
if exists "${SCRATCH}_pw"; then fail "created a database from a --target with a password in it"; fi
ok "refuses a --target that carries a password, in one line, before anything else"

if printf 'no\n' | run e --file "$backup" --key-fd 3 --do restore --target "$db/${SCRATCH}_refused" 3</work/check.key; then
  fail "restored into a server that is not the local one without a yes"
fi
says e "is not the local database"
if exists "${SCRATCH}_refused"; then fail "created a database without a yes"; fi
clean e
ok "asks before touching a server that is not the local one, and stops without a yes"

printf '%s\n' "$pw" >/work/pw
if (unset PGPASSWORD; printf 'yes\n' | run f --file "$backup" --key-fd 3 --password-fd 4 --do restore --target "$db/$SCRATCH" \
  3</work/check.key 4</work/pw); then
  fail "restored into a database that already exists"
fi
says f "already exists"
never f "password authentication failed" "a login failure: the password from --password-fd did not arrive"
[ "$(migrations_in "$SCRATCH")" = "$migrations" ] || fail "changed the database that already existed"
clean f
ok "takes the database password from --password-fd, and never restores into a database that already exists"

if (unset R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; export ENV_FILE=/work/remote.env
  run h --pick 1 --key-fd 3 --do restore 3</work/check.key </dev/null); then
  fail "restored with no --target and no local database to put one beside"
fi
says h "Fetching $newest"
ok "loads the R2 names from .env through dotenv, past a quoted value over two lines"
says h "Restore into (a postgres:// URL)"
says h "--target URL says where"
never h "db.example.com" "the remote database from .env as a default"
never h "hunter2" "the password in .env"
clean h
ok "offers no default beside a database that is not local, and stops without a --target"

(unset PGPASSWORD; export ENV_FILE=/work/local.env
  printf '\n' | run i --file "$backup" --key-fd 3 --do restore 3</work/check.key) \
  || { cat /work/i.log; fail "restoring into the default target did not pass"; }
default_db="$(sed -n 's|^It is at postgres://offload@localhost:4710/\(offload_restore_[0-9_]*\)$|\1|p' /work/i.log)"
[ -n "$default_db" ] || { cat /work/i.log; fail "i: did not say where it restored"; }
says i "Restore into [postgres://offload@localhost:4710/$default_db]"
never i "Type yes" "a question the local database does not need"
never i "offload:$pw@" "the password from .env"
[ "$(migrations_in "$default_db")" = "$migrations" ] || fail "the default target does not hold all $migrations migrations"
says i "Delete it by $deadline"
psql -X -q "$db/postgres" -c "drop database $default_db" >/dev/null && default_db=""
clean i
ok "offers a fresh offload_restore_<time> beside the local database in .env, and restores there with its password"

if (export ENV_FILE=/work/local.env; printf 'no\n' | run j --file "$backup" --key-fd 3 --do restore \
  --target "postgres://offload@localhost:4799/${SCRATCH}_tunnel" 3</work/check.key); then
  fail "restored through a tunnel without a yes"
fi
says j "is not the local database"
if exists "${SCRATCH}_tunnel"; then fail "created a database through a tunnel without a yes"; fi
clean j
ok "asks before a localhost port other than the one in .env, since a tunnel to production looks local"

# A dump that cannot be restored: a check constraint calls a function that
# names a table without its schema, which pg_restore's empty search_path breaks
# at the first row. Postgres then quotes that row.
psql -X -q "$db/postgres" -c "create database ${SCRATCH}_src"
psql -X -q -v ON_ERROR_STOP=1 "$db/${SCRATCH}_src" <<'SQL'
create table lookup (v text);
insert into lookup values ('x');
create function allowed(text) returns boolean language sql as $$ select $1 <> (select v from lookup) $$;
create table guarded (v text check (allowed(v)));
insert into guarded values ('a row that must not be printed');
SQL
pg_dump -Fc "$db/${SCRATCH}_src" | age -r "$recipient" >/work/fails.dump.age
psql -X -q "$db/postgres" -c "drop database ${SCRATCH}_src"
if printf 'yes\n' | run k --file /work/fails.dump.age --key-fd 3 --do restore --target "$db/${SCRATCH}_fails" 3</work/check.key; then
  fail "called a failed restore done"
fi
says k 'COPY failed for table "guarded"'
never k "a row that must not be printed" "a row of the dump"
says k "and ${SCRATCH}_fails was dropped."
if exists "${SCRATCH}_fails"; then fail "left the database of a failed restore behind"; fi
clean k
ok "on a failed restore, shows the first error and no row, and drops the new database"

git init -q /work/elsewhere
if run s --file "$backup" --key-fd 3 --do save --save /work/elsewhere/plain.dump 3</work/check.key </dev/null; then
  fail "saved the plaintext dump into a git work tree"
fi
says s "inside a git work tree"
[ ! -e /work/elsewhere/plain.dump ] || fail "wrote the plaintext dump into a git work tree"
if run s2 --file "$backup" --key-fd 3 --do save --save /work/plain.dump 3</work/check.key </dev/null; then
  fail "saved over an existing file"
fi
says s2 "exists already"
clean s2
ok "keeps the plaintext dump out of every git work tree and off an existing file"

if run p --pick 18446744073709551617 --key-fd 3 --do verify 3</work/check.key </dev/null; then
  fail "took a --pick too long to be a backup's number"
fi
says p "--pick takes"
ok "refuses a --pick too long to be a backup's number"

sleep 30 | TMPDIR=/work/tmp bash /repo/apps/backup/restore.sh --file "$backup" --key-fd 3 --do restore \
  3</work/check.key >/work/l.log 2>&1 &
i=0
until grep -q "Restore into" /work/l.log; do
  i=$((i + 1)); [ "$i" -lt 100 ] || { cat /work/l.log; fail "l: never reached the question"; }; sleep 0.1
done
pkill -TERM -f "apps/backup/restore.sh --file"
i=0
until [ -z "$(ls -A /work/tmp)" ]; do
  i=$((i + 1)); [ "$i" -lt 50 ] || fail "l: left its temporary directory behind when stopped"; sleep 0.1
done
ok "removes its temporary directory when it is stopped at a question"

echo "restore.sh passed. Not proven here: R2 itself, and the Mac's own bash and tools."
