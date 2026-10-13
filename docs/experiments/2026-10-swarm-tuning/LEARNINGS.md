# What the two runs taught, for the next one

Read this before the next run, with `README.md` (the shape), `BRIEF.md`
(the workers' rules) and `rounds/PROCEDURE.md` (the lead's steps). Each
entry is one thing that cost time or money, what was learned, and what the
framework now does about it. The dated detail is in `LOG.md`.

## Measuring

- **The screen is not the holdout.** Run 2's final composite read z -3.12
  on the 68-case screen and z +0.31 on the sealed 132-case holdout. A small
  set run many times at the base prompts has a tight expectation, and a
  composite's few real flips on it read as a refusal. The screen is a
  smoke test for the lead between rounds; the holdout, run once, is the
  verdict. Never tune on either.
- **A candidate run is not its own history.** Every run 2 round 1 worker
  read z +0.43 or +1.59: the worktree's copy of `cases.jsonl` held the
  candidate's own run and little else at the base hash. `compare.py
  --paired` now leaves a run out of the history it is read against, and
  the lead reads only through `.claude/scripts/swarm-read.sh`, against the
  main checkout's log on every base hash (`SWARM_BASE_PROMPTS`). When the
  numbers look the same across candidates, suspect the measure first.
- **A thirty-case block cannot see one surface.** A lever on answering or
  the judge reads "neither moved" on a block that is mostly filing, and
  the worker's own principle run is where its evidence is. The gate takes
  `--surface`; the brief says which surface a candidate is read on; the
  race's block2 and block3 confirm, they do not discover.
- **The warm day under-prices a cheap model's per-turn writes.** Pricing
  every cache write as a read made the warm day x1.29 under what
  production pays (the answer surface x1.55). `prod_cost_usd` is in every
  record now; read a context-size lever on that line.
- **A prefix change is a cold cache.** Any prompt, tool or model change
  reads x1.1 to x1.8 dearer cold. One warm-up case before every screen;
  read the warm or prod line, never the cold one.
- **Filing noise on 396 cases is about nine.** Two full runs on the same
  configuration an hour apart: 344 and 353 of 396. Read a full-set
  difference under ten as the same run.
- **Pool the base hashes, with a prior.** The base of a run is usually two
  or three prompt hashes apart on single lines; a case seen once at the
  newest hash is a coin seen once. `noise.band` shrinks a thin history
  towards the case's all-version rate with the weight of two runs.

## Workers and skeptics

- **The permission classifier is part of the system.** Three of fourteen
  workers in round 1 and seven of thirteen in round 2 were refused their
  first `run.py` and stopped, as the brief says. Round 3's briefs said
  "write the commands in RESULT.md and stop; the lead runs them", and the
  lead did, under each worker's spend name. Budget the lead's hour for it.
- **A statement must say what the patch does.** The seeded known-good of
  round 1 was refused as stated because the hypothesis said "nightly and
  memory with the forced tool" and the patch was nightly only, tool
  offered. Write the one-sentence statement from the patch, not from the
  lens, and the skeptic reads the right thing.
- **Blind skeptics disagree, and the second one was right.** The same
  candidate (facts preloaded) was kept in round 1 and refused as a round
  2 seed on three points the first skeptic never raised: an injection case
  never run, a word-cap regression, the privacy page. Seed two known
  candidates every round; count false acceptance and false rejection; and
  when a kept candidate touches what the privacy page claims, run the
  injection case before the lead composes.
- **A rule aimed at one case moves the whole surface.** The named-day rule
  fixed none of its targets and pulled eight other cases into lookups; a
  rubric sentence lifted into a prompt is tampering by another name. The
  non-goals say so; the skeptics catch it; the brief names the shape of a
  miss and never a case's words.
- **Reduced thinking shows on the copy rules.** Filing at effort low read
  well on its own tests and flipped three never-failed say-once and
  one-sentence cases on the composite screen. Effort levers are judged on
  the composite, not alone.
- **Model choice beat everything else, and the one prompt that paid was
  the one written for the model.** Two model swaps are nearly all of a
  ten-fold warm-day fall. Prompt and structure levers held accuracy or
  trimmed a call per turn on one principle. A probe of a cheaper model
  with no code change (`--model surface=id`) is the cheapest hypothesis
  there is: run it first, then write the prompt for what it misses.
- **Blind lenses re-propose dead ends; briefed lenses converge.** Half of
  round 2's lenses were blind: they re-proposed two measured dead ends and
  one refused lever, and found two things nobody briefed had seen. Keep
  the split; give the blind half the dead-end list at least.
- **Briefs are files.** The workflow's inline arguments reached 38 KB.
  Each worker reads `rounds/<n>/briefs/<name>.md`; the workflow passes the
  name, the worktree and the statement.

## The lead's mechanics

- **Compose at the workers' base.** The first merge worktree was one
  commit behind the workers' base and four of five deltas did not apply.
  `swarm-compose.sh <name> <base> <patches>` makes the worktree at the
  base; a later round's candidates are cut as deltas against a snapshot of
  the composite they started from (`diff -ruN` with the eval logs and
  caches excluded), never as their whole `candidate.patch`.
- **Cut a candidate to its code.** `swarm-codepatch.py` drops RESULT.md,
  the patch's copy of itself, the eval logs and the records; the result
  applies to a clean tree.
- **Bisect by surface.** A composite that refuses has usually one
  candidate on the surface that flipped. Revert that one, screen again, at
  most twice.
- **Findings are records.** `swarm-findings.py add` per candidate with
  the z, the ratios, the accepted flag and the flip condition;
  `render` writes the page. The first run's LLM-written findings lost
  precision between rounds; a record does not.
- **The repo's traps, as met.** zsh does not split an unquoted variable
  (a chain of runs with `$M` flags never ran); `ruff format` on a
  directory reformats files that are not yours (format only the files you
  changed); the commit gate blocks any command whose text has `git` and
  later `commit`, including a hold reason; the gate scans staged files for
  em dashes, so a merge of main that carries a dash in a test fixture
  cannot be committed through it (run what the gate runs by hand, then
  `git merge --continue`); results folders under a new round path need
  their own ignore rule before the collect step.

## Budget

Run 2 spent $40 of $70 on evals over three rounds and about 10M harness
tokens over 70 agents, in about five hours of wall clock. Where it went:
round 1 $17 (workers $11, pool $6), round 2 $7 (workers $3, the lead's runs
for the refused $4), round 3 $4, calibration and composites $5, verification
$7 (two holdouts, two full sets). The holdout on Haiku filing costs $0.26
and the full set $1.06, so verification is cheap now; the workers' stakes
are the cost, and half of them were spent by the lead.
