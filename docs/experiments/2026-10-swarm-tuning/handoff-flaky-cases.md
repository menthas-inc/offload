# Hand-off: the eval cases that measure nothing

For a separate session. Read `.claude/skills/run-llm-tests/SKILL.md` first;
the evals cost money and nothing below needs more than about $3 of them.

## What this is

`apps/agent/evals/cases.jsonl` (committed) holds every eval run's passed and
failed case ids since 2026-09-16, 147 runs. `uv run python evals/noise.py
--top 40` (from `apps/agent`) lists the cases nearest a coin toss. Thirty
eight cases sit between 35 and 65 percent over eight or more runs when every
prompt version is pooled; the twelve nearest 50 percent are:

| case | passed | principle | surface |
| --- | --- | --- | --- |
| conceptual-duplicate-folds | 6 of 12 | 21 | nightly |
| move-from-inside | 6 of 12 | 02 | file |
| new-thread-line-is-verb-first | 4 of 8 | 22 | file |
| step-injection | 6 of 11 | 15 | file |
| span-one-day | 6 of 11 | 14 | judge |
| n-asks-and-dumps | 10 of 18 | 19 | classify |
| country-agrees | 5 of 9 | 12 | answer |
| country-picked | 4 of 9 | 12 | answer |
| failure-not-diagnosed | 5 of 9 | 22 | file |
| file-march-on-route | 4 of 9 | 11 | file |
| h-link-recipe | 5 of 9 | 09 | file |
| i-diary-bonfire | 5 of 9 | 11 | file |

A case at 50 percent is not measuring the product; it is adding one coin
toss to every run that includes it, which widens the band every candidate
is read against. The swarm run of 2026-10-10 spent real money on verdicts
these cases flipped.

## The one distinction that matters

Pooled across prompt versions, a case can look flaky for two different
reasons, and only one is a defect in the case:

- **It flips within one prompts version.** The same app, the same case,
  pass then fail. That is a case the model finds ambiguous, or a rubric a
  judge reads two ways. Fix the case.
- **It flipped between prompt versions.** It failed on the September
  prompts and passes on October's, or the reverse. That is the product
  moving, which is what the case is for. Leave it.

`cases.jsonl` carries the prompts hash of every run, so this is one query
per case: `noise.py --prompts <hash> --top 40` for each of the three or
four hashes that have ten or more runs (`python3 -c` over the file gives
the hash counts). A case that is near 50 percent inside one hash is the
first kind.

## What to do with the first kind

For each, read its transcripts across runs. The lead's records are under
`apps/agent/evals/results/` on this machine (gitignored); the swarm's
workers' records are under
`docs/experiments/2026-10-swarm-tuning/rounds/*/candidates/*/results/`
(gitignored, present locally). Two questions per case, from the skill:

- Is the reply actually wrong by the principle's statement, or does the
  case demand a stricter reading than the prompt holds? If the latter,
  rewrite the expectation to the statement, or split the case into the
  two readings and pend one with `label_pending` and the question for the
  owner.
- Do two cases in the set contradict each other? Then the rule underneath
  is undecided and no case edit fixes it; pend both with the question.

Never weaken a case to make it pass; a pend with a clear question is the
honest move. Mechanical checks (`must_not_contain`, `max_words`,
`filed` matchers) over rubrics where the words allow it: a judge flips about
14 percent of close calls on its own.

Known shapes from the run, to save you the first hour:

- `n-asks-and-dumps`, `n-think-about-it`: classify on Haiku 4.5 wobbles on
  a message that both asks and tells; the 019 statement says a message
  that both asks and dumps is a dump. Check whether the case's text is a
  fair example of that or an edge the statement does not reach.
- `country-agrees`, `country-picked`, `file-country-from-account`: the
  country lookups; the query shape is checked mechanically and the model
  sometimes leaves the country out. May be a real product wobble rather
  than a case fault; if so, it is a prompt finding, not a rewrite.
- `fact-default-thread`, `r2-fact-default`: moved from luck to signal on
  2026-10-10 when the stub stopped leaking the default thread's name; most
  of their history predates that, so judge them on runs after it.
- `history-reply-not-evidence`, `facts-injection`: fixed or re-read on
  2026-10-10 (a prompt line; the honest stub); judge on runs after it.
- `stay-sentence-is-note` (18 of 28): a long-running one; the 03
  statement says a sentence is a note and a date does not make it an
  event. Worth settling once.

## What to hand back

A short note per case: fixed (how), pended (the question), or left (why,
with the hash evidence). Run only the principles you touched, once, and
quote the result. Then regenerate the subsets
(`uv run python evals/subsets/make.py`) if any case id changed, and commit
through the gate with a `board.py hold suite` taken in its own command
first.

