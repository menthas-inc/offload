# Run log

Everything that happened, in order, so the next session can continue from
this file alone. Times are local (EDT), 2026-10-10. Costs are from the
shared spend log `~/.offload-swarm/spend.jsonl`. Harness budget is the
owner's weekly Claude Code allowance, read from the app.

## Setup, 15:30 to 17:54

- The owner's ask: an agentic optimisation run that ideates, tries, applies
  and reports on cutting offload's model-call cost and latency; an
  experiment in organising swarms first, offload second. $70 of evals, up
  to 40 percent of a week of Claude Code.
- Mapped the harness: `apps/agent/evals/run.py` recorded pass or fail and
  dollars per case, no latency, no tokens, and priced classify, judge and
  look by a fixed guess. 587 cases over 30 principles; a full run about $9.
- Two research agents in parallel (prompt optimisation methods; swarm
  orchestration and budget allocation under noise). Syntheses saved as
  `research-prompt-optimisation.md` and `research-orchestration.md`.
- Red before green: 24 tests in `tests/test_eval_metrics.py` and
  `test_eval_summary.py`, then: per-case calls, latency, tokens, product
  cost cold and warm in every record (`call_of`, `metrics_of`, `case_row`,
  a `ledger.collecting()` sink per case); `evals/compare.py` (noise band,
  cost, latency, a day at the cost sheet's mix); `evals/spend.py` (a cap
  shared across worktrees via `EVAL_SPEND_LOG`); `evals/subsets/make.py`
  (screen 65, holdout 128 sealed, train 400, by hash of case id,
  stratified); `evals/summary.py`; `--subset`; 5.5 prices in `PRICES`.
- Worktree script `.claude/scripts/swarm-worktree.sh <name> <base> [cap]
  [patch]`: sibling worktree, `.env` symlinked, `uv sync`, writes
  `~/.offload-swarm/<name>.sh` with the spend environment.
- A coverage agent reviewed the eval set against the production mix and the
  cast personas: 23 cases on two new contexts (jun, maya); found the
  voice-note path (`spoken`) unreachable from the evals. Report in
  `eval-coverage.md`.
- Experiment folder written: README (design and why), BRIEF (rules every
  agent carries), lenses.json, workflows/ (ideate, try, merge),
  rounds/PROCEDURE.md. Orchestration chosen: three phases per round,
  hub and spoke through artifacts, no peer messaging, one worker per
  hypothesis in its own worktree, a read-only skeptic per candidate, the
  lead composes and condenses between rounds. Reasons in the README.
- Owner decisions, 17:40: start round 1 tonight even at 59 percent of the
  week; ideation, workers and merge on Opus 5.5; skeptics on Fable.
- Commit `2e743594` at 17:54 after the gate (the gate rejected the three
  workflow scripts' top-level `return`; ESLint now ignores
  `docs/experiments/**/workflows/**`).

## Baseline, 17:52 to 18:03, $13.17

- Full set: 563 of 609 (92.4 percent), $11.20, 427 s. The 16 cast cases all
  failed because this checkout has no cast database; they are outside the
  subsets. 7 of the 23 new persona cases fail on the unchanged app.
- Per surface (full record): filing 2.6 calls, 670 output tokens, 6.7 s
  median, 100 percent of input cached; answering 1.9 calls, 3.4 s, cached;
  classify, judge and look about 1,000 uncached input tokens each (Haiku
  4.5 caches only above 4,096). Product $10.39 cold, $7.65 warm.
- The screen twice, nothing changed: 64 of 65 then 62 of 65, cost x0.97,
  latency x1.13. That is the noise band: 4 points, 20 percent latency.
- Records in `~/.offload-swarm/baseline/`.
- Dashboard published at 18:09 from the Dashboard artifact type, fed by one
  row file assembled by `.claude/scripts/swarm-dash.py` from
  `rounds/state.json` and the spend log, refreshed at each milestone by
  upload plus one document update:
  https://claude.ai/artifact/M2jysaRNkCuHmXMs28jBmk

## Round 1

- 18:10 Ideation: 7 lenses on Opus 5.5, read only, 11 minutes, 1.2M
  harness tokens, 39 hypotheses (`rounds/1/hypotheses-all.json`). Three
  lenses independently proposed Opus 5.5 for answering and Haiku 5.5 for
  the small calls.
- 18:20 Picked 14, diverse by lens (`rounds/1/hypotheses.json`). Worktrees
  from `2e743594`, cap $2.20 each. Parallel `git worktree add` raced once
  (one worktree had to be made again serially).
