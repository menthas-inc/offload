#!/bin/sh
# Runs the real container against the local Docker Postgres with a directory
# standing in for R2, then opens the result with a throwaway key. Proves the
# toolchain, the pipe and the round trip; the only thing it cannot prove is R2.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
docker build -q -t offload-backup-check "$here" >/dev/null
docker run --rm -v "$out:/out" offload-backup-check sh -c '
  apk add -q postgresql18-client >/dev/null 2>&1 || true
  age-keygen -o /out/check.key 2>/dev/null
  export BACKUP_RECIPIENT="$(age-keygen -y /out/check.key)"
  export DATABASE_URL="postgres://offload:offload@host.docker.internal:4710/offload"
  export R2_ACCOUNT_ID=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET=out
  export RCLONE_CONFIG_R2_TYPE=local RCLONE_CONFIG_R2_PROVIDER= RCLONE_CONFIG_R2_ENDPOINT=
  export BACKUP_PREFIX=backups
  /backup.sh
  f="$(ls /out/backups/*.dump.age | head -1)"
  age --decrypt -i /out/check.key < "$f" | pg_restore --list | head -3
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
