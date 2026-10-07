#!/usr/bin/env bash
# A restored backup has to be usable by the roles that run offload, not only by
# the one that restored it. backup.sh dumps with --no-owner --no-privileges and
# restore.sh restores the same way, so every grant the migrations made to the
# worker's role is gone, and schema_migrations comes back whole, so migrate
# re-applies none of them. Without regrant.sql the worker's first claim fails
# with permission denied for table jobs.
#
# The expectation comes from the migrations and nothing else: this runs every
# migration into a new scratch database through the real runner, and the
# grants the worker holds there are what a restore must give it back. A stray
# grant in some dev database never reaches regrant.sql that way. Then it seals
# a dump of that database with backup.sh's flags, restores it through
# restore.sh into another scratch database, and checks:
#   - the worker's role reads jobs there, and still cannot read sessions
#   - its grants there are exactly the migrated database's, so a migration that
#     changes a grant fails this until regrant.sql is regenerated
#   - it connects as itself, even where PUBLIC may not connect
#   - regrant.sql refuses a database where the worker already has grants, which
#     the live one does, unless it is told -v again=yes, and then ends the same,
#     stray procedure grants included
#   - with an API role in the cluster, that role owns everything and reads jobs
#   - a restore told --grants no gives nobody anything
#
#   source <env with DATABASE_URL and AGENT_DATABASE_URL>; apps/backup/test/regrant.test.sh
#   apps/backup/test/regrant.test.sh --write   regenerates regrant.sql's grants
#
# Both URLs must be on localhost. DATABASE_URL gives the server and a role that
# can create databases and roles; its own database is not read. AGENT_DATABASE_URL
# is the worker's login. Scratch names start offload_sweep_restore_ and are
# dropped at the end whatever happens. Nothing prints a password.
set +x
set -euo pipefail

backup="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$backup/../.." && pwd)"
regrant="$backup/regrant.sql"
for d in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
  if [ -d "$d" ]; then PATH="$d:$PATH"; fi
done

ok() { echo "ok    $*"; }
fail() { echo "FAIL  $*"; exit 1; }

for t in pg_dump pg_restore psql age age-keygen node pnpm; do
  command -v "$t" >/dev/null 2>&1 || fail "$t is not installed"
done
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set. Source the test database's environment first."
[ -n "${AGENT_DATABASE_URL:-}" ] || fail "AGENT_DATABASE_URL is not set. Source the test database's environment first."

# The URLs apart, into shell assignments on descriptor 3, so no password is on
# a command line. Anything but localhost is refused.
parts="$(node -e '
  const fs = require("fs");
  const q = (v) => "\x27" + String(v).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
  const local = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  const u = new URL(process.env.DATABASE_URL);
  const a = new URL(process.env.AGENT_DATABASE_URL);
  if (!local(u) || !local(a)) process.exit(2);
  if (decodeURIComponent(a.username) !== "offload_agent") process.exit(3);
  const out = { pass: decodeURIComponent(u.password), agent_pass: decodeURIComponent(a.password) };
  u.password = ""; a.password = "";
  u.pathname = "/postgres"; a.pathname = "/postgres";
  out.admin = u.href; out.agent_admin = a.href;
  fs.writeSync(3, Object.entries(out).map(([k, v]) => `${k}=${q(v)}\n`).join(""));
' 3>&1 1>&2)" || fail "DATABASE_URL and AGENT_DATABASE_URL have to be postgres URLs on localhost, the second as offload_agent"
pass="" agent_pass="" admin="" agent_admin=""
eval "$parts"
parts=""
PGPASSWORD="$pass"
export PGPASSWORD
pass=""
at() { printf '%s' "${admin%/postgres}/$1"; }
as_worker() { PGPASSWORD="$agent_pass" psql -X -q -A -t -v ON_ERROR_STOP=1 "${agent_admin%/postgres}/$1" "${@:2}"; }

