#!/usr/bin/env python3
"""The board the coding sessions share: messages, plans and holds.

  board.py as <name>                      name this session, when its directory does not (a feature run from main)
  board.py say <text>                     tell the other sessions something
  board.py plan <impl-spec path> [note]   say what you are building, so others plan around it
  board.py hold <name> <reason> [--for N] take a hold for N minutes (default 30); exit 1 if another session has it
  board.py release <name>                 give it back
  board.py status                         live holds, current plans, recent messages
  board.py inbox                          what other sessions posted since you last looked

State lives in the git common directory, which every worktree of this repo
shares and git never tracks. The hook (.claude/hooks/board-inbox.sh) runs
`board.py hook`, so what others post arrives without anyone polling.

Holds are advisory: nothing stops a command, a session is expected to take the
hold before the overlapping action and wait when it is refused. They expire, so
a session that died cannot block the rest.
"""
import json
import os
import re
import subprocess
import sys
import time

DEFAULT_HOLD_MINUTES = 30
PLAN_DAYS = 7
RECENT_HOURS = 24


def git(*args):
    try:
        return subprocess.run(["git", *args], capture_output=True, text=True).stdout.strip()
    except OSError:
        return ""


def board_dir():
    path = os.environ.get("BOARD_DIR")
    if not path:
        common = git("rev-parse", "--path-format=absolute", "--git-common-dir")
        if not common:
            sys.exit("board: not in a git repository")
        path = os.path.join(common, "agent-board")
    os.makedirs(os.path.join(path, "holds"), exist_ok=True)
    os.makedirs(os.path.join(path, "cursors"), exist_ok=True)
    os.makedirs(os.path.join(path, "names"), exist_ok=True)
    return path


def who():
    """The worktree's name: main for the main checkout, the slug for a sibling."""
    label = os.environ.get("BOARD_AS")
    if label:
        return label
    try:
        with open(name_path(board_dir())) as f:
            return f.read().strip()
    except OSError:
        pass
    top = os.path.basename(git("rev-parse", "--show-toplevel"))
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir")
    main = os.path.basename(os.path.dirname(common))
    if top == main or not top:
        return "main"
    return top[len(main) + 1:] if top.startswith(main + "-") else top


def session():
    return os.environ.get("CLAUDE_CODE_SESSION_ID") or "manual"


def name_path(root):
    return os.path.join(root, "names", re.sub(r"[^A-Za-z0-9._-]", "-", session()))


def clock(t):
    return time.strftime("%H:%M", time.localtime(t))


def append(root, entry):
    entry = {"t": time.time(), "sid": session(), "who": who(), **entry}
    # One short line per write with O_APPEND, so two sessions cannot interleave.
    with open(os.path.join(root, "log.jsonl"), "a") as f:
        f.write(json.dumps(entry) + "\n")


def read_log(root, offset=0):
    path = os.path.join(root, "log.jsonl")
    if not os.path.exists(path):
        return [], 0
    with open(path) as f:
        f.seek(offset)
        lines = f.readlines()
        end = f.tell()
    entries = []
    for line in lines:
        try:
            entries.append(json.loads(line))
        except ValueError:
            pass
    return entries, end


def line(e):
    head = f"[{clock(e['t'])} {e['who']}]"
    kind = e.get("kind")
    if kind == "hold":
        return f"{head} holds {e['name']} until {clock(e['until'])}: {e['text']}"
    if kind == "release":
        return f"{head} released {e['name']}"
    if kind == "plan":
        note = f" ({e['text']})" if e.get("text") else ""
        return f"{head} is building {e['path']}{note}"
    return f"{head} {e.get('text', '')}"


def hold_path(root, name):
    return os.path.join(root, "holds", re.sub(r"[^A-Za-z0-9._-]", "-", name) + ".json")


