"""Cut the principle set into the three fixed subsets the optimisation run uses.

    uv run python evals/subsets/make.py            # writes screen, holdout, train, block1 to block3
    uv run python evals/subsets/make.py --check    # says whether the files on disk match

Deterministic: every case is placed by a hash of its id, so two checkouts
cut the same subsets and a rerun after a case is added moves only that case.
Stratified by principle and surface, so a subset is the set in miniature.

- `screen`: about seventy cases, two to three per principle, the cheap read a
  candidate takes before anything else. Every worker runs this one.
- `holdout`: about a hundred and twenty cases, sealed. No worker runs it or
  reads its failures; the merge agent runs it once per merged candidate.
- `train`: everything else. Workers may run any of it, by principle, to
  read failures and tune.

- `block1`, `block2`, `block3`: the race set, about a hundred train cases
  cut like the screen, in three blocks a candidate buys one at a time: a
  worker's own stake buys block1, the lead's pool buys the next block for a
  candidate the paired gate kept. Disjoint from the screen and the holdout,
  so the composite's screen stays a read nobody tuned against. The cases
  `flaky.json` lists are left out: a case at fifty percent adds a coin toss
  to every run that includes it and measures nothing (2026-10-13).

Cast cases are left out of all of them: they need a database with the cast in
it, which a worktree does not have.
"""

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRINCIPLES = HERE.parent / "principles"

SCREEN_PER_PRINCIPLE = 2
SCREEN_PER_LARGE_PRINCIPLE = 3
HOLDOUT_PER_PRINCIPLE = 4
HOLDOUT_PER_LARGE_PRINCIPLE = 6
LARGE = 30
RACE_PER_PRINCIPLE = 4
RACE_PER_LARGE_PRINCIPLE = 6
#: block1 and block2 hold this many; block3 the rest of the race set.
BLOCK = 30
FLAKY = HERE / "flaky.json"


def _place(case_id: str) -> float:
    """A stable number in [0, 1) per case id."""
    digest = hashlib.sha256(case_id.encode()).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _cases() -> list[dict]:
    out = []
    for path in sorted(PRINCIPLES.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for case in data["cases"]:
            if case["surface"].startswith("cast"):
                continue
            if case.get("label_pending") or case.get("live"):
                continue
            out.append({"id": case["id"], "principle": path.stem, "surface": case["surface"]})
    return out


def _spread(cases: list[dict], per: int) -> list[dict]:
    """`per` cases from a principle, the first by hash from each surface in
    turn so a principle with two surfaces gives both, then by hash."""
    by_surface: dict[str, list[dict]] = defaultdict(list)
    for c in sorted(cases, key=lambda c: _place(c["id"])):
        by_surface[c["surface"]].append(c)
    picked: list[dict] = []
    surfaces = sorted(by_surface)
    # Every surface a principle has is in the subset at least once, so a
    # principle with file, answer and memory cases shows all three.
    per = max(per, len(surfaces))
    while len(picked) < per and any(by_surface.values()):
        for s in surfaces:
            if by_surface[s] and len(picked) < per:
                picked.append(by_surface[s].pop(0))
    return picked


def _flaky() -> set[str]:
    if not FLAKY.is_file():
        return set()
    return set(json.loads(FLAKY.read_text(encoding="utf-8"))["cases"])


def cut() -> dict[str, list[str]]:
    by_principle: dict[str, list[dict]] = defaultdict(list)
    for c in _cases():
        by_principle[c["principle"]].append(c)
    flaky = _flaky()
    screen, holdout, train = [], [], []
    race: list[tuple[str, list[str]]] = []
    for _principle, cases in sorted(by_principle.items()):
        large = len(cases) >= LARGE
        s = _spread(cases, SCREEN_PER_LARGE_PRINCIPLE if large else SCREEN_PER_PRINCIPLE)
        rest = [c for c in cases if c not in s]
        h = _spread(rest, HOLDOUT_PER_LARGE_PRINCIPLE if large else HOLDOUT_PER_PRINCIPLE)
        t = [c for c in rest if c not in h]
        steady = [c for c in t if c["id"] not in flaky]
        r = _spread(steady, RACE_PER_LARGE_PRINCIPLE if large else RACE_PER_PRINCIPLE)
        screen += [c["id"] for c in s]
        holdout += [c["id"] for c in h]
        train += [c["id"] for c in t]
        race.append((_principle, [c["id"] for c in r]))
    # A principle's race cases go to the three blocks in turn, starting one
    # block later for each principle, so every block holds every principle
    # that has three; block1 and block2 are then cut to size, the overflow
    # going to block3.
    blocks: dict[int, list[str]] = {1: [], 2: [], 3: []}
    for offset, (_principle, ids) in enumerate(race):
        for k, case_id in enumerate(ids):
            blocks[(offset + k) % 3 + 1].append(case_id)
    for b in (1, 2):
        blocks[3] += blocks[b][BLOCK:]
        blocks[b] = blocks[b][:BLOCK]
    return {
        "screen": sorted(screen),
        "holdout": sorted(holdout),
        "train": sorted(train),
        "block1": sorted(blocks[1]),
        "block2": sorted(blocks[2]),
        "block3": sorted(blocks[3]),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv[1:])
    subsets = cut()
    note = {
        "screen": "the cheap read every candidate takes first; about two cases per principle",
        "holdout": "sealed: run once per merged candidate by the merge agent, never by a worker",
        "train": "everything else; run by principle to read failures and tune",
        "block1": "the race's first block: a worker's own stake buys it; the flaky cases left out",
        "block2": "the race's second block: the lead's pool buys it for a candidate the gate kept",
        "block3": "the race's third block: the lead's pool, for a candidate block2 kept",
    }
    stale = []
    for name, ids in subsets.items():
        path = HERE / f"{name}.json"
        body = json.dumps({"note": note[name], "count": len(ids), "cases": ids}, indent=2) + "\n"
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != body:
                stale.append(name)
        else:
            path.write_text(body, encoding="utf-8")
        print(f"{name:8}{len(ids):5} cases")
    if args.check and stale:
        print(f"stale: {', '.join(stale)}; run make.py")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
