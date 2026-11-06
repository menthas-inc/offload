# The meaning floor, 2026-10-31

How far a `voyage-4` match may be before offload stops reading it. The answer, 0.56 cosine distance, is `MEANING_FLOOR` in `apps/core-api/src/search/read.ts`.

## Why

Meaning arms ordered by distance and took the nearest sixty with no limit on how near. On production, "xqzvt plork" in Search came back with six rows, three notes and three memories, and a question to the composer drew rows from every thread under its answer.

## What was measured

- `corpus.py`: 63 invented rows across eleven threads, shaped like dumps (mostly short titles, some bodies), embedded exactly as `embed_jobs.py` sends them: `Thread / Title`, a blank line, the title again, then the body. 63 queries, each labelled with the rows a person would be glad to see: whole questions, single words, typed prefixes from four letters, two in other languages, and 15 that should find nothing.
- `calibrate.py` embeds them (documents as `document`, queries as `query`, 1024 dimensions) and scores every floor from 0.40 to 0.75. `score_rules.py` compares a fixed floor with a floor plus a margin behind the best match. Distances are cached in `distances.json`.
- `holdout.py` and `run_holdout.py`: 32 queries written after the range was narrowed to 0.55 to 0.58 and before they were embedded.

## What it showed

| | floor 0.55 | **0.56** | 0.58 | no floor |
|---|---|---|---|---|
| Tuning: real questions that find a right row (39, prefixes apart) | 35 | **35** | 36 | 39 |
| Tuning: nonsense queries that read nothing (15) | 14 | **14** | 12 | 0 |
| Held out: questions that find a right row (22) | 21 | **21** | 21 | 22 |
| Held out: nonsense that reads nothing (10) | 10 | **10** | 10 | 0 |

(A first pass embedded rows without the repeated title; it put the floor at the same place.)

- Relevant matches mostly sit at 0.30 to 0.56; unrelated nearest neighbours at 0.60 to 0.80. The overlap is the "related but not asked for" band: "weather in Tokyo" reaches the Japan trip at 0.533, "wedding anniversary gift" a birthday party at 0.568.
- Typed prefixes are not meaning's job. "resu", "lisb", "recip" and "dent" sit as near their unrelated rows as their right ones (0.66 to 0.74), so the floor drops them and the words arm, which matches prefixes, finds them.
- A margin relative to the best match raised precision a few points (0.66 to 0.77 at 0.55) for a second constant; left out.
- What it costs: "my CV" is 0.578 from "Finish resume", "what do I need from the shop" 0.64 from the groceries. Those are now found only by words, or by the model asking again.

## The final check: eight large accounts

At the owner's ask, a third set at the scale of a real account: `cast/<person>.json`, one per member of the eval cast (`apps/agent/evals/cast`), each written from that person's profile: 200 to 215 rows, 25 thread notes, 20 memories and 50 labelled queries (32 that should find something, 14 or more of them sharing no word with their answer; 18 that should not: web questions, topics next to the person's life but absent, and nonsense). 2,030 items and 400 queries in all, each query scored only against its own person's items, as a search reads one account. `cast_eval.py` scores it; notes are embedded as `Thread`, a blank line, the text, and memories as the text alone, as the worker does.

| floor | right item found | web questions that read nothing | nonsense that reads nothing | near-topic absentees that read nothing | items shown per real question |
|---|---|---|---|---|---|
| 0.52 | 76% | 61/61 | 35/35 | 39/48 | 2.7 |
| **0.56** | **82%** | **59/61** | **35/35** | **30/48** | **4.1** |
| 0.58 | 86% | 56/61 | 35/35 | 25/48 | 4.9 |
| 0.60 | 89% | 52/61 | 35/35 | 21/48 | 6.0 |
| 0.64 | 94% | 42/61 | 30/35 | 15/48 | 9.3 |
| none | 100% | 0/61 | 0/35 | 0/48 | every candidate |

(One generator labelled its negatives only "negative"; those were sorted into web style or near-topic by their wording.)

By kind at 0.56: whole questions 89%, single words 82%, questions sharing no word with their answer 78%.

- **0.56 holds.** Web questions and nonsense stay empty bar two, both a shared word rather than a meaning ("weather in Munich tomorrow" reaches "Rainy week: plan indoor work first", "convert 30 euros to dollars" reaches "Lena needs 3 euros for the class trip"). Past 0.58 web questions start drawing rows, which is the failure the owner asked to remove.
- **What leaks is near, one item each**: "car insurance renewal" reaches "Tenant insurance renewal" (0.376), "piano tuning" reaches "Tune the snare". Labelled absent, arguably fine to see.
- **What is missed sits just past the floor**: sentence memories and notes reached by a loose question, "where are my folks based" against "Their parents live in Kolkata." (0.569), "licence" against "Their medical licence is held with the CPSO." (0.563). The words arm finds some of these; the rest is the cost the owner accepted. The furthest misses ("drop in on my nan", 0.87) no floor would reach without flooding.
- **Precision is about half** at every useful floor: of the 4.1 items a real question reads, about two are labelled right. The labels are strict and were written in one pass by the generators, so this undercounts; it is also what the words arm alone looked like before meaning existed.

## At production's precision

Production stores `halfvec(1024)` and compares with pgvector's `<=>`. `precision.py` embeds all three sets again, loads every vector into a scratch database on the local Postgres as `halfvec(1024)`, and reads every distance from `<=>` itself: 107,485 query and item pairs. The largest difference from the float32 numbers is 0.00004, and **not one keep-or-drop decision at 0.56 changes**. `halfvec-distances.json` (not committed) holds the cast's.

## The model, with less to read

The evals answer every tool from a fixture, so the floor in the API never runs inside them; what they can show is that answers hold when a search returns little or nothing. On 2026-10-31, with the owner's yes, the answer path: principles 12 (21/21), 16 (6/7), 17 (43/53), 18 (14/14, which covers saying no only after a complete read) and 09's answer cases (6/6), 90 of 101 for about $0.82. Read paired against each case's history, 16 and 17 sit inside the band (z -0.65 and -0.20); the misses are cases already near a coin toss. No prompt changed, so this is the before and the after at once.

## Not measured

- Query cost: the floor is applied after the index's top sixty, so a search reads exactly what it read before the floor existed.

## Outside

No published cutoff for Voyage models was found. The general advice for hybrid search is to filter the vector arm on raw similarity before fusion and to calibrate the number on your own data, because rank-fusion scores carry no absolute meaning.

## Rerun

```
cd docs/experiments/2026-10-meaning-floor
uv run --no-project --with httpx --with python-dotenv python calibrate.py
```

Delete `distances.json` to embed again. A full run is about 3,000 tokens of Voyage.
