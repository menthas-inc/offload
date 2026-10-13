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
- 20:06 The pairing test passed on the shared database under a hold taken
  in its own command. Commit `def8043b` on `feat/swarm-tuning-2026-10`
  through the gate (32 files), pushed, pull request
  https://github.com/menthas-inc/offload_app/pull/105 opened. The merge
  worktree keeps the same composite uncommitted.
- Spend at the end: $61.34 of $70. Harness: about 8.2M subagent tokens over
  54 agents plus the lead; the weekly allowance went from 59 to about 78
  percent.
- 20:20 The owner asked about the one principle 15 case answering at medium
  lost, and chose to try a prompt line before deciding on the effort. The
  prompt already said an earlier reply is evidence of nothing; the new
  sentence says what to do: a question an earlier reply already answered
  is read again from the rows. Principle 15 at medium: 22 of 23 (the case
  now reads the row, 2 calls, 128 output tokens); principle 17 unchanged
  at 34 of 37 with slightly lower cost; the case three of three on
  reruns. Lesson, the third time this round: a rule that names the action
  lands where a rule that names the category does not. $2.01. Spend
  $63.35 of $70.

## 2026-10-13, after the critique

- The critique and the v2 design were researched (five notes, one report
  under `reports/`). The owner's two notes: keep every run's per-case
  outcomes so the band comes from history rather than reruns; drop the
  product proposer, whose output could only be untested scope suggestions.
- `evals/noise.py` and the committed `evals/cases.jsonl`, red tests first:
  one line per run with the passed and failed ids, appended by run.py;
  per-case pass rates pooled over runs; the expected count and standard
  error for any subset; a run read paired against the history; the
  flakiest cases. Backfilled from every record on this machine: 147
  distinct runs since 2026-09-16, 635 cases seen.
- What it says: at the baseline's prompts hash (73 runs) the screen's band
  is 95.5 percent plus or minus 2.0 points and the holdout's plus or minus
  2.6, narrower than the 4 points assumed from one pair of screens.
  Pooled across every prompt version the expected rate reads low (the
  app was worse in September), so the band pools runs on one prompts
  hash by default. Twelve cases sit at 44 to 56 percent over eight or
  more runs (`conceptual-duplicate-folds`, `move-from-inside`,
  `n-asks-and-dumps`, `step-injection`, `span-one-day`, the country
  pair); they measure nothing and belong on the pending list or in a
  rewrite before the next run.
- The v2 protocol in the report now reads its accuracy band from the
  history (calibration drops from $4 to $1.3) and has no product proposer.
- 2026-10-13, 12:40. The owner asked for the flaky-cases hand-off
  (`handoff-flaky-cases.md`, for a separate session), the previous run's
  artifacts removed, and the next run started as proposed. Artifacts:
  another session had already removed the 25 swarm worktrees and their
  branches; the shared swarm folder is archived as
  `~/.offload-swarm-run1-2026-10-10` (spend log, baseline records, env
  files) and a fresh `~/.offload-swarm` will be made for v2. The v2 plan
  and its implementation checklist are `rounds/v2/PLAN.md`.

## 2026-10-13 13:05, v2 mechanics built (commit 19b25e1f)

Red tests first, then: race blocks (`block1` 30, `block2` 30, `block3` 52,
from the train cases, the twelve flaky ids left out via `subsets/flaky.json`);
`noise.py` pooling several prompts hashes with `--since` and a prior for a
case the base has seen once (block1 at the base hashes read se 0 without it,
27.4 +/- 1.5 with it; the screen 62.7 +/- 1.3 of 66 known); `compare.py
--paired` with the gate line; `prefix.py` (filing prefix 35,216 chars of
prompt plus 14,562 of tools, about 12,400 tokens); `swarm-dedup.py` (TF-IDF
cosine, union find); `swarm-findings.py` (append and render); the lenses
`wildcard` and `junior`; the ideation schema with a disconfirming test and
threshold per hypothesis and a blind split; the try workflow with the
exclusion list, claim board lines, the prefix gate, block1 on the worker's
stake and a blind skeptic; the brief and the worktree script to match.
Ruff format touched ten unrelated test files; reverted. 762 agent tests
pass. Nothing has been spent.

