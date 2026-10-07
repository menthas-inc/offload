#!/usr/bin/env python3
"""Says when the repo sweep (/sweep) is due, measured from the last one.

  sweep_due.py check [--json]   what has merged to main since the last sweep, and whether it is due
  sweep_due.py hook             SessionStart: on the main checkout, once a day, tell the session to flag it

The last sweep is docs/sweeps/last.json, written by the sweep's own PR, so every
checkout reads the same baseline. Volume is counted on main's first-parent history
from the commit that last wrote it (or from its `base`, which only the first ledger
needs), without lockfiles, the design system's sync or generated pages.
Lines in the paths where a defect costs most count again on their own.
"""
import json
import os
import re
import subprocess
import sys
from datetime import date

LEDGER = "docs/sweeps/last.json"

# Due when any one of these is crossed. Tuned on 2026-09-22 to 10-07, when main took
# about 9k lines and 5 merges a day: each one lands roughly a week after the last sweep.
LINES = 50000
RISKY = 6000
MERGES = 40
DAYS = 14  # and at least one merge since

NOISE = re.compile(r"""(
    (^|/)pnpm-lock\.yaml$ | (^|/)uv\.lock$ | \.snap$
  | ^\.claude/skills/offload-design/
  | ^docs/tech/.*\.html$ | ^docs/tech/vendor-terms/ | ^docs/sweeps/
  | ^apps/agent/evals/results/
)""", re.X)

RISKY_PATHS = re.compile(r"""(
    ^apps/core-api/migrations/
  | ^apps/core-api/src/(auth|crypto|accounts|admin|blobs|connectors|exports|routes)/
  | ^apps/core-api/src/(app|db|env|api-role|agent-role|schema)\.ts$
  | ^apps/agent/src/offload_agent/(prompts|harness)/
  | ^apps/agent/src/offload_agent/(reader|queue|worker|context)\.py$
  | ^apps/web/src/app/\(marketing\)/(privacy|terms)/
  | ^apps/web/(next\.config\.mjs|src/middleware\.ts)$
  | ^apps/backup/ | ^\.github/ | (^|/)railway\.(json|toml)$
  | ^\.claude/hooks/
)""", re.X)


def git(*args):
    out = subprocess.run(["git", *args], capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(out.stderr.strip())
    return out.stdout.strip()


def today():
    override = os.environ.get("SWEEP_TODAY")
    return date.fromisoformat(override) if override else date.today()


def target():
    """main when the repo has it, else whatever is checked out."""
    try:
        git("rev-parse", "--verify", "-q", "main")
        return "main"
    except RuntimeError:
        return "HEAD"


def ledger(ref):
    try:
        return json.loads(git("show", f"{ref}:{LEDGER}"))
    except (RuntimeError, ValueError):
        return None


def measure():
    ref = target()
    last = ledger(ref)
    if not last:
        return {"due": True, "why": "no sweep has run yet", "since": None, "base": None}
    base = last.get("base") or git("log", "-1", "--first-parent", "--format=%H", ref, "--", LEDGER)
    merges = len(git("rev-list", "--first-parent", "--merges", f"{base}..{ref}").split())
    lines = risky = migrations = 0
    # --no-renames on purpose: a rename then counts as a delete and an add, which can
    # overstate a mechanical move, but every row stays a plain path the patterns match.
    for row in git("diff", "--numstat", "--no-renames", f"{base}..{ref}").splitlines():
        added, deleted, path = row.split("\t", 2)
        if added == "-" or NOISE.search(path):
            continue
        n = int(added) + int(deleted)
        lines += n
        if RISKY_PATHS.search(path):
            risky += n
    for row in git("diff", "--name-status", "--no-renames", f"{base}..{ref}").splitlines():
        status, path = row.split("\t", 1)
        if status == "A" and path.startswith("apps/core-api/migrations/"):
            migrations += 1
    days = (today() - date.fromisoformat(last["date"])).days
    why = []
    if lines >= LINES:
        why.append(f"{lines} lines")
    if risky >= RISKY:
        why.append(f"{risky} risky lines")
    if merges >= MERGES:
        why.append(f"{merges} merges")
    if days >= DAYS and merges:
        why.append(f"{days} days")
    return {"due": bool(why), "why": ", ".join(why), "since": last["date"], "base": base,
            "merges": merges, "lines": lines, "risky": risky, "migrations": migrations, "days": days}


def line(m):
    if not m["since"]:
        return "Sweep due: " + m["why"] + "."
    head = "Sweep due" if m["due"] else "Sweep not due"
    return (f"{head}. Since {m['since']}: {m['merges']} merges, {m['lines']} lines, "
            f"{m['risky']} in risky paths, {m['migrations']} migrations, {m['days']} days."
            + (f" Crossed: {m['why']}." if m["due"] else ""))


def state_dir():
    path = os.environ.get("SWEEP_STATE_DIR")
    if not path:
        path = os.path.join(git("rev-parse", "--path-format=absolute", "--git-common-dir"), "sweep")
    os.makedirs(path, exist_ok=True)
    return path


def on_main_checkout():
    top = git("rev-parse", "--path-format=absolute", "--show-toplevel")
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir")
    return os.path.realpath(os.path.dirname(common)) == os.path.realpath(top)


def sweep_running():
    """A worktree made by `new-worktree.sh sweep-<date>` exists."""
    return any(re.match(r"branch refs/heads/(feat/)?sweep-", l)
               for l in git("worktree", "list", "--porcelain").splitlines())


def hook():
    sys.stdin.read()
    if not on_main_checkout() or sweep_running():
        return
    m = measure()
    if not m["due"]:
        return
    stamp = os.path.join(state_dir(), "nudged")
    day = today().isoformat()
    try:
        with open(stamp) as f:
            if f.read().strip() == day:
                return
    except OSError:
        pass
    with open(stamp, "w") as f:
        f.write(day)
    context = (line(m) + " In your first reply, tell the owner in one line that the repo sweep is due "
               "and why, and offer to start it in its own worktree: "
               f"`.claude/scripts/new-worktree.sh sweep-{day}`, then /sweep in a session there. "
               "Do not start it yourself, and do not mention it again this session.")
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart",
                                             "additionalContext": context}}))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "hook":
        try:
            hook()
        except Exception:
            pass  # a nudge is never worth a failed session start
        return
    if cmd == "check":
        try:
            m = measure()
        except RuntimeError as e:
            print(f"Sweep: cannot measure from the ledger's base ({e.args[0].splitlines()[0]}). "
                  f"Fix {LEDGER} by hand.")
            sys.exit(1)
        print(json.dumps(m) if "--json" in sys.argv else line(m))
        return
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
