---
name: test-llm
description: Evaluate a change to offload's prompts against the real model. Writes cases, runs them in parallel, changes the prompt only where failures agree, then measures on held-out cases it has never tuned against. Use when changing anything in apps/agent/src/offload_agent/prompts/.
---

# Testing a prompt change

A prompt change is not done when three examples look right. Three examples is
how you learn what the rule should say; it is also how you write a rule that
fits three examples and nothing else. **This measures whether the rule
generalises**, and the only way to do that is on cases the rule has never seen.

## What this is for

Any change to `apps/agent/src/offload_agent/prompts/`. Brevity, refusals, tone,
what a reply may contain, when to reach for which tool. If the change is to
behaviour a person will read, it belongs here.

Not for code changes. Those have tests.

## The loop

**1. Name the behaviour in one sentence.** Not "make replies better". "The
answer is the reply, with nothing wrapped around it." If it cannot be said in a
sentence it is more than one change and it wants more than one run.

**2. Write the categories, then the cases.** Categories first, because cases
written without them cluster around whatever you happened to think of. Aim for
five or six categories that stress the rule differently, and three cases in each.
Vary what the account holds, not just what is asked: a rule that only works when
the fixture is tidy is not a rule.

**Include cases the rule should NOT change.** A brevity rule that shortens a
refusal into rudeness has failed, and only a case about refusals will say so.
Roughly a quarter of the set should be behaviour you are trying to preserve.

**3. Write the rubric with the case, before running anything.** The rubric is
what a good reply does, in a sentence or two, strict enough that a pleasant reply
breaking it fails. Writing it afterwards is writing it around the output you got.

Mechanical checks go beside it: `must_not_contain` for words that prove the
failure, `max_words` for a cap. Both kinds run, and a case passes only when both
agree, because short and useless should not score.

**4. Run, in parallel.** `uv run python evals/run_eval.py evals/cases/<set>.json`

**5. Read the failures for agreement, and change only that.** This is the step
the whole loop exists for. A change that fixes one case is a patch; a change
that fixes four is a rule. If a failure has no company, write it down and leave
it: either it is noise, or the next round will produce its siblings.

**Never write the example into the prompt.** "Do not say P\*\*B" is not a rule.
"Do not name the ones that failed the test they set" is.

**6. Generate a fresh set and run that.** New cases in the same categories,
written without looking at the first set, and never tuned against. **This number
is the result.** The tuning set only says the change did something.

**7. Report both numbers.** Tuning before and after, held-out after. If held-out
is much lower than tuning, the rule fits the cases rather than the behaviour, and
the honest move is to say so rather than to tune again on the held-out set,
which spends it.

## Writing a case

```json
{
  "cases": [
    {
      "id": "which-ones-two",
      "why": "a set of two, where a sentence would also have worked",
      "question": "which calendars are not connected to any threads?",
      "rubric": "Names both calendars and nothing else. No count in front, no lead-in sentence, and no mention of the calendar that IS connected.",
      "facts": { "calendars": [] },
      "must_not_contain": ["two:", "there are"],
      "max_words": 20
    }
  ]
}
```

- `facts` populates `account_facts`. `rows` populates the three reads. Whichever
  the model reaches for gets the fixture, so a case measures the reply rather
  than the tool choice.
- `threads` is optional and defaults to three ordinary ones.
- `why` is for the report, so a failure is legible six weeks later.

## What the numbers mean

**Under 70% on held-out**: the rule is not landing. Read the failures for a
second rule hiding inside the first.

**Held-out much below tuning**: overfitted. Usually because a case name or a
distinctive phrase reached the prompt.

**100% on both**: suspect the cases before believing the number. Either they are
too easy or they are all the same case. Add a category that should fail.

**A case that fails every round for a different reason** is a badly written
rubric, not a stubborn model.

## Cost, and being straight about it

Every case is one answer call plus one judge call. Twenty cases twice over is
around eighty calls. Say what a run will cost before starting a big one, and
prefer more categories over more cases per category: the categories are what
find things.

## Where things live

- Harness: `apps/agent/evals/run_eval.py`. It knows how to run and count, never
  what is being tested.
- Cases: `apps/agent/evals/cases/*.json`. Keep the held-out set beside the
  tuning set with `-holdout` in the name, so the next person can see which was
  which and does not tune on the wrong one.
- Behaviour worth keeping forever graduates into
  `apps/agent/tests/test_answer_behaviour.py` as an `OFFLOAD_EVAL` test. A case
  file is a measurement; a test is a promise.

## What the first run of this found

Recorded because each one cost a round and each will happen again.

**Two of the first four failures were the rubric, not the model.** One marked a
reply down for saying "(read only)", which is context that changes what somebody
can do and which another case in the same set required keeping. Another marked
down "The Alfama flat, 14th to the 17th" for naming the flat. **Read a failure
against the reply before believing it**: a rubric written in five seconds fails
good answers, and tuning a prompt against it makes the product worse.

**A case must be answerable before it measures anything.** Three cases asked
which calendars were read only. `AccountFacts` has no such field, so the model
could not have answered and the run was scoring the fixture. Check the real shape
of whatever the tool returns before writing the case, not after.

**The fixture has to answer every tool the model can reach for.** A count
question came back "None." twice across two independent sets, which looked
exactly like a real defect. The model was calling `list_calendars`, which the
harness did not know about, so it got nothing and said so honestly.

**Agreement is the signal, and it is worth waiting for.** One failure was a
patch; the same failure in two sets was a rule. The rule that came out of it,
"a question about one side of a pair is not a question about the pairing", is
not something any single case would have suggested.
