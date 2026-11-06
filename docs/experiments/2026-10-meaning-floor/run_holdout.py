# Embed the held-out queries against the same rows and score both floors.
import json, subprocess
from pathlib import Path
from dotenv import dotenv_values
from calibrate import embed, HERE
from corpus import DOCS
from holdout import HOLDOUT

common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=HERE, capture_output=True, text=True, check=True)
key = dotenv_values(Path(common.stdout.strip()).parent / ".env").get("VOYAGE_API_KEY")
ids = list(DOCS)
docs = embed(key, [f"{DOCS[i][0]} / {DOCS[i][1]}\n\n{DOCS[i][1]}" + (f"\n\n{DOCS[i][2]}" if DOCS[i][2] else "") for i in ids], "document")
qs = embed(key, [q for q, _, _ in HOLDOUT], "query")
table = {q: {i: 1 - sum(a * b for a, b in zip(v, d)) for i, d in zip(ids, docs)} for (q, _, _), v in zip(HOLDOUT, qs)}
(HERE / "holdout-distances.json").write_text(json.dumps(table, indent=1))
for q, rel, kind in HOLDOUT:
    row = table[q]
    near_rel = min((row[i] for i in rel), default=None)
    near = sorted(row.items(), key=lambda x: x[1])[:2]
    print(f"{kind:8} {q[:36]:36} rel {near_rel if near_rel is None else round(near_rel, 3)!s:6} nearest {[(i, round(d, 3)) for i, d in near]}")
for floor in (0.55, 0.56, 0.57, 0.58):
    tp = fp = fn = hit = pos = empty = neg = 0
    for q, rel, kind in HOLDOUT:
        kept = {i for i, d in table[q].items() if d <= floor}
        if kind == "negative":
            neg += 1; empty += not kept; fp += len(kept); continue
        pos += 1; hit += bool(kept & set(rel)); tp += len(kept & set(rel)); fp += len(kept - set(rel)); fn += len(set(rel) - kept)
    print(f"floor {floor}: precision {tp/(tp+fp):.2f} recall {tp/(tp+fn):.2f} hit {hit}/{pos} negatives empty {empty}/{neg}")