- `fact-default-thread` (12-word cap) against `h-fact-default` (16) and `r2-fact-default` (14): the same reply shape passes two and fails one. Found by a skeptic on 2026-10-13; reconcile the caps or pend the one.

- A principle 07 case to add (from the round 3 skeptic, 2026-10-13): "delete the note about the plumber" where "Call the plumber" is a task row in the thread on screen and no thread note mentions it; expects archive_content and no say. Without it a refusal-at-the-word-note prompt cannot be judged.

## Settled, 2026-10-13

Read with `noise.py --production`: each case only from runs on the model
production uses for its surface, and errored runs left out. `cases.jsonl`
now keeps `errored` apart from `failed`. 519 errored ids in 148 old rows
were moved there from the local records. Most of the twelve were not coin
tosses: their failures were September's unhashed prompts, an Opus filing
trial, a refused Haiku 5.5 classify candidate, or a run that raised.

- `conceptual-duplicate-folds`, `literal-duplicate-folds`: **fixed.** The
  same answer, both notes folded into one, was judged pass and fail on
  different runs. Both cases now use `one_left`, a mechanical nightly check.
- `span-one-day`: **left, and kept in flaky.json.** It is a fair case, since
  `judge.md` gives this exact example, and it is 4 of 6 on Haiku 4.5 since
  2026-10-10. The judge sometimes says "the 10th" answers nothing. That is a
  judge prompt finding.
- `n-asks-and-dumps`: **left, and kept in flaky.json.** It is a fair example
  of the 019 statement. Classify on Haiku 4.5 routes it to answering in
  about one run in three (8 of 12). That is a classify prompt finding.
- `n-think-about-it`: **left.** It is 10 of 10 on Haiku 4.5. Every failure
  was the Haiku 5.5 classify candidate.
- `move-from-inside`, `step-injection`, `failure-not-diagnosed`,
  `new-thread-line-is-verb-first`, `h-link-recipe`, `stay-sentence-is-note`:
  **left.** Each has passed every run since 2026-10-10 on production's
  filing model. The failures were September prompts, Opus or Sonnet 5.5
  filing trials, or errors.
- `file-march-on-route`, `i-diary-bonfire`, the country cases: **left.**
  They are no longer coin tosses. On Haiku 5.5 filing they fail every run
  because the turn never looks the date up. That is the prompt round below.
- `date-the-20th`: **left.** It is 5 of 6 since 2026-10-10; September's
  judge prompt failed it.
- `fact-default-thread`, `h-fact-default`, `r2-fact-default`: **left.** The
  caps differ, but no recorded failure was a cap. On production's answer
  model all three pass with the same ten-word reply.
- The principle 07 case: **added** as `delete-the-note-that-is-a-row`.
- Principle 30, the cast: a run with no `EVAL_CAST_DATABASE_URL` leaves the
  sixteen cast cases out and says so, instead of failing each one.

## The prompt round, Haiku 5.5 filing, 2026-10-13

Haiku 5.5 filed most of the lookup cases without looking up: a bare question
about a day got `Not sure.`, a public day named by what happens on it was
filed undated, and a plan with "check" was filed without checking.
`plan_v2.md` now opens its lookup section with the decision and its four
kinds, then what is never looked up. The "not offload's" line now says a
question about a day passes that test even when it is the whole dump.

| run, filing surface | before | after |
| --- | --- | --- |
| principle 09 | 47 of 52 | 49 of 52 (z +1.32 on history) |
| principle 11 | 25 of 30 | 27 of 30 (z +0.90) |
| principle 12 | 3 of 5 | 4 of 5 |
| held-out, 18 cases written first | 16 of 18 | 18 of 18 |
| screen, all surfaces | 62 of 68 | 64 of 68 |
| block1 / block2 filing | | 19 of 19 (z +0.58), 17 of 19 (z +2.04) |
| nine lookup cases, three runs each | 0 of 3 each in the full runs | 21 of 27 |

Still open, each without company: `polls-open` writes "check when the polls
open" into the row body instead of checking (1 of 3); `thread-note-not-in-query`
says `Not sure.` inside the Istanbul thread (1 of 3); the march cases add
"route" to the query, are refused by the bound, and retry in their words.
`file-country-from-account` asks for a date after its lookup.

Case faults found on the way:

- The three 08 scope cases asked to move a standup "to 10" that the fixture
  has at 10 Lisbon time. Haiku said so; Sonnet passed by rewriting the same
  time. They move it to 11 now, and pass on Haiku.
- The judge was shown the harness's `(because ...)` label after the last
  line and failed `ask-first-write-waits-as-waiting` for it. The label is
  added after the judge now: 3 of 3.
- `--subset` with `--surface` stopped on "subset names cases that do not
  exist". It checks against every case now.

The held-out cases are folded into principle 09. The decision log entry for
`docs/tech/decisions.md` is to be written on main.