stamp="$(date -u +%Y%m%d%H%M%S)_$$"
src_db="offload_sweep_restore_${stamp}_src"
scratch="offload_sweep_restore_$stamp"
plain="offload_sweep_restore_${stamp}_plain"
api_role="offload_sweep_restore_api_$stamp"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/regrant-test.XXXXXX")"
# One drop per call, so one that fails cannot stop the next, and whatever is
# left is named rather than swallowed.
cleanup() {
  local d left=""
  for d in "$scratch" "$plain" "$src_db"; do
    psql -X -q "$admin" -c "drop database if exists $d with (force)" >/dev/null 2>&1 || left="$left database $d,"
  done
  psql -X -q "$admin" -c "drop role if exists $api_role" >/dev/null 2>&1 || left="$left role $api_role,"
  [ -z "$left" ] || echo "WARN  could not drop, still in the cluster:${left%,}" >&2
  rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP

# Every migration, into a new database, through the runner the API uses. The
# variables env.ts insists on get throwaway values: migrate reads none of them.
migrated() {
  local throwaway
  throwaway="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
  psql -X -q -v ON_ERROR_STOP=1 "$admin" -c "create database $1 template template0" >/dev/null
  NODE_ENV=development DATABASE_URL="$(at "$1")" API_URL=http://localhost:4701 WEB_URL=http://localhost:4700 \
    COOKIE_DOMAIN=localhost BETTER_AUTH_SECRET="$throwaway" INTERNAL_SERVICE_TOKEN="$throwaway" \
    pnpm --dir "$root/apps/core-api" --silent migrate >"$tmp/migrate.log" 2>&1 \
    || { tail -5 "$tmp/migrate.log" | sed 's/^/  | /'; fail "the migrations did not run into a scratch database"; }
}

# Every privilege the worker's role holds, one line each, by name.
acl() {
  psql -X -q -A -t -v ON_ERROR_STOP=1 "$1" <<'SQL'
set search_path = '';
select 'schema', n.nspname, '', a.privilege_type
from pg_namespace n, aclexplode(n.nspacl) a where a.grantee = 'offload_agent'::regrole
union all
select case c.relkind when 'S' then 'sequence' else 'table' end, n.nspname || '.' || c.relname, '', a.privilege_type
from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
where a.grantee = 'offload_agent'::regrole
union all
select 'column', n.nspname || '.' || c.relname, at.attname, a.privilege_type
from pg_attribute at join pg_class c on c.oid = at.attrelid join pg_namespace n on n.oid = c.relnamespace,
  aclexplode(at.attacl) a
where a.grantee = 'offload_agent'::regrole and not at.attisdropped
union all
select 'function', p.oid::regprocedure::text, '', a.privilege_type
from pg_proc p, aclexplode(p.proacl) a where a.grantee = 'offload_agent'::regrole
order by 1, 2, 3, 4;
SQL
}

# The same privileges as grant statements, which is the generated half of
# regrant.sql.
grants() {
  psql -X -q -A -t -v ON_ERROR_STOP=1 "$1" <<'SQL'
set search_path = '';
with g(kind, obj, col, priv) as (
  select 'schema', format('%I', n.nspname), null::text, a.privilege_type
  from pg_namespace n, aclexplode(n.nspacl) a where a.grantee = 'offload_agent'::regrole
  union all
  select case c.relkind when 'S' then 'sequence' else 'table' end, format('%I.%I', n.nspname, c.relname), null, a.privilege_type
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
  where a.grantee = 'offload_agent'::regrole
  union all
  select 'column', format('%I.%I', n.nspname, c.relname), format('%I', at.attname), a.privilege_type
  from pg_attribute at join pg_class c on c.oid = at.attrelid join pg_namespace n on n.oid = c.relnamespace,
    aclexplode(at.attacl) a
  where a.grantee = 'offload_agent'::regrole and not at.attisdropped
  union all
  select 'function', p.oid::regprocedure::text, null, a.privilege_type
  from pg_proc p, aclexplode(p.proacl) a where a.grantee = 'offload_agent'::regrole
),
r(priv, o) as (values ('SELECT', 1), ('INSERT', 2), ('UPDATE', 3), ('DELETE', 4), ('TRUNCATE', 5),
  ('REFERENCES', 6), ('TRIGGER', 7), ('MAINTAIN', 8), ('USAGE', 9), ('CREATE', 10), ('EXECUTE', 11)),
s(kind, obj, o, stmt) as (
  select kind, obj, min(o), format('grant %s on %s %s to offload_agent;',
    string_agg(lower(priv), ', ' order by o), kind, obj)
  from g join r using (priv) where kind <> 'column' group by kind, obj
  union all
  select kind, obj, min(o), format('grant %s (%s) on table %s to offload_agent;',
    lower(priv), string_agg(col, ', ' order by col), obj)
  from g join r using (priv) where kind = 'column' group by kind, obj, priv
)
select stmt from s
order by case kind when 'schema' then 0 else 1 end, obj, case kind when 'column' then 1 else 0 end, o;
SQL
}

marker="-- Generated from here down by apps/backup/test/regrant.test.sh --write."

migrated "$src_db"

if [ "${1:-}" = --write ]; then
  [ -f "$regrant" ] && grep -qxF -- "$marker" "$regrant" || fail "$regrant has no line: $marker"
  body="$(grants "$(at "$src_db")")" || fail "could not read the grants from the migrated database"
  [ -n "$body" ] || fail "the migrations give the worker's role nothing"
  next="$(mktemp "$backup/.regrant.XXXXXX")"
  { sed "/^$(printf '%s' "$marker" | sed 's/[.[\*^$/]/\\&/g')\$/q" "$regrant"; printf '%s\n' "$body"; } >"$next"
  chmod 644 "$next"
  mv "$next" "$regrant"
  echo "wrote $(printf '%s\n' "$body" | wc -l | tr -d ' ') grants from the migrations into $regrant"
  exit 0
fi

want="$(acl "$(at "$src_db")")"
[ -n "$want" ] || fail "the migrations give the worker's role nothing"
ok "every migration runs into a scratch database, and gives the worker $(printf '%s\n' "$want" | wc -l | tr -d ' ') privileges there"

# The fixture: that database dumped as backup.sh dumps it, sealed to a
# throwaway key.
age-keygen -o "$tmp/key" 2>/dev/null
pg_dump --format=custom --no-owner --no-privileges "$(at "$src_db")" 2>"$tmp/dump.err" \
  | age --recipient "$(age-keygen -y "$tmp/key")" >"$tmp/fixture.dump.age" \
  || { sed 's/^/  /' "$tmp/dump.err"; fail "could not dump the migrated database"; }

# Through restore.sh, as a real restore goes. Its DATABASE_URL is the same
# server without a password, so the scratch target is local and needs no yes.
restore() {
  mkdir -p "$tmp/work"
  DATABASE_URL="$(at "$src_db")" TMPDIR="$tmp/work" bash "$backup/restore.sh" --file "$tmp/fixture.dump.age" --key-fd 3 \
    --do restore --target "$(at "$1")" --grants "$2" 3<"$tmp/key" </dev/null >"$tmp/$1.log" 2>&1
}
restore "$scratch" yes || { sed 's/^/  | /' "$tmp/$scratch.log"; fail "restore.sh did not restore the fixture"; }
ok "restore.sh restores a dump made with backup.sh's flags, told --grants yes"

worker_reads() {
  psql -X -q -A -t -v ON_ERROR_STOP=1 "$(at "$1")" -c "set role offload_agent" -c "select count(*) from $2" 2>&1
}
out="$(worker_reads "$scratch" jobs)" || fail "the worker's role cannot read jobs in the restored database: $(printf '%s' "$out" | head -1)"
ok "the worker's role reads jobs in the restored database"

if out="$(worker_reads "$scratch" sessions)"; then fail "the worker's role reads sessions in the restored database"; fi
ok "and still cannot read sessions"

if ! diff <(printf '%s\n' "$want") <(acl "$(at "$scratch")") >"$tmp/acl.diff"; then
  sed 's/^/  /' "$tmp/acl.diff"
  fail "the restored grants differ from what the migrations give. If a migration changed them: $0 --write"
fi
ok "its grants there are exactly what the migrations give"

# A cluster can refuse PUBLIC a connection, and then only an explicit grant
# lets the worker in. Connecting as it, not set role, is what proves that.
psql -X -q -v ON_ERROR_STOP=1 "$admin" -c "revoke connect on database $scratch from public" >/dev/null
out="$(as_worker "$scratch" -c "select count(*) from jobs" 2>&1)" \
  || fail "the worker cannot connect to the restored database as itself where PUBLIC may not: $(printf '%s' "$out" | head -1)"
ok "the worker connects as itself and reads jobs, even where PUBLIC may not connect"

# The live database is one where the worker already has grants. regrant.sql
# replacing them there, from a list made on someone's machine, would be silent.
if psql -X -q -1 -v ON_ERROR_STOP=1 -f "$regrant" "$(at "$scratch")" >/dev/null 2>"$tmp/again.err"; then
  fail "regrant.sql replaced the grants of a database where the worker already had some, without -v again=yes"
fi
grep -q "already has grants" "$tmp/again.err" || { head -1 "$tmp/again.err"; fail "regrant.sql failed, but not for the reason it should"; }
diff <(printf '%s\n' "$want") <(acl "$(at "$scratch")") >/dev/null || fail "regrant.sql changed the grants while refusing"
ok "regrant.sql refuses a database where the worker already has grants, and changes nothing"

# A stray grant on a procedure, which revoke ... all functions misses.
psql -X -q -v ON_ERROR_STOP=1 "$(at "$scratch")" -c 'create procedure public.offload_sweep_stray() language sql as $$ select 1 $$' \
  -c "grant execute on procedure public.offload_sweep_stray() to offload_agent" >/dev/null
psql -X -q -1 -v ON_ERROR_STOP=1 -v again=yes -f "$regrant" "$(at "$scratch")" >"$tmp/again.out" 2>"$tmp/again.err" \
  || { head -1 "$tmp/again.err"; fail "regrant.sql failed on its second run, with -v again=yes"; }
grep -qF "$scratch" "$tmp/again.out" || fail "regrant.sql did not say which database it was changing"
if ! diff <(printf '%s\n' "$want") <(acl "$(at "$scratch")") >"$tmp/acl.diff"; then
  sed 's/^/  /' "$tmp/acl.diff"
  fail "a second run of regrant.sql did not end at the migrations' grants"
fi
ok "with -v again=yes it says which database, and runs again to the same grants, a stray procedure grant gone"

# An API role, as api-role.ts makes offload_api: it owns the application's
# objects. A role of the test's own stands in, so the cluster's is untouched.
psql -X -q -v ON_ERROR_STOP=1 "$admin" -c "create role $api_role nologin" >/dev/null
psql -X -q -1 -v ON_ERROR_STOP=1 -v again=yes -v api_role="$api_role" -f "$regrant" "$(at "$scratch")" >/dev/null 2>"$tmp/api.err" \
  || { head -1 "$tmp/api.err"; fail "regrant.sql failed with an API role in the cluster"; }
not_owned_by() {
  psql -X -q -A -t -v ON_ERROR_STOP=1 -v r="$2" "$(at "$1")" <<'SQL'
select count(*) from (
  select c.relowner as owner from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'S', 'v', 'm', 'p')
  union all
  select p.proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
) o where pg_get_userbyid(owner) <> :'r';
SQL
}
others="$(not_owned_by "$scratch" "$api_role")"
[ "$others" = 0 ] || fail "$others objects in the restored database are not the API role's"
out="$(psql -X -q -A -t -v ON_ERROR_STOP=1 "$(at "$scratch")" -c "set role $api_role" -c "select count(*) from jobs" 2>&1)" \
  || fail "the API role cannot read jobs in the restored database: $(printf '%s' "$out" | head -1)"
diff <(printf '%s\n' "$want") <(acl "$(at "$scratch")") >/dev/null || fail "handing the objects to the API role changed the worker's grants"
ok "with an API role in the cluster, it owns everything there and reads jobs, and the worker keeps its grants"

# A drill copy: nobody but the restorer can use it.
restore "$plain" no || { sed 's/^/  | /' "$tmp/$plain.log"; fail "restore.sh did not restore the fixture told --grants no"; }
if out="$(worker_reads "$plain" jobs)"; then fail "the worker's role reads jobs in a restore told --grants no"; fi
[ -z "$(acl "$(at "$plain")")" ] || fail "a restore told --grants no gave the worker something"
restorer="$(psql -X -q -A -t "$(at "$plain")" -c "select current_user")"
others="$(not_owned_by "$plain" "$restorer")"
[ "$others" = 0 ] || fail "a restore told --grants no handed $others objects to another role"
grep -qF "regrant.sql" "$tmp/$plain.log" || { sed 's/^/  | /' "$tmp/$plain.log"; fail "a restore told --grants no did not say how to give the grants later"; }
ok "told --grants no, a restore gives nobody anything, and says how to later"

echo "regrant passed."
