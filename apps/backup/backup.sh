#!/bin/sh
# Dump, seal, ship, and drop what is older than the window.
#
# Every input is an environment variable, none is printed, and the file that
# leaves this container is ciphertext: pg_dump's custom format, sealed with age
# to BACKUP_RECIPIENT. Nothing here can read it back; the private key is the
# owner's. The window is what the privacy page promises: a deleted thing is out
# of the backups within 30 days, so a backup lives 30 days and no longer.
set -eu

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

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
TARGET="r2:${R2_BUCKET}/${PREFIX}/${STAMP}.dump.age"

# Streamed end to end: nothing plaintext touches a disk, here or there.
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  | age --recipient "$BACKUP_RECIPIENT" \
  | rclone rcat "$TARGET"

# Sizes and counts only, never a name that could carry anything.
SIZE="$(rclone size "$TARGET" --json | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
echo "{\"level\":\"info\",\"msg\":\"backup shipped\",\"bytes\":${SIZE:-0},\"stamp\":\"${STAMP}\"}"

rclone delete "r2:${R2_BUCKET}/${PREFIX}" --min-age "${KEEP_DAYS}d"
echo "{\"level\":\"info\",\"msg\":\"backups older than the window dropped\",\"days\":${KEEP_DAYS}}"