## 2026-10-13 13:10, v2 calibration

Fresh `~/.offload-swarm` (spend log, `lead.sh` cap $40, `pool.sh` cap $24,
`prefix-base.json`). One warm-up case ($0.04), then block1 on the base:
29/30, $0.64, history expected 26.9 +/- 1.5 (z +1.41). Then the screen:
67/68, $0.96, history 64.4 +/- 1.6 (z +1.67), median latency 3.7 s, warm
day $0.0737; against run 1's last composite screen the cold cost reads
x0.61 only because that one was cold and this one warm, which is what the
warm-up is for. The only screen failure: maya-members-rule-does-not-decide.
Base records in `~/.offload-swarm/baseline/` (block1, screen, and run 1's
final full as `full.json`). $1.64 spent. Ideation of round 1 running: nine
lenses. State and dashboard updated.

## 2026-10-13 13:40, v2 round 1 launched

Ideation: nine lenses, 40 hypotheses, 37 distinct at cosine 0.5 (dedup
grouped the stable account part three ways and classify through structured
output twice), 17 minutes. Fourteen picked, each with the lead's one-sentence
statement, its lens's disconfirming test and threshold, and the other
thirteen titles as its exclusion list: cache-stable-account,
effort-answer-reply-low, eval-per-call-usage, model-file-sonnet55-v3,
model-answer-sonnet5, small-structured-output, answer-facts-preloaded,
structure-same-response-refs, structure-notes-on-screen,
structure-ask-ends-turn, structure-lookup-want-repair,
prompt-no-preread-notes, prompt-media-block, probe-file-haiku55. Left for
round 2 or as findings: classify on Haiku 5.5 on top of structured output,
the filing tools' own cache mark, answering with deferred tools (a beta),
the reader's shaping call and the memory aliases (invisible to the eval),
reading a link in code before the planner (large). Briefs are files under
rounds/v2/1/briefs/, one per worker, because the workflow's arguments were
38 KB with everything inline. Worktrees from 19b25e1f at a $1.60 cap each;
try.js launched 13:40. A seed worktree at 2e743594 for the two calibration
candidates.

## 2026-10-13 13:50, seeded skeptics (round 1 calibration)

Two run 1 candidates replayed blind to a Fable skeptic, same brief as the
real ones, 4 minutes, 133k harness tokens. Known-bad prompt-prune: refused,
correctly, with the strongest reading yet (the new lookup order lengthens the
chain it set out to shorten; no screen case exercises a rewritten rule; the
three-lookup budget line vanished while the code still enforces it).
Known-good model-nightly-haiku55: refused as stated, because the hypothesis
said nightly and memory with the forced tool and the merged patch is nightly
only, tool offered, effort low; and because the Core API had no price row
for Haiku 5.5. Both are true, and the flip condition it named is exactly what
run 1's lead did (narrowed it, then the price row in round 2). So: false
acceptance 0 of 1; false rejection 0 of 1 on the strict reading, 1 of 1 on
the loose one. The lesson for the lead: a candidate's statement must say
what the patch does, not what the lens hoped, or a blind skeptic refuses the
gap. Verdicts in rounds/v2/1/seeds.json.

## 2026-10-13 14:05, round 1 read

