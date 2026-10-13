"""Group the near duplicates in an ideation pool before the lead reads it.

    python3 .claude/scripts/swarm-dedup.py <ideation result json>... [--threshold 0.8] [--json]

Each lens proposes hypotheses blind to the others, so the same change arrives
three times in three vocabularies. TF-IDF over the title and the change text,
cosine, and a union of every pair at or above the threshold. Prints the
groups and the distinct count; the lead picks from the groups, with every
proposal's reasoning kept. No embedding API, no model.
"""

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

WORD = re.compile(r"[a-z0-9_.]+")
STOP = frozenset(
    [
        "a",
        "an",
        "the",
        "and",
        "or",
        "of",
        "to",
        "in",
        "on",
        "for",
        "with",
        "by",
        "at",
        "from",
        "is",
        "are",
        "be",
        "as",
        "it",
        "its",
        "this",
        "that",
        "so",
        "not",
        "no",
        "into",
        "than",
        "then",
        "when",
        "which",
        "what",
        "where",
        "each",
        "per",
        "one",
        "two",
        "every",
        "all",
        "any",
    ]
)


def tokens(text: str) -> list[str]:
    return [w for w in WORD.findall(text.lower()) if w not in STOP and len(w) > 1]


def tfidf(docs: list[str]) -> list[dict[str, float]]:
    bags = [Counter(tokens(d)) for d in docs]
    df: Counter = Counter()
    for b in bags:
        df.update(b.keys())
    n = len(docs)
    out = []
    for b in bags:
        total = sum(b.values()) or 1
        out.append({w: (c / total) * math.log((1 + n) / (1 + df[w])) + 1e-9 for w, c in b.items()})
    return out


def cosine(a: dict[str, float], b: dict[str, float]) -> float:
    dot = sum(v * b[w] for w, v in a.items() if w in b)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def groups(items: list[dict], threshold: float = 0.8) -> list[list[int]]:
    """Indexes into `items`, grouped: every pair at or above the threshold
    shares a group (union find), so a chain of near duplicates is one group."""
    docs = [f"{h.get('title', '')} {h.get('change', '')}" for h in items]
    vectors = tfidf(docs)
    parent = list(range(len(items)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if cosine(vectors[i], vectors[j]) >= threshold:
                parent[find(i)] = find(j)
    by_root: dict[int, list[int]] = {}
    for i in range(len(items)):
        by_root.setdefault(find(i), []).append(i)
    return sorted(by_root.values(), key=lambda g: (-len(g), g[0]))


def _pool(paths: list[Path]) -> list[dict]:
    pool = []
    for path in paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        lenses = data if isinstance(data, list) else [data]
        for lens in lenses:
            if "hypotheses" in lens:
                for h in lens["hypotheses"]:
                    pool.append({**h, "lens": lens.get("lens", "")})
            elif "title" in lens:
                pool.append(lens)
    return pool


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    threshold = float(argv[argv.index("--threshold") + 1]) if "--threshold" in argv else 0.8
    pool = _pool([Path(a) for a in args if a != str(threshold)])
    gs = groups(pool, threshold)
    if "--json" in argv:
        print(
            json.dumps(
                {
                    "proposed": len(pool),
                    "distinct": len(gs),
                    "groups": [
                        [
                            {"lens": pool[i].get("lens", ""), "title": pool[i].get("title", "")}
                            for i in g
                        ]
                        for g in gs
                    ],
                },
                indent=2,
            )
        )
        return 0
    print(f"{len(pool)} proposed, {len(gs)} distinct at cosine >= {threshold}")
    for g in gs:
        if len(g) > 1:
            print()
            for i in g:
                print(f"  [{pool[i].get('lens', '')}] {pool[i].get('title', '')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
