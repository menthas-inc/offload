"""Cut the principle set into the three fixed subsets the optimisation run uses.

    uv run python evals/subsets/make.py            # writes screen.json, holdout.json, train.json
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

Cast cases are left out of all three: they need a database with the cast in
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


def cut() -> dict[str, list[str]]:
    by_principle: dict[str, list[dict]] = defaultdict(list)
    for c in _cases():
        by_principle[c["principle"]].append(c)
    screen, holdout, train = [], [], []
    for _principle, cases in sorted(by_principle.items()):
        large = len(cases) >= LARGE
        s = _spread(cases, SCREEN_PER_LARGE_PRINCIPLE if large else SCREEN_PER_PRINCIPLE)
        rest = [c for c in cases if c not in s]
        h = _spread(rest, HOLDOUT_PER_LARGE_PRINCIPLE if large else HOLDOUT_PER_PRINCIPLE)
        t = [c for c in rest if c not in h]
        screen += [c["id"] for c in s]
        holdout += [c["id"] for c in h]
        train += [c["id"] for c in t]
    return {"screen": sorted(screen), "holdout": sorted(holdout), "train": sorted(train)}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv[1:])
    subsets = cut()
    note = {
        "screen": "the cheap read every candidate takes first; about two cases per principle",
        "holdout": "sealed: run once per merged candidate by the merge agent, never by a worker",
        "train": "everything else; run by principle to read failures and tune",
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