def read_hold(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def live_holds(root):
    out = []
    folder = os.path.join(root, "holds")
    for name in sorted(os.listdir(folder)):
        h = read_hold(os.path.join(folder, name))
        if h and h["until"] > time.time():
            out.append(h)
    return out


def snapshot(root, skip_sid=None):
    """What is live now: holds, the latest plan per worktree, the day's messages."""
    entries, _ = read_log(root)
    now = time.time()
    lines = []
    for h in live_holds(root):
        if h["sid"] != skip_sid:
            lines.append(line({"kind": "hold", **h}))
    plans = {}
    for e in entries:
        if e.get("kind") == "plan" and e["t"] > now - PLAN_DAYS * 86400:
            plans[e["who"]] = e
    for e in plans.values():
        if e["sid"] != skip_sid:
            lines.append(line(e))
    says = [e for e in entries
            if e.get("kind") == "say" and e["t"] > now - RECENT_HOURS * 3600 and e["sid"] != skip_sid]
    lines.extend(line(e) for e in says[-10:])
    return lines


def inbox(root, sid):
    """What others posted since this session last looked. The first look gets the snapshot."""
    cursor = os.path.join(root, "cursors", re.sub(r"[^A-Za-z0-9._-]", "-", sid))
    try:
        with open(cursor) as f:
            offset = int(f.read().strip())
    except (OSError, ValueError):
        offset = None
    if offset is None:
        lines = snapshot(root, skip_sid=sid)
        _, end = read_log(root)
    else:
        entries, end = read_log(root, offset)
        lines = [line(e) for e in entries if e.get("sid") != sid]
    with open(cursor, "w") as f:
        f.write(str(end))
    return lines


def cmd_hold(root, args):
    minutes = DEFAULT_HOLD_MINUTES
    if "--for" in args:
        i = args.index("--for")
        minutes = float(args[i + 1])
        args = args[:i] + args[i + 2:]
    if len(args) < 2:
        sys.exit("usage: board.py hold <name> <reason> [--for minutes]")
    name, reason = args[0], " ".join(args[1:])
    path = hold_path(root, name)
    mine = {"sid": session(), "who": who(), "name": name, "text": reason,
            "t": time.time(), "until": time.time() + minutes * 60}
    try:
        # O_EXCL is the mutual exclusion: of two sessions asking at once, one creates the file.
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    except FileExistsError:
        theirs = read_hold(path)
        if theirs and theirs["until"] > time.time() and theirs["sid"] != session():
            print(f"{name} is held by {theirs['who']} until {clock(theirs['until'])}: {theirs['text']}")
            print("Wait and ask again, or do something that does not need it.")
            return 1
        tmp = f"{path}.{os.getpid()}"
        with open(tmp, "w") as f:
            json.dump(mine, f)
        os.replace(tmp, path)
    else:
        with os.fdopen(fd, "w") as f:
            json.dump(mine, f)
    append(root, {"kind": "hold", "name": name, "text": reason, "until": mine["until"]})
    print(f"holding {name} until {clock(mine['until'])}. Release it when done: board.py release {name}")
    return 0


def cmd_release(root, args):
    if len(args) != 1:
        sys.exit("usage: board.py release <name>")
    path = hold_path(root, args[0])
    theirs = read_hold(path)
    if not theirs:
        print(f"{args[0]} is not held")
        return 0
    if theirs["sid"] != session() and theirs["until"] > time.time():
        print(f"{args[0]} is held by {theirs['who']}, not by this session")
        return 1
    os.unlink(path)
    append(root, {"kind": "release", "name": args[0]})
    print(f"released {args[0]}")
    return 0


def cmd_hook(root):
    """Hook entry: read the payload, hand anything new to the session as context."""
    try:
        payload = json.load(sys.stdin)
        lines = inbox(root, payload["session_id"])
    except Exception:
        return 0
    if lines:
        text = ("From the other coding sessions (.claude/scripts/board.py, see CLAUDE.md):\n"
                + "\n".join(lines))
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": payload.get("hook_event_name", "PreToolUse"),
            "additionalContext": text}}))
    return 0


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "status"
    if cmd == "hook":
        try:
            return cmd_hook(board_dir())
        except BaseException:
            return 0
    root = board_dir()
    if cmd == "as" and len(args) == 2:
        with open(name_path(root), "w") as f:
            f.write(args[1])
        print(f"this session posts as {args[1]}")
        return 0
    if cmd == "say" and len(args) > 1:
        append(root, {"kind": "say", "text": " ".join(args[1:])})
        return 0
    if cmd == "plan" and len(args) > 1:
        append(root, {"kind": "plan", "path": os.path.abspath(args[1]), "text": " ".join(args[2:])})
        return 0
    if cmd == "hold":
        return cmd_hold(root, args[1:])
    if cmd == "release":
        return cmd_release(root, args[1:])
    if cmd == "inbox":
        print("\n".join(inbox(root, session())))
        return 0
    if cmd == "status":
        print("\n".join(snapshot(root)) or "nothing live")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
