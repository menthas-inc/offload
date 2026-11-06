# Measure voyage-4 cosine distances on the labelled set and score each floor.
#
# Run with the main checkout's agent venv (it has httpx and python-dotenv):
#   apps/agent/.venv/bin/python docs/experiments/2026-10-meaning-floor/calibrate.py
# The key is read in-process from the main checkout's env file and never
# printed. Writes distances.json beside this file, so the scoring can be rerun
# without calling Voyage again.

import json
import subprocess
import sys
from pathlib import Path

import httpx
from dotenv import dotenv_values

from corpus import DOCS, QUERIES

HERE = Path(__file__).parent
CACHE = HERE / "distances.json"


def embed(key: str, texts: list[str], input_type: str) -> list[list[float]]:
    out: list[list[float]] = []
    for start in range(0, len(texts), 64):
        response = httpx.post(
            "https://api.voyageai.com/v1/embeddings",
            headers={"authorization": f"Bearer {key}"},
            json={"input": texts[start : start + 64], "model": "voyage-4", "input_type": input_type, "output_dimension": 1024},
            timeout=60,
        )
        response.raise_for_status()
        out += [d["embedding"] for d in sorted(response.json()["data"], key=lambda d: d["index"])]
    return out


def distances() -> dict[str, dict[str, float]]:
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    # The env file lives in the main checkout, beside the shared git directory.
    common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=HERE, capture_output=True, text=True, check=True)
    key = dotenv_values(Path(common.stdout.strip()).parent / ".env").get("VOYAGE_API_KEY")
    if not key:
        sys.exit("no VOYAGE_API_KEY in that file")
    ids = list(DOCS)
    # What embed_jobs.py sends: "Thread / Title", then the title and body again.
    texts = [f"{DOCS[i][0]} / {DOCS[i][1]}\n\n{DOCS[i][1]}" + (f"\n\n{DOCS[i][2]}" if DOCS[i][2] else "") for i in ids]
    docs = embed(key, texts, "document")
    queries = embed(key, [q for q, _, _ in QUERIES], "query")
    table = {q: {i: 1 - sum(a * b for a, b in zip(v, d)) for i, d in zip(ids, docs)} for (q, _, _), v in zip(QUERIES, queries)}
    CACHE.write_text(json.dumps(table, indent=1))
    return table


def main() -> None:
    table = distances()
    print("per query: nearest relevant, nearest irrelevant (cosine distance)")
    for q, relevant, kind in QUERIES:
        row = table[q]
        near_rel = min((row[i] for i in relevant), default=None)
        near_irr = min(d for i, d in row.items() if i not in relevant)
        print(f"  {kind:8} {q[:38]:38} rel {near_rel if near_rel is None else round(near_rel, 3)!s:6} irr {near_irr:.3f}")

    print("\nfloor  pair-recall  precision  positives-with-a-hit  negatives-empty  junk-per-negative")
    for step in range(40, 76, 1):
        floor = step / 100
        tp = fp = fn = 0
        hit = pos = empty = neg = junk = 0
        for q, relevant, kind in QUERIES:
            kept = {i for i, d in table[q].items() if d <= floor}
            if kind == "negative":
                neg += 1
                empty += not kept
                junk += len(kept)
                fp += len(kept)
                continue
            pos += 1
            hit += bool(kept & set(relevant))
            tp += len(kept & set(relevant))
            fp += len(kept - set(relevant))
            fn += len(set(relevant) - kept)
        precision = tp / (tp + fp) if tp + fp else 1.0
        print(f"{floor:.2f}   {tp / (tp + fn):.2f}         {precision:.2f}       {hit}/{pos}                 {empty}/{neg}            {junk / neg:.1f}")


if __name__ == "__main__":
    main()
