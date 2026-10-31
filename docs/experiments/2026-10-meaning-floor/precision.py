# The same distances at production's precision: every vector stored as
# halfvec(1024) and compared with pgvector's own <=>, in a scratch database on
# the local Postgres, then read against the float32 numbers the floor was
# chosen on. Writes halfvec-distances.json (cast) beside this file and prints
# how many keep-or-drop decisions at the floor change.
#
#   uv run --no-project --with httpx --with python-dotenv python precision.py <scratch dir>
#
# Needs the offload-postgres container. The vectors go through <scratch dir>,
# never this folder: they are 25 MB and regenerated in a minute.

import csv
import json
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

from calibrate import HERE, embed
from cast_eval import items, people
from corpus import DOCS, QUERIES
from holdout import HOLDOUT

FLOOR = 0.56
DB = "offload_floor_precision"
SCRATCH = Path(sys.argv[1])


def psql(sql: str, stdin: str | None = None) -> str:
    out = subprocess.run(
        ["docker", "exec", "-i", "offload-postgres", "psql", "-U", "offload", "-d", DB, "-qAtc", sql],
        input=stdin, capture_output=True, text=True, check=True,
    )
    return out.stdout


def main() -> None:
    common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=HERE, capture_output=True, text=True, check=True)
    key = dotenv_values(Path(common.stdout.strip()).parent / ".env").get("VOYAGE_API_KEY")

    # (set, owner) -> item texts and queries. The small sets are one owner each.
    small = {i: f"{DOCS[i][0]} / {DOCS[i][1]}\n\n{DOCS[i][1]}" + (f"\n\n{DOCS[i][2]}" if DOCS[i][2] else "") for i in DOCS}
    groups = {("tuning", "x"): (small, [q for q, _, _ in QUERIES]), ("holdout", "x"): (small, [q for q, _, _ in HOLDOUT])}
    for name, person in people().items():
        groups[("cast", name)] = (items(person), [q["q"] for q in person["queries"]])

    subprocess.run(["docker", "exec", "offload-postgres", "psql", "-U", "offload", "-d", "postgres", "-qc", f"drop database if exists {DB}"], check=True)
    subprocess.run(["docker", "exec", "offload-postgres", "psql", "-U", "offload", "-d", "postgres", "-qc", f"create database {DB}"], check=True)
    psql("create extension vector; create table item (grp text, owner text, id text, v halfvec(1024)); create table query (grp text, owner text, q text, v halfvec(1024));")

    SCRATCH.mkdir(parents=True, exist_ok=True)
    f32: dict[tuple[str, str], dict[str, dict[str, float]]] = {}
    for (grp, owner), (texts, queries) in groups.items():
        if grp == "holdout" and ("tuning", owner) in f32:
            item_vecs = cached_items
        else:
            ids = list(texts)
            item_vecs = dict(zip(ids, embed(key, [texts[i] for i in ids], "document")))
            cached_items = item_vecs
        query_vecs = dict(zip(queries, embed(key, queries, "query")))
        f32[(grp, owner)] = {q: {i: 1 - sum(a * b for a, b in zip(qv, dv)) for i, dv in item_vecs.items()} for q, qv in query_vecs.items()}
        for table, rows in (("item", item_vecs), ("query", query_vecs)):
            path = SCRATCH / f"{grp}-{owner}-{table}.csv"
            with path.open("w", newline="") as handle:
                writer = csv.writer(handle)
                for k, v in rows.items():
                    writer.writerow([grp, owner, k, "[" + ",".join(f"{x:.8f}" for x in v) + "]"])
            psql(f"\\copy {table} from stdin with (format csv)", path.read_text())

    rows = psql("select q.grp, q.owner, q.q, i.id, (i.v <=> q.v)::float8 from query q join item i on i.grp = q.grp and i.owner = q.owner")
    f16: dict[tuple[str, str], dict[str, dict[str, float]]] = {}
    reader = csv.reader(rows.splitlines(), delimiter="|")
    for grp, owner, q, i, d in reader:
        f16.setdefault((grp, owner), {}).setdefault(q, {})[i] = float(d)

    pairs = flips = 0
    worst = 0.0
    near_flips = []
    for k, table in f32.items():
        for q, row in table.items():
            for i, d32 in row.items():
                d16 = f16[k][q][i]
                pairs += 1
                worst = max(worst, abs(d16 - d32))
                if (d32 <= FLOOR) != (d16 <= FLOOR):
                    flips += 1
                    near_flips.append((k[0], q, i, round(d32, 4), round(d16, 4)))
    print(f"{pairs} query-item pairs; largest difference halfvec vs float32: {worst:.5f}")
    print(f"decisions at {FLOOR} that change: {flips}")
    for f in near_flips[:20]:
        print("  ", f)
    (HERE / "halfvec-distances.json").write_text(json.dumps({owner: table for (grp, owner), table in f16.items() if grp == "cast"}))
    subprocess.run(["docker", "exec", "offload-postgres", "psql", "-U", "offload", "-d", "postgres", "-qc", f"drop database {DB}"], check=True)


if __name__ == "__main__":
    main()
