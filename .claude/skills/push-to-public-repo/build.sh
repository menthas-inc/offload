#!/usr/bin/env bash
# Rebuild the public copy of offload from the private repo's main on GitHub.
#   build.sh       rebuild into $OUT and fetch the public remote's main
# Prints the range to review and whether it fast-forwards the public main.
# Personal rules live outside every repo, in $CONFIG:
#   mailmap.txt   every address the owner ever committed as -> the noreply one
#   replace.txt   filter-repo --replace-text rules (real names, old secrets)
#   refuse.txt    grep -E patterns; any hit in the rebuilt history stops the build
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
CONFIG="${OFFLOAD_PUBLIC_CONFIG:-$HOME/dev/offload_public_sync}"
OUT="${OFFLOAD_PUBLIC_OUT:-$HOME/dev/offload_public}"
PRIVATE="git@github.com:menthas-inc/offload_app.git"
PUBLIC="git@github.com:menthas-inc/offload.git"
for f in mailmap.txt replace.txt refuse.txt; do
  [ -s "$CONFIG/$f" ] || { echo "missing $CONFIG/$f" >&2; exit 1; }
done

rm -rf "$OUT.new"
git clone -q --single-branch --branch main "$PRIVATE" "$OUT.new"
cd "$OUT.new"
git remote remove origin
git filter-repo --force --quiet \
  --mailmap "$CONFIG/mailmap.txt" \
  --replace-text "$CONFIG/replace.txt" \
  --replace-message "$CONFIG/replace.txt" \
  --file-info-callback "$(cat "$here/callback.py")"

# The callback did what it says: one dropped path gone, one stubbed doc a stub.
[ -z "$(git log --all --format= --name-only -- .claude/skills/offload-design/uploads/ | head -1)" ] \
  || { echo "refused: a dropped path is still in the history" >&2; exit 1; }
for f in docs/tech/going-public.md $(git ls-tree --name-only main docs/tech/ | grep "^docs/tech/security-review-"); do
  [ "$(git show "main:$f" | head -1)" = "# Kept private" ] || { echo "refused: $f is not a stub" >&2; exit 1; }
done

if git log -p --no-color --format='%an %ae %cn %ce%n%B' | grep -qiEf "$CONFIG/refuse.txt"; then
  echo "refused: a pattern from refuse.txt is still in the rebuilt history" >&2
  echo "find it: git -C $OUT.new log -p | grep -niEf $CONFIG/refuse.txt (it may print what it matches)" >&2
  exit 1
fi

cd "$HOME"
rm -rf "$OUT" && mv "$OUT.new" "$OUT"
git -C "$OUT" remote add public "$PUBLIC"
git -C "$OUT" fetch -q public main
base="$(git -C "$OUT" rev-parse public/main)"
head="$(git -C "$OUT" rev-parse main)"
echo "commits: $(git -C "$OUT" rev-list --count main)"
echo "public main: $base"
echo "rebuilt main: $head"
if [ "$base" = "$head" ]; then
  echo "status: up to date"
elif git -C "$OUT" merge-base --is-ancestor "$base" "$head"; then
  echo "status: fast-forward, $(git -C "$OUT" rev-list --count "$base..$head") new commits"
else
  echo "status: diverged (the rules changed, so history was rewritten)"
fi