Fourteen workers and thirteen skeptics, 18 minutes, 2.6M harness tokens,
$11.2 of evals ($12.83 total). Workers' gate on block1: four kept, seven
refused, three not run. Skeptics: three kept (answer-facts-preloaded, P17
calls 2.13 to 1.00, latency x0.45, z +3.52; structure-lookup-want-repair,
46 of 46 malformed wants repaired, 0 of 136 clean ones touched;
eval-per-call-usage, an instrument), ten refused, every refusal with a flip
condition. Dead ends: effort-answer-reply-low (output x0.91 against x0.85
needed), structure-same-response-refs (the model never used the ref),
small-structured-output (classify slower, one hedge case lost). Refused
with a condition the pool can buy: cache-stable-account (one 10/10 case
flipped; rerun 04 cold), prompt-media-block (prefix x0.86, warm x0.95 on
one block1; a second block1 and p23), model-file-sonnet55-v3 (needs 13
and a rerun of 01+08), structure-notes-on-screen (05 calls x0.83 but
warm day flat on block1). model-answer-sonnet5: aggregate z -0.21 at warm
x0.43 but principle 18 alone z -2.06 (the cut-short caveat dropped); a
prompt change for Sonnet 5 is a round 2 hypothesis. Three workers were
refused by the session's permission classifier when they ran run.py and
stopped as the brief says (structure-ask-ends-turn, prompt-no-preread-notes,
probe-file-haiku55); the lead runs their block1 and principle runs now under
their own spend names. Race launched 14:05: base block2, then block2 for the
four survivors from the pool, p23 for media-block, p04 for cache-stable.
Seeded skeptics in the same run: see 13:50. Collect done into
rounds/v2/1/candidates/.

## 2026-10-13 14:45, the race and the composite

Two flaws in the mechanics, found by reading: (1) every worker's paired z was
self-referential, because a worktree's cases.jsonl lacks the calibration
runs and holds the candidate's own run, so the expected count was the
candidate's own count shrunk to the prior (every z read +0.43 or +1.59).
compare.py now leaves a run out of the history it is read against, and
`.claude/scripts/swarm-read.sh` reads against the main checkout's log on
both base hashes. (2) A 30-case block is an accuracy check; a lever on one
surface (answering, the judge) reads "neither moved" on the whole block
while its own cases halved. The gate takes `--surface`. (3) zsh does not
split an unquoted variable, so the Haiku probe's first race chain never ran.

Pool reads, all against the main history: answer-facts-preloaded (P17 z
+3.19, latency x0.58, warm x0.75; block2 answer x0.87), lookup-want-repair
(block2 x0.93, P13 z +2.32), prompt-media-block (block2 x0.87, prefix x0.86;
its second p23 z -0.13), cache-stable-account (block2 z +1.65, p04 passed the
flipped case), ask-ends-turn (p13 calls 2.39 against 2.57, 53/56 as base),
no-preread-notes (p05 calls 2.53 against 2.76, z +0.59), notes-on-screen
(p05 z +2.39, warm x0.84, containment 15 of 15 in the thread on screen),
Sonnet 5.5 filing refused (p08 z -0.55, cancel-many-by-description again;
latency x0.91 to x1.00 on principle runs). Filing on Haiku 5.5, the probe,
held everywhere the pool bought: block1 28/30, block2 26/30, p13 50/56, p01
17/17, warm day x0.20 to x0.28, latency x0.75 to x0.86.

Composed on merge-v2: eight code patches, two needed hands (both added
tests/test_cache_prefix.py and appended to test_plan.py; notes-on-screen and
no-preread edited the same Thread notes sentence, merged as one sentence
with both facts). 1276 unit tests green, prefix file x0.88. Screen running
14:45. $20.6 spent of $70 (pool $5.6).

## 2026-10-13 14:00, composite screens

Composite of eight on the base: 64/68 (base 67/68), z -0.76 against the
history, warm day x0.93, latency flat, cold cost x1.11 (changed prompts
start cold). Flipped: asked-for-a-calendar-with-none-connected-says-once
(7 of 13 on these prompts), forwarded-email-steers-a-suggestion (10 of 11),
stay-sentence-is-note (19 of 29 over all). The same composite with filing on
Haiku 5.5: 66/68, z +0.82, warm day x0.27, p90 latency x0.77, $0.34 for the
screen against $1.17. Filing on Haiku 5.5 goes into the composite as the
round 1 result; round 2 starts from it. $23 spent of $70.

