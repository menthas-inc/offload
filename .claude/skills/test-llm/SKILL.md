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

**4. Prove every case is answerable, before spending a run on it.** Two checks,
both cheap, and skipping either buys a round of confident nonsense.

- **Does the data exist?** Open the real return type of whatever tool answers the
  question, `AccountFacts` in `apps/core-api/src/search/read.ts`, the tool result
  shapes in `routes/tools.ts`, and confirm the field you are asking about is in
  it. A case asking which calendars are read only scores the fixture, not the
  reply, because that field is not there to read.
- **Can the harness answer every tool the model might reach for?** The fixture
  answers `account_facts`, the three reads and `list_calendars`. A question the
  model answers with some other tool falls through to an empty result, and the
  reply that comes back is an honest answer about nothing. That is
  indistinguishable from a real defect and will survive several rounds looking
  like one.

The tell for both: a reply that is confidently negative. "None." and "You have
none connected" are almost never the model being wrong, and almost always the
fixture being silent.

**5. Run, in parallel.** `uv run python evals/run_eval.py evals/cases/<set>.json`

**6. Read every failure against the reply it is about, before believing any of
them.** A failure is a claim about the reply and roughly half of them will turn
out to be claims about your own rubric. Two questions per failure:

- **Is the reply actually wrong?** One run marked down "The Alfama flat, 14th to
  the 17th" for naming the flat, and another marked down a reply for saying
  "(read only)", which is context that changes what somebody can do and which a
  different case in the same set required keeping.
- **Do two of my own rubrics disagree?** If one case forbids what another
  requires, the rule underneath is not decided yet, and no amount of prompt
  editing will settle it.

Correct the rubric and rerun. **Tuning a prompt against a bad rubric makes the
product worse while the number goes up**, which is the one failure mode of this
whole exercise that does not announce itself.

**7. Then read the surviving failures for agreement, and change only that.** A
change that fixes one case is a patch; a change that fixes four is a rule. If a
failure has no company, write it down and leave it: either it is noise, or the
next round will produce its siblings.

**Never write the example into the prompt.** "Do not say P\*\*B" is not a rule.
"Do not name the ones that failed the test they set" is.

**8. Generate a fresh set and run that.** New cases in the same categories,
written without looking at the first set, and never tuned against. **This number
is the result.** The tuning set only says the change did something.

**9. Report both numbers.** Tuning before and after, held-out after. If held-out
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

## Where these rules came from

The first run of this skill, on a brevity change, in case the reasoning above
reads as fussier than it is.

Thirteen cases, four failures on the first pass. **Two were the rubric**, one
was a case asking about a field the product does not store, and one was real.
The real one only became a rule when the same failure turned up in an
independent set: "a question about one side of a pair is not a question about
the pairing", which no single case would have suggested.

A fifth failure looked like a wrong answer for two full rounds, in two separate
sets, before turning out to be the harness not knowing about `list_calendars`.

Final: tuning 69% to 92%, first holdout 85% to 92%, second holdout 100%. Two
failures were left standing because they were measurement rather than
behaviour, and tuning on a holdout spends it.