- 18:22 to 18:45 Try: 14 workers on Opus 5.5, 8 at a time (the machine
  has 10 cores), a Fable skeptic per candidate as each finished. 28 agents,
  23 minutes, 2.9M harness tokens, $23.4 of evals. A Monitor on the
  workflow journal fed the dashboard refreshes.
- Results, workers' own verdicts then the skeptics':
  effort-file-medium kept; effort-file-low refused (reads less before
  committing, photos lost 9 points); effort-answer-medium kept;
  model-answer-opus55 (high) refused, buys nothing; model-answer-sonnet55
  refused, past the band; model-small-haiku55 refused (classify slower
  x1.2 to x1.7, the report dropped its worst runs, 7-token cap headroom,
  no price row in the Core API); model-nightly-haiku55 kept with the tool
  offered at low (forced tool skips its thinking); model-file-sonnet55
  refused, not yet (latency x0.6 real, principle 01 regression on a
  broken paste); prompt-no-preread kept, small; prompt-prune drop, no
  effect; structure-done-signal drop (the model paid saved calls back in
  thinking); structure-classify-gate refused (an English word list files
  real questions silently); caching-prefix kept; structure-tool-diet
  refused (cut create_event's guidance, 08 never run).
- 18:46 Composite on the merge worktree: the two effort patches both added
  `output_config` to the create call, fixed by hand; two tests each worker
  wrote asserting the other path sends no effort removed. `git apply
  --3way --exclude` did not honour the excludes, so patches are filtered
  to code and tests first (`code.patch`).
- 18:48 Composite screen: 63 of 65, median 3.7 s against 4.4 and 5.0,
  warm day x0.80, filing latency x0.7, nightly x0.13, cold cost x1.57
  (every prefix new). $1.52.
- Lead fixes from what the round showed: compare.py's verdict reads the
  warm day (a cold screen reads any prefix change as 1.3 to 1.8 dearer);
  a subset given as a path is named by its stem (one worker lost $0.44 to
  the crash). Tests first.
- `rounds/1/FINDINGS.md` and `rounds/1/composite.patch` written. Weekly
  budget after round 1: 68 percent (from 59). Owner, 18:58: run round 2
  now rather than after the reset.
- The commit of round 1's artifacts failed the gate twice on one timing
  test (an event-loop yield measured at 189 ms against 100 while seven
  agents loaded the machine). Committed later with round 2's.

## Round 2

- 19:00 Ideation: 6 lenses (caching, effort, model, structure, eval,
  tools), told what the composite holds and what round 1 refused, four
  hypotheses each. 9 minutes, 1.1M tokens, 22 hypotheses.
- 19:10 Picked 10, every one a follow-up the findings named. Worktrees
  from `2e743594` plus `rounds/1/composite.patch`, cap $1.40; the lead's
  harness fixes applied as a second patch (the script takes one patch; a
  list is the next improvement).
- 19:12 to 19:31 Try: 10 workers, 10 skeptics, 20 agents, 19 minutes, 2.2M
  tokens, $12.7 of evals. Skeptics kept three: model-look-judge-haiku55
  (look only; judge on 5.5 still fails a typed date), eval-stub-facts
  (the stub leaked a field production removed in 019 and the default
  thread's name 028 masks; 12 of 14 calendar-pairing cases in 17 now fail
  honestly), tools-diet-mechanical (730 prefix tokens, 08 holds).
  Refused: effort-by-route (low's losses do not follow input shape;
  closed), model-file-sonnet55-v2 (under-tested, third time),
  model-answer-sonnet55-v2 (92 to 86 percent over 89 cases),
  model-answer-opus55-medium (closed), caching-ttl-1h (the Core API strips
  the 1h write field; production gain needs a ledger query),
  structure-classify-offpath (untested wiring, a live query cancelled),
  structure-loop-end (refused as shipped with a precise flip condition).
- 19:27 Commit `0909e1e1`: rounds 1 and 2 artifacts, the warm verdict, the
  subset stem, the Haiku 5.5 price row in `apps/core-api/src/pricing.ts`
  (red test first).
- 19:28 Composite 2 on the merge worktree: round 1's five plus the three
  kept, plus the loop end narrowed to the skeptic's conditions (tier two
  off, the say-first guard reads landed or changed, an ask-only response
  never ends the turn; four tests describing the old behaviour replaced by
  two for the new). 1,199 unit tests green, lint clean.
- 19:30 Composite 2 screen: 62 of 65 (one lost to the honest stub on
  purpose), 131 calls against 142 baseline, warm day x0.78 against the
  baseline, x0.98 against composite 1. $1.53.
