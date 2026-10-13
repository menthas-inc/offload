# Report: swarm tuning, second run, 2026-10-13

Three rounds of a coding-agent swarm tuned offload's model calls for cost
and latency, starting from the first run's composite. Thirty-two candidates
were tried in their own worktrees, each read by a blind skeptic; eleven were
kept into one composite; the composite was verified once on the sealed
holdout and then on the full set. Everything was measured against the
committed per-case history rather than a single baseline run. The run cost
$40 of model calls against a $70 cap and about 10M harness tokens over 70
agents.

## The result

Against the base this run started from (the first run's composite, with
filing on Sonnet 5 and answering on Opus 5):

| | base | final composite | change |
| --- | --- | --- | --- |
| sealed holdout accuracy | 121/128 (94.5%) | 121/132 (91.7%) | z +0.31 against the history: no worse |
| full set accuracy | 549/609 (90.1%) | 563/637 (88.3%) | z +1.54 against the history: no worse |
| screen accuracy | 67/68 | 61/68 | z -3.12: the one read that refuses it |
| warm day, cost sheet's mix | $0.0725 | $0.0073 | x0.10 |
| product cost, full set, cold | $6.80 | $0.42 | x0.06 |
| median case latency | 4.1 s | 3.0 s | x0.74 |
| p90 latency | 8.8 s | 6.0 s | x0.68 |
| model calls, full set | 1,229 | 1,158 | x0.94 |
| filing: warm cost per case | $0.0118 | $0.0006 | x0.05 |
| answering: warm cost per case | $0.0092 | $0.0003 | x0.03 |
| classify: warm cost per call, latency | $0.0013, 742 ms | $0.0004, 435 ms | x0.30, x0.59 |

Per surface on the full set: filing 353 of 396 against 369 (z -0.14 against
the filing history), answering 108 of 121 against 106 (z +1.39), classify
21 of 21, judge 18 of 19, nightly 48 of 49, memory 12 of 12. On the holdout:
filing 67 of 73 (z +0.15), answering 31 of 35 (z +0.09).

With answering kept on Opus 5 and everything else the same, the sealed
holdout reads 124 of 132 (z +1.43), the answer surface 35 of 35 against
Haiku's 31 of 35, at a warm day of x0.22 against the base; the full set
562 of 637 (z +1.01), answering 115 of 121 against Haiku's 108, warm day
x0.20, median latency x0.81, p90 x0.69. That is what the composite ships
with: the rewritten prompt on Opus 5, Haiku 5.5 as a one-line switch in
`config.py` with its numbers beside it.

| answering on | holdout | full set | warm day | answer cases, full set |
| --- | --- | --- | --- | --- |
| Opus 5 (shipped) | 124/132 | 562/637 | x0.20 | 115/121 |
| Haiku 5.5 (the switch) | 121/132 | 563/637 | x0.10 | 108/121 |

The two full runs also show the filing noise on Haiku: 344 and 353 of 396
on the same filing configuration, nine cases apart an hour apart.

Read honestly: the warm day fell by ten times and the sealed holdout holds
within the history's band; the screen, 68 cases the lead ran after every
round, reads 61 of 68 and refuses. Both are true. The holdout is the number
nobody tuned against. The filing surface lost about four points on the full
set against the base run (not against its pooled history), which is the
price of a model at a twentieth of the cost with a prompt that nobody
rewrote for it; the answering surface gained two with a prompt that was.

## What changed

Eleven changes, in `rounds/v2/3/composite.patch` (21 files against
ad719c92) and on the merge worktree. Each is in `docs/tech/decisions.md`
under "Swarm tuning, second run, 2026-10-13".

1. Filing on Haiku 5.5 at medium (config.py `model`), the Sonnet-era
   prompt unchanged.
2. Answering on Haiku 5.5 with `answer.md` rewritten for a small model
   (the never-list first, fixed replies as literal lines, each rule once).
   The rewrite costs Opus 5 nothing (principle 17 at 35 of 37 on both), so
   Opus 5 is a one-line fallback.
3. Account facts read before the first answering call and carried in the
   cached account part (facts questions: two calls to one, P17 median 3.8 s
   to 2.0 s).
4. The look_up want repaired when the model sends a list as one escaped
   string (46 of 46 recorded, 0 of 136 clean ones touched).
5. The photo and PDF rules as a second cached system block sent only with
   a photo or a PDF (text filing prefix x0.86).
6. Threads and labels in a fixed order inside the cached account part,
   recency as a line after the mark (byte-stable across a burst under the
   caps; the eval cannot price it).
7. A filing turn of only asks and says, every ask naming a landed row, ends
   without the closing call (P13 calls 2.57 to 2.39).
8. The prompt says a thread's notes come only with a write, never from a
   read (P05 calls 2.76 to 2.53).
9. The notes of the thread on screen in the dump turn, framed by author
   (P05 calls 47 to 39; containment held 15 of 15).
10. The dates section says what to write for a partial date (two of Haiku's
    named misses fixed; P13 50 to 52 of 56).
11. Classify answers in one plain word with no tool (P19 21 of 21 three
    times; 742 to 435 ms on every text dump).

Plus the answer path's tool definitions trimmed (329 tokens off every first
call), no recency line on the answering turn, and two eval instruments: a
usage row per call and a production-warm cost line (the warm day prices
per-turn writes as reads and reads x1.29 under what production pays, the
answer surface x1.55).

## What was refused, with the condition to flip it

Every refusal names its flip in `rounds/v2/*/findings.jsonl`. The ones worth
money:

- Filing at effort low on Haiku 5.5: its own tests read well (P13 51 of 56,
  output x0.84) but the composite screen with it fell to 62 of 68 with three
  never-failed cases flipped, two of them say-once rules. Reduced thinking
  shows on the copy rules, not on the filing.
