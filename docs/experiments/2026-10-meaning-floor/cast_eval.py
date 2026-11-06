# The final check: the floor on a large synthetic account per cast member.
#
# cast/<person>.json holds threads, rows, thread notes, memories and labelled
# queries, written per person from apps/agent/evals/cast. Each query is scored
# only against its own person's items, as a search only ever reads one account.
# Items are embedded exactly as embed_jobs.py sends them:
#   a row     "Thread / Title\n\nTitle" plus "\n\nbody" when there is one
#   a note    "Thread\n\ntext"
#   a memory  the text alone
# Distances are cached in cast-distances.json.
#
#   uv run --no-project --with httpx --with python-dotenv python cast_eval.py

import json
import subprocess
from pathlib import Path

from dotenv import dotenv_values

from calibrate import HERE, embed

CACHE = HERE / "cast-distances.json"
FLOORS = [f / 100 for f in range(48, 67, 2)] + [0.55, 0.57]


def people() -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text()) for p in sorted((HERE / "cast").glob("*.json"))}


def items(person: dict) -> dict[str, str]:
    names = {t["key"]: t["name"] for t in person["threads"]}
    out = {}
    for r in person["rows"]:
        thread = names.get(r["thread"], "")
        out[r["id"]] = f"{thread} / {r['title']}\n\n{r['title']}" + (f"\n\n{r['body']}" if r.get("body") else "")
    for n in person["notes"]:
        out[n["id"]] = f"{names.get(n['thread'], '')}\n\n{n['text']}"
    for m in person["memories"]:
        out[m["id"]] = m["text"]
    return out


def distances() -> dict[str, dict[str, dict[str, float]]]:
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=HERE, capture_output=True, text=True, check=True)
    key = dotenv_values(Path(common.stdout.strip()).parent / ".env").get("VOYAGE_API_KEY")
    table = {}
    for name, person in people().items():
        texts = items(person)
        ids = list(texts)
        docs = embed(key, [texts[i] for i in ids], "document")
        queries = embed(key, [q["q"] for q in person["queries"]], "query")
        table[name] = {q["q"]: {i: 1 - sum(a * b for a, b in zip(v, d)) for i, d in zip(ids, docs)} for q, v in zip(person["queries"], queries)}
    CACHE.write_text(json.dumps(table))
    return table


def score(table, floor):
    s = {"pos": 0, "hit": 0, "tp": 0, "fp": 0, "fn": 0, "neg": 0, "empty": 0, "junk": 0, "shown": 0, "kinds": {}}
    for name, person in people().items():
        for q in person["queries"]:
            row = table[name][q["q"]]
            kept = {i for i, d in row.items() if d <= floor}
            rel = set(q["relevant"])
            if not rel:
                # The generators named negatives three ways; web, adjacent or nonsense is what matters.
                sort = next((w for w in ("web", "adjacent", "nonsense") if w in q["kind"]), "nonsense" if q["kind"] == "nonsense" else "other")
                k = s["kinds"].setdefault(f"neg-{sort}", [0, 0])
                k[0] += 1
                k[1] += not kept
                s["neg"] += 1
                s["empty"] += not kept
                s["junk"] += len(kept)
                continue
            k = s["kinds"].setdefault(q["kind"], [0, 0])
            k[0] += 1
            k[1] += bool(kept & rel)
            s["pos"] += 1
            s["hit"] += bool(kept & rel)
            s["shown"] += len(kept)
            s["tp"] += len(kept & rel)
            s["fp"] += len(kept - rel)
            s["fn"] += len(rel - kept)
    return s


def main() -> None:
    table = distances()
    total = sum(len(items(p)) for p in people().values())
    print(f"{len(people())} people, {total} items, {sum(len(p['queries']) for p in people().values())} queries\n")
    print("floor  hit (any right item)  recall  precision  shown/positive  negatives empty  junk/negative  by kind")
    for floor in sorted(FLOORS):
        s = score(table, floor)
        kinds = "  ".join(f"{k} {h}/{n}" for k, (n, h) in sorted(s["kinds"].items()))
        print(
            f"{floor:.2f}   {s['hit']}/{s['pos']} {s['hit'] / s['pos']:.0%}            {s['tp'] / (s['tp'] + s['fn']):.2f}    "
            f"{s['tp'] / max(1, s['tp'] + s['fp']):.2f}       {s['shown'] / s['pos']:.1f}            {s['empty']}/{s['neg']}           {s['junk'] / s['neg']:.1f}           {kinds}"
        )


if __name__ == "__main__":
    main()
