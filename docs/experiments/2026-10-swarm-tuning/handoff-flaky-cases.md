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
