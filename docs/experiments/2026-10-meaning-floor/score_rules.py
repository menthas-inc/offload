# Score the two rules on the cached distances: a fixed floor, and the floor
# with a margin behind the best match. Typed prefixes are scored apart, since
# the words arm is what finds them.
import json
from corpus import QUERIES
table = json.load(open("distances.json"))

def run(floor, margin=None):
    tp = fp = fn = hit = pos = empty = neg = junk = 0
    for q, rel, kind in QUERIES:
        if kind == "prefix":
            continue
        row = table[q]
        best = min(row.values())
        cut = floor if margin is None else min(floor, best + margin)
        kept = {i for i, d in row.items() if d <= cut}
        if kind == "negative":
            neg += 1; empty += not kept; junk += len(kept); fp += len(kept); continue
        pos += 1; hit += bool(kept & set(rel))
        tp += len(kept & set(rel)); fp += len(kept - set(rel)); fn += len(set(rel) - kept)
    p = tp / (tp + fp) if tp + fp else 1; r = tp / (tp + fn); f = 2 * p * r / (p + r) if p + r else 0
    return f"p {p:.2f} r {r:.2f} f1 {f:.2f} hit {hit}/{pos} neg-empty {empty}/{neg} junk {junk/neg:.1f}"

for floor in (0.52, 0.54, 0.55, 0.56, 0.58, 0.60):
    print(f"floor {floor:.2f}            ", run(floor))
    for margin in (0.10, 0.15, 0.20):
        print(f"floor {floor:.2f} margin {margin:.2f}", run(floor, margin))
