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
rm -rf "$out"
