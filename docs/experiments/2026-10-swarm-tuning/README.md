# Swarm tuning, October 2026

An experiment in two things at once: how a swarm of coding agents can tune a
product's model calls, and whether offload's calls get cheaper and faster for
it. The second is the example; the first is the point.

**Goal.** Reduce the cost and latency of offload's model calls while holding
the principle evals. Every lever is allowed: prompts, model, effort, caching,
call structure, code, and the evals themselves where a case is wrong.

**Budget.** $70 of model calls across the whole run, enforced by a spend log
every worktree shares (`apps/agent/evals/spend.py`). A worker is capped at $3.
The harness budget is separate, about 40 percent of a week of Claude Code.

## What was measured before anything ran

The harness records, per case, every model call the product made: tokens,
cache reads and writes, latency, and the product's cost apart from the eval's
own judge. `run.py --subset <name>` runs a fixed list of cases.
`compare.py before.json after.json` reads two records against each other:
accuracy with a noise band, cost, latency medians, and a day's cost at the
cost sheet's normal mix, cold and warm.

Three fixed subsets, cut by `evals/subsets/make.py` from a hash of each case
id, stratified by principle and surface:

| subset | size | who runs it | for |
| --- | --- | --- | --- |
| `screen` | about 70 | every worker | the cheap first read of a candidate, about $1.3 |
| `holdout` | about 125 | the merge agent only, sealed | the number that counts |
| `train` | the rest | workers, by principle | reading failures, tuning |

The cast cases stay out of all three: they need a database with the cast in
it, which a worktree does not have.

## Why this shape

The research is in `research-orchestration.md` and
`research-prompt-optimisation.md`. The findings the design rests on:

- **Noise is the enemy.** Two full runs an hour apart disagreed on 39 of 459
  cases. On a 70-case screen a single run moves by about three points on its
  own, so a screen can only tell large effects apart, and no decision rests on
  one run of anything. The merge agent reruns; it does not trust.
- **Early progress predicts final rank** (the harness study on 30 budget-matched
  harnesses). Screen everything, rerun the survivors wider, keep the Pareto
  front over accuracy, cost and latency, never the top scalar.
- **Agents confirm the lever they were handed.** Every brief says that a lever
  that does not help is a finding and is reported as one. The ideation phase
  proposes, a different agent tries, a third reads the diff as a skeptic.
- **Overfitting looks like a training and holdout gap.** The holdout is sealed
  by process: no worker runs it or reads its failures. A candidate whose
  holdout delta is far below its screen delta is a defect, not a number to
  explain.
- **Diversity comes from the brief, not from randomness.** One lens per
  ideation agent, file-disjoint levers where the code allows it, and the
  merge agent composes rather than picks.
- **Caching first, effort second, model generation third, prompt surgery
  last.** Anthropic's own measurements put caching as the largest lever and
  effort as the cheapest; token compression of a planner prompt fails on
  agent control contexts; instruction count and conflicts are where
  compliance is lost, so a shorter prompt is pruned by rule, not by token.

## The run

**Phase 0, baseline (lead, about $13).** The full set once, the screen twice
more for its own noise band. Base commit recorded. Subsets committed.

**Phase 1, ideate (seven agents, no model calls, read only).** One lens each:
caching and prefix structure; effort and output budgets; model generation per
surface; the planner prompt; call structure and tool schemas; the answering
path; the small calls (classify, judge, reader, look, nightly, memory). Each
returns up to six hypotheses with the lever, the files, the expected effect
per surface, the principles at risk, and the cases that would show it. The
lead dedups and picks twelve to sixteen, diverse by lens, and names a worker
for each.

**Phase 2, try (one worker per hypothesis, own worktree, $3 cap).** Implement,
run the unit suite without the database tests, run the screen, run the
principles the change touches, read every failure against its transcript
before believing it, and report. Never the holdout, never the full set, never
a commit. The candidate is a patch and a RESULT.md.

**Phase 3, verify and merge (lead, then one merge agent, about $25).**
Skeptics read each surviving diff for eval tampering and production risk,
one per candidate, read only. The merge agent applies the survivors in order
of value onto one worktree, resolves conflicts, runs the unit suite, runs
the holdout, drops what interacts badly, and runs the full set once at the
end. It writes the report: before and after on screen, holdout and full,
per surface, with what was kept, what was dropped and why.

## Rules every agent carries

In `BRIEF.md`. The ones that matter most: work only in your worktree, never
commit, never run the holdout, never weaken a case your change fails, report
a lever that did not help, and offload's copy rules apply to every word a
prompt says.

## Decisions taken while setting up

- A cold eval run pays every cache write at 1.25 times input; a production
  turn mostly reads. Both numbers are recorded; the warm one is the day.
- The classify, judge and look surfaces priced themselves by a fixed guess.
  They are measured now, through the same ledger sink the worker opens.
- The price table gained the 5.5 generation, so a model swap is priced
  rather than defaulted to Opus.

## Results

Filled in by the merge agent's report, `REPORT.md`.