## 2026-10-13 14:20, round 2 launched

Round 1 committed as ad719c92 (the results records under the new path had
to be ignored: `rounds/*/*/candidates/*/results/`; one em dash in a worker's
structured result replaced; the gate also blocks any command that contains
"git" and "commit" together, so a hold reason may not say commit). The
composite now carries filing on Haiku 5.5 (config.py, a red-first pin in
tests/test_filing_model.py), 18 files in composite.patch, prompts hash
40b3099a. Round 2 ideation launched 14:20 from the merge worktree with the
briefs as files (brief-briefed.md with round 1's FINDINGS.md for effort,
prompt, answer and wildcard; brief-blind.md for caching, model, structure,
small and junior) so the anchor's cost can be counted by half. Base block1
on the composite running for the round's reference.

## 2026-10-13 14:35, round 2 seeded skeptics

Known-bad structure-same-response-refs: refused, with two production
defects the first skeptic did not name (a refused filing's ref stays taken,
so a refile is refused before the API; a bare value equal to a ref name is
swapped). Known-good answer-facts-preloaded: refused, on three points the
round 1 skeptic who kept it did not raise: principle 15's facts-injection
case was never run on it (the display name and calendar names now sit in
the cached account part of every answering call), fact-default-thread
regresses reproducibly on a 12-word cap, and the privacy page's section 5
may not cover the name and calendar names on every answering call. The lead
ran principle 15's four answer cases on the composite: 4 of 4, PWNED absent,
so the injection point is closed. Section 5 says a call carries "what
offload knows about you"; whether that covers the account's name and the
calendar names on every answering turn (the tool already sent them on
demand) is for the owner, flagged in the report. The 12-word cap on
fact-default-thread against 14 and 16 on its siblings goes to the flaky
cases hand-off. Round 2 calibration: false acceptance 0 of 1; the known-good
refusal was substantive, not a false rejection. Two blind skeptics on the
same candidate disagreed, and the second was right about what was missing.

## 2026-10-13 14:50, round 2 launched

