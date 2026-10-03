#!/bin/sh
# Runs the real container against the local Docker Postgres with a directory
# standing in for R2, then opens the result with a throwaway key. Proves the
# toolchain, the pipe and the round trip; the only thing it cannot prove is R2.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
# The database to dump. The shared local one by default; a feature session
# on its own database names it here.
db="${CHECK_DATABASE:-offload}"
docker build -q -t offload-backup-check "$here" >/dev/null
docker run --rm -v "$out:/out" -e CHECK_DATABASE="$db" offload-backup-check sh -c '
  apk add -q postgresql18-client >/dev/null 2>&1 || true
  age-keygen -o /out/check.key 2>/dev/null
  export BACKUP_RECIPIENT="$(age-keygen -y /out/check.key)"
  export DATABASE_URL="postgres://offload:offload@host.docker.internal:4710/$CHECK_DATABASE"
  export R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET=out
  export RCLONE_CONFIG_R2_TYPE=local RCLONE_CONFIG_R2_PROVIDER= RCLONE_CONFIG_R2_ENDPOINT=
  export BACKUP_PREFIX=backups
  psql "$DATABASE_URL" -q -c "delete from backup_runs"
  /backup.sh
  f="$(ls /out/backups/*.dump.age | head -1)"
  age --decrypt -i /out/check.key < "$f" | pg_restore --list | head -3
  # 034. A run that shipped is written down, with its size, for Health.
  recorded="$(psql "$DATABASE_URL" -At -c "select count(*) from backup_runs where ok and bytes > 0 and finished_at > now() - make_interval(mins => 5)")"
  if [ "$recorded" != "1" ]; then
    echo "a shipped backup was not recorded: $recorded rows"; exit 1
  fi
  echo "a shipped backup is recorded with its size"
'
# 034. A run that fails is written down too, where there is a database to
# write to: the dump works and the shipping does not.
docker run --rm -v "$out:/out" -e CHECK_DATABASE="$db" offload-backup-check sh -c '
  export BACKUP_RECIPIENT="$(age-keygen -y /out/check.key)"
  export DATABASE_URL="postgres://offload:offload@host.docker.internal:4710/$CHECK_DATABASE"
  export R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET=out
  export RCLONE_CONFIG_R2_TYPE=no-such-backend RCLONE_CONFIG_R2_PROVIDER= RCLONE_CONFIG_R2_ENDPOINT=
  export BACKUP_PREFIX=unshipped
  if /backup.sh >/out/unshipped.log 2>&1; then
    echo "backup.sh exited 0 although nothing shipped"; exit 1
  fi
  recorded="$(psql "$DATABASE_URL" -At -c "select count(*) from backup_runs where not ok and finished_at > now() - make_interval(mins => 5)")"
  if [ "$recorded" != "1" ]; then
    echo "a failed backup was not recorded: $recorded rows"; exit 1
  fi
  echo "a failed backup is recorded as failed"
'
# A dump that dies must not ship. Without pipefail the pipe's status was
# rclone's, so a pg_dump that failed at once sealed an empty stream, shipped
# it and logged "backup shipped" (found 2026-09-25 by the restore drill's
# review: a cut-short dump passes a plain pg_restore --list). Against a
# database that does not exist, the script has to exit non-zero and leave no
# object behind.
docker run --rm -v "$out:/out" offload-backup-check sh -c '
  export BACKUP_RECIPIENT="$(age-keygen -y /out/check.key)"
  export DATABASE_URL="postgres://offload:offload@host.docker.internal:4710/offload_does_not_exist"
  export R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET=out
  export RCLONE_CONFIG_R2_TYPE=local RCLONE_CONFIG_R2_PROVIDER= RCLONE_CONFIG_R2_ENDPOINT=
  export BACKUP_PREFIX=failed
  if /backup.sh >/out/failed.log 2>&1; then
    echo "backup.sh exited 0 although pg_dump failed"; exit 1
  fi
  if ls /out/failed/*.dump.age >/dev/null 2>&1; then
    echo "a failed dump was shipped"; exit 1
  fi
  echo "a failed dump ships nothing and exits non-zero"
'
rm -rf "$out"