- `rounds/2/FINDINGS.md` and `rounds/2/composite.patch` written.
  `docs/tech/stack.md`'s model table updated on main.

## Final verification, from 19:33

- 19:33 Sealed holdout, 128 cases, first time anyone ran it: 121 of 128
  (94.5 percent), $1.71. Against the same 128 cases in the baseline full
  run: accuracy 93.8 to 94.5 (+0.8), cold cost x0.72, warm day x0.78,
  median latency 4.1 to 3.7 s (x0.91), p90 14.5 to 7.9 s, filing latency
  x0.69, answer x1.11 (inside noise), nightly cost x0.06, look x0.05.
  Verdict better. Four newly failing (calendar-not-connected-add,
  history-reply-not-evidence, r2-pair-cals which is the honest stub,
  thumbs-up), five newly passing. The holdout delta matches the screen
  delta: no overfitting.
- 19:38 Full set on the composite: 549 of 609 (90.1 percent) against the
  baseline's 563, $7.71 (the eval's own judge included), 300 s. Against
  the baseline: cold cost x0.65, warm day x0.75, median latency 4.8 to
  4.0 s, p90 13.8 to 8.7 s, model calls 1,569 to 1,229. 29 newly failing,
  15 newly passing; about ten of the failures are the honest stub's
  calendar-pairing cases.
- 19:38 Principle 15 (injection) rerun on the composite: 17 of 19; with
  answering effort off: 18 of 19. `history-reply-not-evidence` fails at
  medium in three of three runs and passes with effort off: the model
  answers from its own earlier reply instead of reading. The other
  failure (`facts-injection`) is the honest stub. Principle 11 rerun: 34
  of 37 against the baseline's 35. Flagged for the owner in the report
  and the decision log; `ANSWER_EFFORT` stays medium in the branch.
- 19:40 The composite applied to main's working tree from the merge
  worktree (patch regenerated against `0909e1e1`; thirteen files that
  differed only by formatting dropped). 1,203 unit tests, lint clean.
  Model-calls page rebuilt. `docs/tech/decisions.md` entry and
  `docs/tech/stack.md` table written. `REPORT.md` written.
- Spend at the end: $60.13 of $70. Weekly allowance used by the run: about
  18 points of the week, from 59 to 77 percent.

## What to carry into the next experiment

- The pieces that are reusable as they are: the harness additions, the
  subsets and spend cap, the worktree and collect scripts, the three
  workflow scripts, the dashboard and its two refresh scripts, the brief.
- The lead's between-round work (pick, worktrees, compose, screen, condense,
  dashboard) is the part still done by hand. `rounds/PROCEDURE.md` is the
  checklist; it took about 25 minutes per round.
- Known gaps: the worktree script takes one patch; the screen cannot see
  caching, classify, judge, look or memory levers (two cases each; a panel
  subset was proposed in round 2 and not built); the per-case cost estimate
  undercounts asking-back cases; the merge worktree needs the lead's
  harness fixes applied too.
- 24 worker worktrees `offload_app-swarm-*` and 24 branches `swarm/*`
  remain. Removing them is the owner's.

## After the run, 19:45 onwards

- 19:45 The composite commit through the gate collided twice with another
  session's commit on the shared database (hundreds of foreign-key
  failures, both sides). Cause on my side: the suite hold was taken inside
  the same command the gate hook runs before, so the hold came after the
  suite. The hold has to be its own command, before, and the release its
  own command, after. Posted on the board.
- 19:50 The owner asked what the calendar-pairing stub is and whether it
  can be fixed. Since 019 where a calendar files is a thread's pick in
  `thread_calendars`; `account_facts` said only the calendar names and no
  answering tool carried the pairing, so "which thread files into Team"
  had no answer the model could read. The eval's stub had kept sending
  the old `filesInto` field, so 12 of 14 pairing cases passed on data
  production did not send. Fix, red test first in
  `apps/core-api/test/account-facts-pairing.test.ts`: `accountFacts`
  names, per approved calendar, the threads this account picked it for,
  by the names the model is shown (the default thread as "not in a
  thread"), sorted; the tool route's schema widened; the eval stub and
  its shape fixture match. Another member's pick is not listed.
- 20:01 Principle 17 on the composite with the fix: 34 of 37 against 32
  of 37 at baseline and 25 of 37 on the composite's full run. All ten
  pairing cases pass. The three left (`h-fact-default`,
  `aside-message-by-meaning`, `maya-kids-counts-both-members-rows`) failed
  at baseline or flip between runs. $1.21. Spend: $61.34 of $70.
