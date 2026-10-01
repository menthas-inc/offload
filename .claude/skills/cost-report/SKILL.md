---
name: cost-report
description: Regenerate "offload cost sheet", the page that says what one person costs offload a month and what the fleet costs at 100 to 100,000 people, as ranges across model, WhatsApp and budget configurations. Reads the cost constants from code, the latest evals and vendor prices. Use after changing a model, a prompt, a cap or a vendor, or when the owner asks what offload costs.
---

# The cost sheet

One HTML page, published as a private artifact, with a range chart per profile
and per fleet size, a split by vendor, and every assumption editable in the page.

## Build it

```bash
node .claude/skills/cost-report/build.mjs
```

Writes `.claude/skills/cost-report/cost-report.html` (gitignored) and prints the
fleet totals. Then publish it with the Artifact tool against the existing page,
so the link keeps working:

- URL: `https://claude.ai/artifact/EET8VArw1icLXcxKxFMGbm`
- pass that as `url` from any session; a publish without it makes a second page.

With production numbers, aggregates only (no rows, no accounts, no content):

```bash
LEDGER_DATABASE_URL="$PW" node .claude/skills/cost-report/build.mjs --ledger
```

where `$PW` holds the database's public URL, set by the owner (memory:
secrets through shell variables). Never print it.

## The four files

| File | What it holds | When it changes |
| --- | --- | --- |
| `model.mjs` | The cost model, pure. The page inlines this same source, so what the build checks is what the page runs. | When how offload spends money changes: a new model call, a new paid service, a new cap. |
| `prices.json` | Vendor prices, each with its source and the day it was checked. | When a vendor moves. Check the source again; never write a price from memory. The build warns past 45 days. |
| `assumptions.json` | The judgements: the nine profiles, a turn's shape, storage sizes, the fleet mix, Railway's shape per scale. | When real usage says otherwise. Production ledger numbers beat these. |
| `build.mjs` | Reads constants from code by pattern, runs the code checks behind the findings, reads the evals, renders. | When a constant moves file or name. A pattern that stops matching fails the build; fix the pattern, not the number. |

## What is read from the code every run

Models per tier, the prompt budget, calls and output per turn, searches and
reads per turn, the daily model budget, every photo, voice and mail cap, the
ledger's voice rate, the size of every prompt, and the eval history. The
findings are checks: the one about the budget never tripping goes away by
itself when `worker.py` stops writing `costMicros: 0`.

## How the model works

A turn is priced from tokens: the system prompt and tools as a cached prefix
(read when warm, written when cold), the context and any images uncached on every
call, and output. How warm the prefix is comes from fleet size, because the
prefix is the same for every account: the chance another turn touched it in the
last five minutes. Haiku's prompts are under its 4,096-token cache minimum and
pay full input. The two calibration checks in the page compare the model, shaped
like the evals, with what the evals measured, and shaped like production with the
per-dump range measured on 2026-09-17.

A range is the cheapest and dearest of 216 configurations: four filing models,
three answering models, WhatsApp off or on in each market, and the daily budget
working or not, at every scale.
