#!/usr/bin/env bash
# PreToolUse hook for Bash. Blocks (exit 2) any command that would clobber a
# file holding credentials that exist nowhere else, and any command that would
# print a secret value into the transcript.
#
# The second rule is from 2026-09-24. Twice in two days a command meant to list
# variable NAMES printed a multi-line private key instead: a filtered dump of
# .env, then `railway variables --kv | cut -d= -f1`, where every continuation
# line of the key has no `=` to cut at. Both keys had to be rotated. Names come
# from .claude/scripts/env-names.sh and railway-var-names.sh, which parse and
# print keys only; a value is checked in-process and reported as a boolean or a
# length. Everything that can print a value is refused: reading a secret file
# with any tool but a size or a stat, printing the environment, listing
# Railway variables, docker inspect, token-printing CLIs.
#
# Why this exists: .env was overwritten with a truncating redirect during
# setup, taking a Google client secret, Apple key material and a Resend key
# with it. .env is gitignored, correctly, so there was nothing to restore from
# and no snapshot held a copy. "Read before you overwrite" is a good intention;
# this is the control.
#
# Two false positives were found while writing it, and both are handled,
# because a safety check that cries wolf is a safety check somebody turns off:
#
#   1. It matches the TARGET of an operation, not a filename appearing anywhere
#      in the command. Writing an unrelated file whose body mentions .env is fine.
#   2. Heredoc bodies are stripped before matching. A script being written out
#      may legitimately contain the text "cat > .env" as data.
#
#   blocked:  cat > .env      rm .env      mv x .env      cat > ~/.ssh/id_rsa
#   allowed:  cat >> .env     cat .env     cat > other.ts (whatever the body says)
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
payload="$(cat)"

command -v python3 >/dev/null 2>&1 || exit 0
cmd="$(printf '%s' "$payload" | python3 "$here/_extract.py" command 2>/dev/null)"
[ -n "$cmd" ] || exit 0

verdict="$(
  CMD="$cmd" HOOK_DIR="$here" python3 - <<'PY'
import os, re, sys

cmd = os.environ.get("CMD", "")

# Strip heredoc bodies. Everything between `<<DELIM` and a line that is just
# DELIM is data being written, not commands being run, so shell-looking text
# inside it must not trip the check.
def strip_heredocs(text: str) -> str:
    out, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        opener = re.search(r"<<-?\s*[\"']?([A-Za-z_][A-Za-z0-9_]*)[\"']?", line)
        if opener:
            delim = opener.group(1)
            i += 1
            while i < len(lines) and lines[i].strip() != delim:
                i += 1
        i += 1
    return "\n".join(out)

cmd = strip_heredocs(cmd)

PROTECTED = re.compile(r"(^|/)(\.env(\.[A-Za-z0-9_-]+)?|id_ed25519|id_rsa|id_ecdsa)$|\.p8$")

def protected(path: str) -> bool:
    path = path.strip().strip("\"'")
    if not path:
        return False
    # Committed templates hold placeholders, not secrets.
    if path.endswith((".env.example", ".env.sample")):
        return False
    return bool(PROTECTED.search(path))

# A single '>' (never '>>') whose target is a protected path.
for match in re.finditer(r"(?<!>)>(?!>)\s*([^\s;&|<>]+)", cmd):
    if protected(match.group(1)):
        print("clobber"); sys.exit(0)

# rm / mv / truncate / shred naming a protected path as an operand.
for segment in re.split(r"[;&|\n]+", cmd):
    words = segment.split()
    if not words:
        continue
    verb = os.path.basename(words[0])
    if verb in {"rm", "mv", "truncate", "shred"}:
        for word in words[1:]:
            if not word.startswith("-") and protected(word):
                print("remove"); sys.exit(0)

# ---- The print rule (2026-09-24). See the header.
sys.path.insert(0, os.environ.get("HOOK_DIR", "."))
from _secret_paths import is_secret

# Verbs that may name a secret file without printing it: size, presence,
# permissions, a copy into another checkout, or loading it into the shell.
QUIET_VERBS = {"ls", "stat", "test", "[", "file", "wc", "cp", "chmod", "chown", "touch", "du",
               "realpath", "dirname", "basename", "readlink", "mkdir", "ln", "find", "source", ".",
               "git", "open", "rm", "mv", "truncate", "shred"}

if "--kv" in cmd.split():
    print("print"); sys.exit(0)

for segment in re.split(r"[;&|\n]+", cmd):
    # A redirect target is written to, not read: `cat >> .env` appends and
    # stays allowed, as the clobber rule above already decided.
    segment = re.sub(r"\d?>>?\s*[^\s;&|]+", " ", segment)
    segment = re.sub(r"(?<!<)<(?!<)\s*[^\s;&|]+", " ", segment)
    words = [w.strip("\"'") for w in segment.split()]
    # Leading assignments are not the verb: FOO=1 cmd.
    while words and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]):
        words = words[1:]
    if not words:
        continue
    verb = os.path.basename(words[0])
    rest = words[1:]
    operands = [w for w in rest if not w.startswith("-")]
    if verb == "printenv":
        print("print"); sys.exit(0)
    if verb == "env":
        # Bare env prints everything; env with a command runs it.
        remaining = [w for w in rest if not w.startswith("-") and not re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", w)]
        if not remaining:
            print("print"); sys.exit(0)
    if verb == "export" and "-p" in rest:
        print("print"); sys.exit(0)
    if verb in {"declare", "typeset"} and any(w in {"-x", "-p"} for w in rest):
        print("print"); sys.exit(0)
    if verb == "set" and not rest:
        print("print"); sys.exit(0)
    if verb == "railway":
        if "variables" in rest and "--set" not in rest:
            print("print"); sys.exit(0)
        if any(w in {"run", "ssh"} for w in rest) and any(w in {"env", "printenv"} for w in rest):
            print("print"); sys.exit(0)
    if verb == "docker":
        if rest[:1] == ["inspect"]:
            print("print"); sys.exit(0)
        if "exec" in rest and any(w in {"env", "printenv"} for w in rest):
            print("print"); sys.exit(0)
    if verb == "gcloud":
        if any(w in {"print-access-token", "print-identity-token"} for w in rest):
            print("print"); sys.exit(0)
        if "secrets" in rest and "access" in rest:
            print("print"); sys.exit(0)
    if verb == "eas" and any(w.startswith(("env:", "secret:")) for w in rest):
        print("print"); sys.exit(0)
    if verb == "op" and ("read" in rest or ("item" in rest and "get" in rest)):
        print("print"); sys.exit(0)
    if verb == "security" and any(w.startswith("find-") for w in rest):
        print("print"); sys.exit(0)
    if verb not in QUIET_VERBS and any(is_secret(w) for w in operands):
        print("print"); sys.exit(0)

print("ok")
PY
)"

if [ "$verdict" = "print" ]; then
  echo "BLOCKED: this could print a secret value into the transcript." >&2
  echo "  Names only: .claude/scripts/env-names.sh [NAME] for .env, .claude/scripts/railway-var-names.sh <service> for Railway." >&2
  echo "  A value is checked in-process and reported as a boolean or a length, never printed, piped or cut." >&2
  exit 2
fi
if [ "$verdict" != "ok" ]; then
  echo "BLOCKED: this would overwrite or remove a file holding credentials that exist nowhere else." >&2
  echo "  .env and key files are gitignored, so there is no version to restore from." >&2
  echo "  Read it first, then append with >> or edit the one line that needs changing." >&2
  exit 2
fi
exit 0