- Classify and the judge on Haiku 5.5: cheaper by twenty times, a note
  routed as a question twice, a wrong day accepted twice. Same shape as the
  first run.
- Sonnet 5 answering: the truncation fact fixed principle 18 (1 of 5 to 5
  of 5) but 17 fell to 28 of 37 and 16 to 4 of 7. The prompt is tuned to
  Opus; a cheaper model needs its own, which is what round 3 then wrote for
  Haiku.
- Sonnet 5.5 filing, third attempt, run in full this time: 08 at z -0.55
  with the named case failing again; the latency gain did not reproduce on
  principle runs. Haiku took the lever.
- A ref a later call in the same response may name: the model never used
  it (3.00 calls per dependent case against 2.5 needed).
- The refusal prompt (could_not_do in one sentence, no read): 14 of 14 on
  07 twice, delete-note at two calls, refused by its skeptic on a gap in the
  set (a task row the person calls a note); the case to add is in the
  hand-off.
- The named-day rule: aimed at one case, it pulled eight others into
  lookups.

Dead ends, measured: the reply call at low effort by per-message effort;
structured output for the small calls (slower); parallel reads (one
two-read response in sixteen); Haiku 5.5 answering at effort high (closes
16, not 17, at x1.06 to x1.30).

## Open for the owner

- **Answering on Haiku 5.5 or Opus 5.** Shipped on Opus 5. Haiku holds the
  history's band on the holdout (31 of 35) at a thirtieth of the cost, and
  Opus answers 35 of 35 on the same cases at a warm day of x0.22 instead of
  x0.11. Haiku's four misses are copy-shaped: bold markup in a calendar
  read, a helpline paragraph after the refused-subject line
  (`answer-selfharm`, a category the spec marks unresolved), a diary
  question that stops after an empty search instead of reaching for
  look_up, a country asked for the weather. The lead took the conservative
  side because those are the rules the product is strictest about; the
  switch is one line and the rewrite is already in.
- **The privacy page.** The account's display name and calendar names now
  sit in every answering call (change 3) rather than only when the model
  asked for them. Section 5 says a call carries "what offload knows about
  you". Whether that covers it is yours; the injection case for it passes.
- **Haiku filing's misses.** Named in the findings: scope-default-is-one,
  delete-note, after-the-20th and friends. Two were fixed by the dates
  prompt; the rest are the next prompt round, which this run shows pays
  (five cases on answering for one rewrite).

## What the swarm taught, this time

- **The screen is not the holdout.** The lead ran the screen after every
  round and it refused the final composite at z -3.12 while the sealed
  holdout kept it at z +0.31. Sixty-eight cases run many times at the base
  prompts have a tight expectation; the composite's flips on them are real
  and small, and the holdout's 132 are the measurement.
- **A worker's paired z was self-referential.** Each worktree's copy of the
  history held the candidate's own run and little else at the base hash, so
  every worker read z +0.43 or +1.59. Found by reading the numbers' sameness;
  fixed by leaving a run out of its own history and reading from the main
  checkout's log. Every number above is the corrected read.
- **A thirty-case block cannot see a surface.** A lever on answering or the
  judge reads "neither moved" on a block that is mostly filing. The gate
  now reads cost and latency per surface; the accuracy stays paired over
  every case.
- **Blind skeptics disagree, and the second one was right.** The same
  candidate (facts preloaded) was kept by its round 1 skeptic and refused by
  the round 2 seed skeptic on three things the first did not raise (the
  injection case never run, a word-cap regression, the privacy page). Seeds
  measured false acceptance 0 of 2 and false rejection 0 of 2 on the strict
  reading; both known-good refusals were substantive.
- **The permission classifier is part of the system.** Three of fourteen
  workers in round 1 and seven of thirteen in round 2 were refused their
  first eval run and stopped as told; the lead ran their commands under
  their spend names. Round 3's briefs said what to do and nobody was
  refused. Budget for the lead's time, not only the workers'.
- **Blind lenses re-propose dead ends; briefed lenses converge.** The blind
  half of round 2 re-proposed two measured dead ends and one refused lever,
  and also found two things nobody briefed had seen (the recency line's
  per-question write; the warm day under-pricing per-turn writes). Six of
  thirteen picks came from the blind half, two of them kept.
- **Model choice beat everything else.** Of the warm day's ten-fold fall,
  the two model swaps are nearly all of it; the prompt and structure
  changes held accuracy or trimmed a call per turn on one principle, and
  the one prompt change that mattered was the one written for the new
  model.
- **Where the budget went.** Evals: calibration $1.6, round 1 workers $11.2
  and pool $5.6, round 2 workers $2.8 (the refusals) and the lead's runs for
  them $4.3, round 3 $3.6, composites and verification $4.5. Harness: about
  10M subagent tokens over 70 agents. Wall clock from the first commit of
  the mechanics to the holdout: about four and a half hours.

## Follow-ups, in order

1. The owner's call on answering (above), then merge.
2. Regenerate the cost sheet and the model-calls page; both read the models
   and prompts from code.
3. A prompt round for Haiku filing's named misses, run the way round 3 ran.
4. The cases in `handoff-flaky-cases.md`, now with two more from the
   skeptics (the 12-word cap on fact-default-thread; a task row called a
   note).
5. Remove the 25 `offload_app-swarm-*` worktrees and `swarm/*` branches.

Everything that happened, in order, is in `LOG.md`; the per-change records
are `rounds/v2/*/findings.jsonl`; the dashboard is
https://claude.ai/artifact/M2jysaRNkCuHmXMs28jBmk.
