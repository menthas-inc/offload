---
name: run-llm-tests
description: Run offload's principle evals against the real model and read the result. The set lives in apps/agent/evals/principles, one file per principle of how the product behaves, each holding the cases that test it. Use to get a baseline, to check a prompt or model change, to see which principles a change clashes with, or to add cases for a new feature. Never runs automatically; it costs money.
---

# Running the LLM tests

**Only with Behrooz's explicit permission, given in the session, per run.** A
full run measured at $6.83 with filing on Sonnet; Opus filing is about three
times that, and `--runs 3` multiplies again. Say what will run and what it
will cost, then wait for a yes. `--list`, case edits and the unit tests need
no permission because they call no model.


The evals are a hierarchy, and the hierarchy is the point.

1. **A principle** is one sentence of how offload behaves, written from a spec, a
   prompt rule or something a person expects. `apps/agent/evals/principles/NN-slug.json`
   holds one, with `statement`, `why`, `sources`, and its `cases`.
2. **A case** is one dump, question, typed row, note set or answer, the context
   it runs in, and what the turn must do. Cases are generated from a principle
   the way unit tests are generated from a function: the ordinary path, the
   edges, and the negatives that prove the rule can fail.
3. **A context** is what an account holds, in `apps/agent/evals/contexts/*.json`:
   threads, notes, rows, facts, calendars, history, country. Cases name one and
   override what they need. Contexts are shared because the same account with
   the same notes is the fixture for a dozen rules.

The principles are the durable part. Cases are rewritten as the product
changes; a principle only goes when the product stops behaving that way, and
then its cases go with it and the diff says which behaviour was dropped.

## Run it

```bash
cd apps/agent
uv run python evals/run.py --list                # the principles and their counts, no model
uv run python evals/run.py --principle 13        # one principle, by number or slug
uv run python evals/run.py --surface classify    # every case on one surface
uv run python evals/run.py --case date-the-20th  # one case
uv run python evals/run.py                       # everything
uv run python evals/run.py --write-baseline      # everything, and rewrite evals/BASELINE.md
uv run python evals/run.py --model file=claude-opus-5   # try another model on one surface
```

Needs `ANTHROPIC_API_KEY` in the environment. Every run writes
`evals/results/<stamp>-<scope>.json` with every case's transcript, and that
directory is not committed.

**Cost.** A filing or answering case is one to four model calls plus one judge
call when it has a rubric. Classify, judge and compaction cases are one small
call each. The whole set is about 450 cases and takes around ten minutes at
ten in parallel. Say what a run will cost before starting a full one; prefer
`--principle` while iterating.

**Models are production's**, read from `Config` in the agent: filing and quick
add on the sort tier's bigger sibling, answering on the reasoning tier, classify
and judge and compaction on the sort tier. `--model surface=id` overrides one
surface for a comparison and the record names what ran.

## Six surfaces

One per model call the product makes. Each runs the real prompt assembly and
the real loop with every tool answered from the fixture, so a case exercises
the code path a real turn takes up to the Core API boundary.

| surface | what runs | input | what a case can assert |
| --- | --- | --- | --- |
| `file` | `plan` with the filing prompt | a dump | `filed` matchers, `say`, `asks`, `look_up`, `called`, `not_called`, `creates_thread`, `rubric` |
| `answer` | `plan_answer` | a question | `reply`, `contains`, `must_not_contain`, `max_words`, `asks`, `look_up`, `rubric` |
| `classify` | `classify` | a message | `routes`: `answer` or `file` |
| `quick_add` | `plan_quick_add` | typed text | `untouched`, `edit`, `adds`, `title_keeps`, `rubric` |
| `judge` | `judge_answer` | a typed reply to an open question | `answers`, `whole`, `value` |
| `compact` | the compaction call | a list of notes | `no_change`, `folds`, `supersedes`, `never_touches`, `adds`, `rubric` |

Every surface also gets the checks that hold everywhere: no dash in anything
offload writes, no emoji, no capitalised offload, no self diagnosis, and on a
lookup the 017 rules for the progress line. `run.py`'s docstring and the
`_run_*` functions are the reference for the keys; the principle files are
the examples.

## Reading a run

Every failure prints the input, the transcript of tool calls, what was said,
and the check that failed. **Read each one against the transcript before
believing it.** From the first runs of the older sets, about half the failures
were the case rather than the model: a rubric that forbade what another case
required, a fixture silent about a tool the model reached for, a question
about a field the product does not store. Two questions per failure:

- Is the turn actually wrong, by the principle's statement?
- Does this case contradict another case in the set?

Correct the case when it is the case. Then read what survives for agreement
across cases: a failure with company is a rule, a failure alone is noise or
a case for the pending list.

## Cases still waiting for a label

A case carrying `label_pending` states a guess at the right behaviour and
the question that has to be settled before it counts. It is skipped unless
`--include-pending` is passed. Settle it with Behrooz, then delete the field.
Do not tune a prompt towards a pending case.

## When a feature changes what the model does

**Every feature that touches a prompt, a tool the model calls, or what a
person reads back adds to this set before it is done.** In `/implement` and
`/tweak` this is a step, not a suggestion.

- New behaviour that no principle describes: add a principle file, next number,
  with ten to twenty cases including the negatives, and run it.
- Behaviour a principle already describes: add cases to it. If the change
  makes an existing case wrong, that case is either rewritten or deleted in the
  same commit, and the commit message says which principle moved.
- A change to a prompt: run the principles that name that prompt in `sources`
  before and after. The before number is the baseline; the after number is the
  result; both go in the decision log entry.

## Tuning a prompt

`/test-llm` is the loop for that: name the behaviour, write fresh cases, change
the prompt only where failures agree, then measure on a held-out set never
tuned against. The held-out set lives in `evals/holdout/` in the same case
shape, is run with `--holdout <file>`, and is folded into the principle files
once the change lands, where it becomes regression.

## Where things live

- `apps/agent/evals/run.py`: the harness, never the cases.
- `apps/agent/evals/principles/`: the principles and their cases.
- `apps/agent/evals/contexts/`: the shared fixtures.
- `apps/agent/evals/BASELINE.md`: the last full run, regenerated by `--write-baseline`.
- `apps/agent/evals/history.jsonl` and `HISTORY.md`: every run ever made, one
  line each, appended by the runner and committed. Pass `--note "why"` so the
  row says what the run was for. Compare over time here, not in `results/`.
- `apps/agent/evals/README.md`: the case and context shapes in full.
- `apps/agent/tests/test_answer_behaviour.py`, `test_truthfulness.py`: the
  handful of behaviours promoted to `OFFLOAD_EVAL` tests. A case is a
  measurement; a test is a promise.
