# Report: swarm tuning, 2026-10-10

Two rounds of a coding-agent swarm tuned offload's model calls for cost and
latency against the principle evals. Twenty-four candidates were tried in
their own worktrees, each read by a skeptic; nine were kept into one
composite; the composite was verified on a sealed holdout and then the full
set. Everything was measured, nothing was assumed. The run cost $61.34 of
model calls against a $70 cap and about 18 points of a weekly Claude Code
allowance.

## The result

| | baseline | composite | change |
| --- | --- | --- | --- |
| full set accuracy | 563/609 (92.4%) | 549/609 (90.1%) | -2.3 points, inside the 4-point band; ten of the losses are the pairing cases, fixed after the run (below) |
| sealed holdout accuracy | 120/128 (93.8%) | 121/128 (94.5%) | +0.8 |
| product cost, full set, cold | $10.39 | $6.80 | x0.65 |
| warm day, cost sheet's mix | $0.0968 | $0.0725 | x0.75 |
| median case latency | 4.8 s | 4.0 s | x0.84 |
| p90 latency | 13.8 s | 8.7 s | x0.63 |
| filing: cost, latency | | | x0.65, x0.74 |
| answering: cost | | | x0.68 |
| nightly pass: cost | | | x0.06 |
| look: cost | | | x0.04 |
| model calls, full set | 1,569 | 1,229 | x0.78 |

The holdout is the number that counts: 128 cases nobody ran or tuned
against until the end, better on every axis, and its delta matches the
screen's, so the composite did not overfit the 65 cases the workers saw.

## What changed

Nine changes, each in `docs/tech/decisions.md` under "Swarm tuning,
2026-10-10", in `rounds/2/composite.patch`, and in the working tree of this
branch:

1. Filing at `effort: medium` (85 percent of its output was thinking).
2. Answering at `effort: medium` on Opus 5.
3. The nightly pass on Haiku 5.5, tool offered, `effort: low` (27 of 27).
4. The look on Haiku 5.5 (3 of 3, off the reply path), with the price row.
5. The account's context first in the user turn, with its own cache mark.
6. No precautionary read before filing.
7. The loop ends a filing turn after a say-only response (tier one).
8. Tool schemas without nullable branches and inlined `$defs`.
9. The eval's `account_facts` stub sends what the Core API sends.

## What the full set lost, read honestly

Twenty-nine cases newly fail and fifteen newly pass. They sort into:

- **The honest stub, ten, fixed after the run.** `h-which-*`, `r2-pair-*`,
  `r2-which-nowhere`, `which-files-*`, `yesno-yes`, `r2-yesno-yes`: the
  calendar-pairing questions. The stub used to send a field production
  removed in 019 and the default thread's stored name that 028 masks. With
  the real payload the model gave confident wrong answers to "which thread
  files into which calendar", because since 019 no tool carried it. The
  owner asked for a fix: `account_facts` now names the threads this
  account picked each calendar for, and principle 17 passes 34 of 37 on
  the composite against 32 at baseline. Every answering number before
  this run was measured against the leak.
- **Answering at medium, one stable case.** `history-reply-not-evidence`
  fails at medium in three of three runs and passes with the effort off:
  the model answered from its own earlier reply instead of reading. The
  same "reads less" shape low effort showed on filing. Principle 15 is
  otherwise held (18 of 19 with effort off, 17 of 19 at medium; the other
  failure is the stub). ⚠️ Your call: keep medium and the 30 percent cut
  in answering output, or set `ANSWER_EFFORT = None` in `harness/plan.py`
  and keep the case.
- **Noise, the rest.** `thumbs-up`, `n-asks-and-dumps`, `month-no-year-next`
  and the like have flipped between baseline runs before; principle 11
  reran at 34 of 37 against the baseline's 35, principle 15's
  `step-injection` and `row-read-back-instruction` passed on the rerun.

## What was refused, with the condition to flip it

- Sonnet 5.5 for filing: latency x0.76 twice, one sentence fixes the
  known regression; never run on principles 01, 13 and 08 in full (about
  $2). Refused three times as under-tested. Fund the runs.
- Sonnet 5.5 for answering: warm x0.35, latency x0.54, 6 points down over
  89 cases, twice. The facts-read sentence that fixed round 1's failures
  is model independent and could land on its own.
- A one hour TTL on the frozen prefix: needs the Core API to accept the 1h
  write field and a ledger query on the gap between turns. The query is
  in the worker's RESULT.md.
- Classify beside the context load: no eval can see it; needs an
  integration test and a look at cancelling a live query.
- Haiku 5.5 for classify and judge: cheaper by twenty times, but classify
  slower on every text dump and a note routed as a question; judge skips
  the tool on a typed date.

Dead ends, measured: prose pruning for cost, a model-emitted done signal,
effort low on filing by any route, a word-list gate before classify, Opus
5.5 for answering with these prompts, a loop tier that reads write results.

## What the swarm taught

- **Skeptics are the stage that made the run honest.** Workers recommended
  keep-with-caveat on 21 of 24 candidates; skeptics kept 9. Every refusal
  was reproducible from the records, two found production blockers outside
  the patch (the price table, the stripped 1h field), one caught a report
  that dropped its worst runs, and the best refusals named the exact
  condition that would flip them, which the lead then applied.
- **Findings carry between rounds.** Every round 2 pick was a follow-up
  named in round 1's findings, and six of ten resolved a round 1 question:
  three closed for good, three narrowed to a precise next step.
- **The cold cache biases every screen.** A candidate that changes a model,
  prompt, effort or tool list starts cold and reads 1.3 to 1.8 times
  dearer while its warm cost fell. The verdict now reads the warm day.
- **The screen cannot see everything.** Caching, the look, the judge,
  memory and classify have two cases each on 65; their evidence came from
  deterministic token counts and principle runs. A panel subset was
  proposed and not built.
- **The eval was lying about one surface for weeks.** Found by a worker
  whose job was the harness, not the product.
- **Where the budget went.** Evals: baseline $13.2, round 1 workers $23.4,
  round 2 workers $12.7, the lead's composite screens, holdout, full set
  and checks $10.9. Harness: about 8.2M subagent tokens over 54 agents.
  Wall clock from first commit to final full run: about two hours.

## Follow-ups, in order

1. Decide `ANSWER_EFFORT` (the pairing gap is fixed in this branch).
2. Regenerate the cost sheet (`/cost-report`) and republish the model-calls
   page; both read the models and prompts from code and are stale now.
3. Fund the three principle runs for Sonnet 5.5 filing.
4. Remove the 24 `offload_app-swarm-*` worktrees and `swarm/*` branches.
5. For the next run: the worktree script takes a list of patches; a panel
   subset for the small surfaces; a warm-up case before each screen; the
   lead's between-round steps as a fourth workflow.

Everything that happened, in order, is in `LOG.md`. The dashboard the run
was followed on: https://claude.ai/artifact/M2jysaRNkCuHmXMs28jBmk
