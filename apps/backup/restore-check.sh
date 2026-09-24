#!/bin/sh
# Runs restore.sh inside the backup image against the local Docker Postgres,
# with a throwaway key and a directory standing in for R2. The real backup.sh
# seals a dump of the local database, then restore.sh lists, fetches, opens,
# checks, saves and restores it into a scratch database, which is dropped at the
# end whatever happens. It also has to refuse a key that is not one, a key that
# does not open the backup, a server that is not this machine without a yes, and
# a database that already exists. Proves the script and the round trip; it
# cannot prove R2, or the Mac's own bash and tools.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" != inside ]; then
  scratch="offload_restore_check_$(date -u +%Y%m%d%H%M%S)"
  pw=offload
  finish() {
    docker run --rm offload-backup-check psql -X -q "postgres://offload:$pw@host.docker.internal:4710/postgres" \
      -c "drop database if exists $scratch" -c "drop database if exists ${scratch}_refused" >/dev/null 2>&1 || true
  }
  trap finish EXIT
  trap 'exit 1' INT TERM HUP
  docker build -q -t offload-backup-check "$here" >/dev/null
  docker run --rm -e SCRATCH="$scratch" -e PW="$pw" -v "$here:/repo/apps/backup:ro" \
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

apk add -q bash nodejs >/dev/null 2>&1 || fail "could not add bash and node to the check container"
db="postgres://offload:$PW@host.docker.internal:4710"
pg_isready -q -h host.docker.internal -p 4710 \
  || fail "Postgres is not reachable on localhost:4710. Start it with docker compose up -d and run this again."
mkdir -p /work/tmp

age-keygen -o /work/check.key 2>/dev/null
age-keygen -o /work/other.key 2>/dev/null
key="$(grep '^AGE-SECRET-KEY-1' /work/check.key)"
other="$(grep '^AGE-SECRET-KEY-1' /work/other.key)"
export R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET=/work/r2 RCLONE_CONFIG_R2_TYPE=local
DATABASE_URL="$db/offload" BACKUP_RECIPIENT="$(age-keygen -y /work/check.key)" /backup.sh >/dev/null 2>/work/backup.err \
  || { cat /work/backup.err; fail "backup.sh could not make the fixture"; }
newest="$(ls /work/r2/backups)"
backup="/work/r2/backups/$newest"
# Older, and not a backup at all, so taking it instead of the newest fails loudly.
echo "not a backup" >/work/r2/backups/2020-01-01T000000Z.dump.age
tables="$(psql -X -At "$db/offload" -c "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')")"
migrations="$(psql -X -At "$db/offload" -c "select count(*) from schema_migrations")"
echo "fixture: $newest, the local offload database sealed by backup.sh: $tables tables, $migrations migrations"

# Everything at once, from the stand-in bucket, into a new database on a host
# that is not localhost from in here, so it has to be answered with a yes.
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
restored="$(psql -X -At "$db/$SCRATCH" -c "select count(*) from schema_migrations")"
{ [ "$migrations" -gt 0 ] && [ "$restored" = "$migrations" ]; } || fail "restored $restored of $migrations migrations"
grep -Eq "schema_migrations +$migrations\$" /work/a.log || fail "restore.sh did not report $migrations migrations"
ok "restores into a new database with all $migrations migrations, and reports them"
says a "postgres://offload@host.docker.internal:4710/$SCRATCH"
never a "offload:$PW@" "the database password"
never a "$key" "the key"
ok "prints where it restored without the password, and never prints the key"
clean a
ok "leaves no temporary directory behind"

run b --file "$backup" --key-fd 3 --do verify 3</work/check.key </dev/null \
  || { cat /work/b.log; fail "verifying a file on its own did not pass"; }
says b "$tables tables"
never b "$key" "the key"
clean b
ok "verifies a backup file on its own, which is the drill"

# The last thousand bytes gone: the table of contents at the front is intact,
# so a listing alone calls it good, and only reading every block does not.
size="$(age --decrypt -i /work/check.key "$backup" | wc -c)"
age --decrypt -i /work/check.key "$backup" | head -c $((size - 1000)) | age -r "$(age-keygen -y /work/check.key)" >/work/cut.dump.age
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

if printf 'no\n' | run e --file "$backup" --key-fd 3 --do restore --target "$db/${SCRATCH}_refused" 3</work/check.key; then
  fail "restored into a server that is not this machine without a yes"
fi
says e "is not this machine"
[ "$(psql -X -At "$db/postgres" -c "select count(*) from pg_database where datname = '${SCRATCH}_refused'")" = 0 ] \
  || fail "created a database without a yes"
clean e
ok "asks before touching a server that is not this machine, and stops without a yes"

if printf 'yes\n' | run f --file "$backup" --key-fd 3 --do restore --target "$db/$SCRATCH" 3</work/check.key; then
  fail "restored into a database that already exists"
fi
says f "already exists"
[ "$(psql -X -At "$db/$SCRATCH" -c "select count(*) from schema_migrations")" = "$migrations" ] \
  || fail "changed the database that already existed"
clean f
ok "never restores into a database that already exists, and leaves that one alone"

echo "restore.sh passed. Not proven here: R2 itself, and the Mac's own bash and tools."
