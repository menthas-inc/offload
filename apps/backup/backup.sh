#!/bin/sh
# Dump, seal, ship, and drop what is older than the window.
#
# Every input is an environment variable, none is printed, and the file that
# leaves this container is ciphertext: pg_dump's custom format, sealed with age
# to BACKUP_RECIPIENT. Nothing here can read it back; the private key is the
# owner's. The window is what the privacy page promises: a deleted thing is out
# of the backups within 30 days, so a backup lives 30 days and no longer.
set -eu
# The pipe's status has to be the first failure in it, not rclone's. Without
# this a pg_dump that died sealed whatever it had written, shipped it and
# logged "backup shipped": a cut-short dump that a plain listing would still
# call good. Found on 2026-09-25 by the restore drill's review.
set -o pipefail

: "${DATABASE_URL:?}"
: "${BACKUP_RECIPIENT:?}"
: "${R2_ACCOUNT_ID:?}"
: "${R2_ACCESS_KEY_ID:?}"
: "${R2_SECRET_ACCESS_KEY:?}"
: "${R2_BUCKET:?}"
PREFIX="${BACKUP_PREFIX:-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

# rclone reads its remote from the environment, so no config file carries a key.
export RCLONE_CONFIG_R2_TYPE="${RCLONE_CONFIG_R2_TYPE:-s3}"
export RCLONE_CONFIG_R2_PROVIDER="${RCLONE_CONFIG_R2_PROVIDER:-Cloudflare}"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="${RCLONE_CONFIG_R2_ENDPOINT:-https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com}"
export RCLONE_CONFIG_R2_ACL="private"
# The token can read and write objects in this one bucket and nothing else,
# so rclone must not go looking for the bucket: without this it asks whether
# the bucket exists, is refused, assumes it does not, and tries to create it,
# which the first run in production did. Found there, not locally, because the
# local check stands a directory in for R2.
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET="true"

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
TARGET="r2:${R2_BUCKET}/${PREFIX}/${STAMP}.dump.age"

# Streamed end to end: nothing plaintext touches a disk, here or there. A
# failure anywhere in the pipe removes what rclone had already written, so
# the bucket never holds a dump that is not whole.
if ! pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  | age --recipient "$BACKUP_RECIPIENT" \
  | rclone rcat "$TARGET"; then
  rclone deletefile "$TARGET" >/dev/null 2>&1 || true
  echo "{\"level\":\"error\",\"msg\":\"backup failed, nothing kept\",\"stamp\":\"${STAMP}\"}"
  exit 1
fi

# Sizes and counts only, never a name that could carry anything.
SIZE="$(rclone size "$TARGET" --json | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
echo "{\"level\":\"info\",\"msg\":\"backup shipped\",\"bytes\":${SIZE:-0},\"stamp\":\"${STAMP}\"}"

rclone delete "r2:${R2_BUCKET}/${PREFIX}" --min-age "${KEEP_DAYS}d"
echo "{\"level\":\"info\",\"msg\":\"backups older than the window dropped\",\"days\":${KEEP_DAYS}}"