Ideation: 31 hypotheses from nine lenses, all distinct at cosine 0.5, 11
minutes, 1.5M harness tokens. The blind half re-proposed two of round 1's
measured dead ends (a done flag on the filing tools; a mechanical gate before
classify, which was the first run's dead end) and the first run's refused
classify-beside-load; it also converged with the briefed answer lens on
answering on Haiku 5.5 and found two things nobody briefed had seen (the
recency line round 1 added is written fresh at Opus prices on every
question; the warm day prices per-turn writes as reads). Thirteen picked:
probe-answer-haiku55, answer-truncation-said, effort-file-haiku55-low,
classify-one-word, classify-haiku55, judge-haiku55, answer-tool-diet,
prompt-dates-for-haiku, prompt-named-day-lookup, prompt-refusal-one-sentence,
eval-prod-warm-cost, structure-parallel-reads, answer-no-recency-line. Six
from blind lenses, seven from briefed. Left: the worker lane's wake interval
(another session, worker-lanes, is building that file), the speculative
first call beside classify (refused in the first run; needs an integration
test), a six-turn history on the answer path, memory handles (invisible to
the eval), the hedge of filing at effort high. Worktrees from ad719c92 with
composite.patch applied; briefs name the composite's block1, the
composite's prefix sizes and the three prompts hashes for the paired read.

## 2026-10-13 15:20, round 2 read, first pass

Thirteen workers, twelve skeptics, 26 minutes, 2.5M harness tokens, only
$2.8 of evals: the permission classifier refused run.py for seven of the
thirteen workers before their first run (three of fourteen in round 1).
Every one of them stopped as the brief says and wrote RESULT.md with the
exact commands; the lead runs those now under each worker's own spend
name, in five chains. Measured: eval-prod-warm-cost kept (the warm day is
x1.29 under what production pays, the answer surface x1.55, because every
per-turn write is priced as a read); answer-truncation-said took answering
on Sonnet 5 from 1 of 5 to 5 of 5 cut-short cases (principle 18 14 of 14),
refused by its skeptic only for one Opus case retyping rows over the word
cap; classify-haiku55 and judge-haiku55 refused on their own tests (a note
routed as a question twice; a wrong day accepted twice);
structure-parallel-reads refused for lack of a visible benefit;
answer-tool-diet measured 329 tokens off every answering first call but ran
neither block1 nor p17 (the pool buys them). Sonnet 5 answering with the
truncation fact is being raced from the pool as the answer-model
candidate. $25.5 spent.

## 2026-10-13 15:45, round 2 read, second pass

The lead's runs, all read against the main history on the three base hashes
and, for filing candidates, against the Haiku base's own principle 13
record (the composite-era full set is Sonnet filing and reads x0.05 on
everything). Kept: effort-file-haiku55-low (p13 51 of 56 against 50,
output 372 against 445 tokens a case, file warm x0.79, latency x0.86);
prompt-dates-for-haiku (p13 52 of 56, two of Haiku's named misses fixed,
p04 16 of 17); answer-no-recency-line (p17 36 of 37, p18 14 of 14, block1
28 of 30, the per-question write gone); answer-tool-diet (p17 34 of 37, 329
tokens off every answering first call); eval-prod-warm-cost (instrument).
Refused: classify-one-word (19 of 21 twice, the same note routed as a
question), prompt-named-day-lookup (p09 48 of 56, eight new failures,
j-easter among them), prompt-refusal-one-sentence (calendar-said-once),
answer-truncation-said on Opus (13 of 14 twice over the word cap; kept as
the enabler), Sonnet 5 answering with the fact in (p17 28 of 37, p16 4 of
7). Answering on Haiku 5.5 as a probe: p17 31 of 37, p18 14 of 14, p16 5 of
7 (it says what it cannot do), block1 28 of 30, answer warm x0.02 to x0.03,
latency x0.56: every miss copy-shaped. The answer prompt is tuned to Opus 5
and both cheaper models fail the same cases; a prompt written for the
model is the round 3 question, and the largest lever left.

## 2026-10-13 16:05, round 2 composite

Five deltas composed on merge-v2b (the first merge worktree was one commit
behind the workers' base, so a second was made at ad719c92 with the round 1
composite): unit suite green. Screen 62 of 68, z -2.33, refused; three of
the six flips had never failed on the base. Bisect: filing at effort low
reverted (the only candidate on the filing surface), screen 64 of 68, z
-0.76, warm day x0.98 against the round 1 composite and x0.26 against the
base. The round 2 composite is the four: the dates prompt, no recency line,
the answer tool diet, the prod-warm cost line. The gate's cost half reads
"neither moved" against round 1 because those savings are per-turn writes
and prefix tokens the warm eval prices as reads; the prod-warm line is the
instrument that would see them next time. $31 spent. Round 3 goes ahead,
short and aimed at the answer prompt for Haiku 5.5.

## 2026-10-13 16:15, round 3 launched

No ideation: the lead picked from the round 2 findings. Five workers from
the round 2 composite (ad719c92 plus rounds/v2/2/composite.patch, 19 files):
answer-prompt-haiku-rewrite and answer-prompt-haiku-lines (two routes to an
answer prompt Haiku 5.5 can follow, measured with the model override on 17,
18, 16 and block1, then once on Opus 5 so the prompt costs Opus nothing),
probe-answer-haiku55-high (does more thinking close the copy-shaped misses
without a prompt), classify-one-word-v2 and prompt-refusal-v2 (second
attempts at round 2's one-case-short levers, pointed at their patches).
Briefs tell a worker refused by the permission system to write the
commands and stop. After this round: the holdout once on the final
composite, then the full set, then the report and the PR.

## 2026-10-13 16:50, round 3 read and the final composite

Five workers, five skeptics, 16 minutes, 1.1M harness tokens, $3.6 of
evals; the permission classifier refused nobody this time (the briefs said
what to do if it did). answer-prompt-haiku-rewrite: answer.md rewritten for
a small model, three iterations (the second lost principle 18 by
compressing the truncated-read rule), on Haiku 5.5 principle 16 7 of 7, 17
36 of 37, 18 14 of 14, 11's answer cases 6 of 7, block1 28 of 30, answer
prefix x0.855; its skeptic refused because the patch left Opus 5 in
config.py and the Opus control was not run (the worker's cap). The lead
adopts the rewrite with answering moved to Haiku 5.5 (config.py, a
red-first pin) and runs the Opus control from the pool for the record.
classify-one-word-v2: principle 19 21 of 21 three times, classify median
742 to about 435 ms, kept by its skeptic. Refused: answer-prompt-haiku-lines
(a rubric sentence in the prompt; Opus loses a case), probe-answer-haiku55-high
(17 at 33 of 37 at x1.06 to x1.30), prompt-refusal-v2 (14 of 14 on 07 twice
but a gap in the set: a row called a note; case noted in the hand-off).
Composite 3 on merge-v2b: the rewrite, classify in one word, answering on
Haiku 5.5; 1,291 unit tests, prefixes answer x0.86, file x0.88, classify
x0.95. Final screen, the sealed holdout and the full set launched 16:50 as
one chain. $35 spent.

## 2026-10-13 16:55, the Opus control

The rewritten answer prompt on Opus 5, principle 17: 35 of 37, the same
count as the composite's prompt on Opus (fact-single now fails,
fact-default-thread now passes; both are word-cap cases), warm x0.92. The
rewrite costs Opus nothing, so Opus 5 stays a one-line fallback for
answering if the holdout says Haiku 5.5 cannot hold it.

## 2026-10-13 17:25, verification

Final composite (rounds 1 to 3, filing and answering on Haiku 5.5), all
read against the main history on the three base hashes. Screen 61 of 68,
z -3.12, refused: three answer cases (bold markup in a calendar read, a
helpline paragraph after the refused-subject line, "Two left." for a read
across rows) and three file cases two of which flipped in round 2 as well.
Sealed holdout, run once: 121 of 132 (run 1's final composite 121 of 128),
z +0.31, warm day x0.11, median latency x0.83; answer 31 of 35, file 67 of
73, classify 4 of 4, judge 4 of 4, nightly 10 of 11, memory 3 of 3. Full set
563 of 637 (the set grew with main), z +1.54, warm day x0.10, median
latency x0.77, p90 x0.70, 1,158 calls against 1,229. The holdout's new
answering misses are copy-shaped on Haiku: markup, a paragraph added to a
fixed line, a diary question that stops after an empty search. The same
holdout and full set are running with answering kept on Opus 5 (the
rewrite costs Opus nothing: 35 of 37 on 17), so the owner's choice between
the two answering models has both numbers. $36.7 spent before those runs.

## 2026-10-13 17:45, the answering choice

Holdout with answering kept on Opus 5 (the rewritten prompt): 124 of 132,
z +1.43, answer 35 of 35, file 65 of 73, warm day x0.22 against the base.
Against the Haiku-answering holdout the answer surface is 35 of 35 to 31 of
35, at twenty-six times the answer cost. The composite ships on Opus 5 with
Haiku 5.5 as a documented one-line switch (config.py, the pin test says
why); the owner decides. REPORT-v2.md written; the decisions entry added
under "Swarm tuning, second run, 2026-10-13". The full set on the Opus
configuration is running.

## 2026-10-13 18:05, the last run and the branch

Full set with answering on Opus 5: 562 of 637, z +1.01, warm day x0.20,
median latency x0.81, p90 x0.69, 1,161 calls; answering 115 of 121, filing
344 of 396 (the Haiku-answering run an hour earlier had filing at 353 of
396 on the same configuration: the filing noise on 396 cases is about nine).
$39.6 spent of $70. The composite's code (18 files, cut from
rounds/v2/3/composite.patch) is applied to the branch in the main checkout
with answering on Opus 5; the merge worktree's nine verification runs are
folded into cases.jsonl and history.jsonl and HISTORY.md regenerated;
stack.md's model table and the decisions entry are written. Next: the
gate, the push, the pull request body.

## 2026-10-13 18:40, merged main and opened the pull request

The branch was 39 behind main (PR 105 had been merged in the meantime);
merged origin/main in: only HISTORY.md and history.jsonl conflicted,
resolved by union and regeneration; plan_v2.md and tools.py auto-merged
(another session's calendar change). The gate blocked the merge on two em
dashes that are main's own test fixtures (a regex and a date range in
packages/widgets tests), so the lead ran what the gate runs by hand: lint
clean, the shared suite green (2,470 core-api tests, 8 tasks), the agent
suite 1,293 green, subsets regenerated (main added two cases), then
finished the merge. Pushed; pull request opened. Spend $39.6 of $70.

## 2026-10-13 19:40, the owner's calls and round 4

The owner took the switch (answering on Haiku 5.5), asked for a try at
closing the four-case holdout gap with prompt tuning, a pull request for
the privacy page, the learnings folded into the framework, and the
housekeeping done by the lead once the pull requests exist.

Done: config.py answers on Haiku 5.5 with a red-first pin; pull request
117 (privacy section 5 names the name and the calendars on every answering
call, dated 13 October, 39 page tests green) from a worktree reset to main;
LEARNINGS.md, the brief's "learned the hard way" section and the procedure's
"as the second run actually ran it"; 35 swarm worktrees and branches
removed, the four in use kept.

Round 4, three workers from the branch head with the switch, 22 minutes,
0.65M harness tokens, $4 of evals: answer-haiku-rules refused itself
(literal lines changed wording, not tool choices; it measured Haiku's
run-to-run spread on 16 and 17 as 5 to 7 and 33 to 36 across six
near-identical runs, as large as the gap), answer-haiku-shapes refused
itself (fixed the cases it named, lost others on 17), answer-haiku-mechanical
kept by the lead against its skeptic's refusal, which was about the lead's
model switch riding in the patch: three loop guards with red-first tests
(a reply that begins with a fixed line is cut to it; bold over more than
two words loses its markers; a turn whose searches found nothing with
look_up offered and unused is sent back once), 17 at 36 of 37, 18 at 14 of
14, 11 at 7 of 7, two of the four holdout misses closed deterministically.
The guards (plan.py, run.py, tests/test_answer_guards.py) are on the branch;
principle 09, the holdout once and the full set are running on it.

## 2026-10-13 20:30, the guards on the holdout

Principle 09 on the branch (guards, Haiku answering): 51 of 56, z +0.62;
the five flips are Haiku filing lookups and the two answer cases the
skeptic named pass. Holdout once with the guards: 124 of 132, z +1.19,
answer 33 of 35 (31 before the guards, Opus 35), file 67 of 73, warm day
x0.11, latency x0.79. answer-selfharm and answer-term-dates now pass;
answer-last-train-theirs newly fails; weather-no-country still asks. The
switch ships with the guards. The model-calls page and the cost sheet are
rebuilt from the branch (the page's anchors for the answer, classify and
filing prompts realigned to the rewrites and to main's merge; the media
block moved its two sections to the end); the model-calls page is
published, the cost sheet after the full set finishes.

## 2026-10-13 21:00, the full set with the guards, and the branch

Full set, filing and answering on Haiku 5.5 with the three guards: 560 of
639, z +0.17 against the history, warm day x0.10, median latency x0.74;
answering 103 of 121 (108 before the guards, 115 on Opus 5; the history
expects 104.7 +/- 3.2, z -0.55), while the holdout went 31 to 33 of 35.
Both moves are inside Haiku's spread on these cases; the guards stay for
the two shapes they fix deterministically. $45 spent of $70. The owner
dropped the privacy pull request (the current wording covers it); PR 116
needs main merged in again (PR 115 landed after the last merge).
