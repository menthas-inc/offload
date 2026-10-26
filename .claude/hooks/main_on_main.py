#!/usr/bin/env python3
"""PreToolUse(Bash) hook: the main checkout stays on main.

Every session starts in the main checkout and more than one can be working there
at once. On 2026-10-26 two sessions each made a branch in it, and one `git switch`
carried the other's uncommitted work onto a different branch. Branches live in
worktrees (.claude/scripts/new-worktree.sh); in the main checkout, `git switch`,
`git checkout` of a branch or commit, and `gh pr checkout` are refused unless the
target is main. Tested by .claude/scripts/test_main_on_main.py.
"""
import json
import os
import shlex
import subprocess
import sys

SEPARATORS = {";", "&&", "||", "|", "&", "(", ")"}
LEAVES = {"-c", "-C", "--create", "--force-create", "-b", "-B", "--orphan", "-d", "--detach"}


def git(cwd, *args):
    r = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def is_main_checkout(cwd):
    own = git(cwd, "rev-parse", "--path-format=absolute", "--git-dir")
    return own is not None and own == git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir")


def segments(cmd):
    # shortcut: a heredoc body is read as commands, so a script that only writes
    # `git switch x` into a file is refused too; write it with the Write tool.
    lex = shlex.shlex(cmd.replace("\n", " ; "), posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    seg = []
    for tok in lex:
        if tok in SEPARATORS:
            if seg:
                yield seg
            seg = []
        else:
            seg.append(tok)
    if seg:
        yield seg


def leaves_main(cwd, sub, args):
    """True when `git <sub> <args>` would put the checkout on something other than main."""
    if sub == "switch" or (sub == "checkout" and "--" not in args):
        if LEAVES & set(args):
            return True
        target = next((a for a in args if not a.startswith("-") or a == "-"), None)
        if target in (None, "main"):
            return False
        return sub == "switch" or target == "-" or git(cwd, "rev-parse", "--verify", "-q", target + "^{commit}") is not None
    return False


def verdict(cmd, cwd):
    """A refusal message, or None when the command keeps the main checkout on main."""
    try:
        parts = list(segments(cmd))
    except ValueError:
        return None
    for seg in parts:
        while seg and "=" in seg[0] and not seg[0].startswith("-"):
            seg = seg[1:]  # FOO=1 git ...
        if not seg:
            continue
        if seg[0] == "cd" and len(seg) > 1:
            cwd = os.path.join(cwd, os.path.expanduser(seg[1]))
            continue
        here, leaving = cwd, False
        if seg[:3] == ["gh", "pr", "checkout"]:
            leaving = True
        elif seg[0] == "git":
            rest = seg[1:]
            while rest and rest[0].startswith("-"):
                opt = rest.pop(0)
                if opt in ("-C", "-c") and rest:
                    value = rest.pop(0)
                    if opt == "-C":
                        here = os.path.join(here, os.path.expanduser(value))
            if rest:
                leaving = leaves_main(here, rest[0], rest[1:])
        if leaving and is_main_checkout(here):
            return ("BLOCKED: the main checkout stays on main, because other sessions work in it too. "
                    "Make a worktree for a branch: .claude/scripts/new-worktree.sh <slug>, "
                    "or git worktree add ../offload_app-<slug> -b <branch>, and work there.")
    return None


def main():
    try:
        payload = json.load(sys.stdin)
        cmd = payload["tool_input"]["command"]
    except Exception:
        return 0
    msg = verdict(cmd, payload.get("cwd") or os.getcwd())
    if msg:
        print(msg, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
