---
name: model-calls
description: Rebuild and republish "offload's model calls", the page that maps every model call offload makes (when it runs, what it reads, what it writes, its model) and shows each prompt split by what its words are for, with the owner's list of what to change about them. Use when the owner asks to see the model calls or the list, after changing a prompt, a model, a job's trigger or a tool, and whenever the model-calls hook says a model call changed.
---

# offload's model calls

One page, published as a private artifact, that answers "what does offload ask
a model to do, when, with what, and what is each prompt made of". Its last
section is the owner's list of open changes to those calls, and it is the list
they work from.

## Build it

```bash
node .claude/skills/model-calls/build.mjs
```

Writes `.claude/skills/model-calls/model-calls.html` (gitignored). `--out <path>`
writes elsewhere; `--check` builds without writing. Then publish it with the
Artifact tool against the existing page, so the link the owner uses keeps
working:

- URL: `https://claude.ai/artifact/ULMd4ezoD4bkQYAszGcGDS`
- pass that as `url` from any session; a publish without it makes a second page.

## It keeps itself current

- **Read from the code on every build:** every prompt as the worker assembles
  it, through `prompt_files.load` (includes and all); the model each call runs
  on, from `config.py`; token and word counts; the commit and the date.
- **The build fails, and names what, when the page has drifted:** a section
  anchor that no longer starts a section of its prompt, a prompt file under
  `prompts/` that no job on the page owns, segments that do not cover a prompt,
  a config field a job names that is gone, or a dash in the hand-written copy.
- **A hook rebuilds it** (`.claude/hooks/model-calls-refresh.sh`, PostToolUse on
  Write and Edit) whenever a prompt, `plan.py`, `look.py`, `tools.py`,
  `nightly.py`, `reader.py`, `worker.py`, `config.py`, `prompt_files.py` or the
  daily scheduler in `jobs/handlers.ts` changes. A failed build is fed back at
  once to be fixed in `jobs.mjs`; a passing one asks for a republish before the
  turn ends. A hook cannot publish: a session does, with this skill.

## What is hand-written, in `jobs.mjs`

- **Each job's facts:** lane, trigger, cadence, the call's shape, what it reads
  in order, what it produces, its bounds. Re-read the code they cite when one
  changes; the build cannot tell a stale sentence from a true one.
- **Each prompt's sections:** an anchor (`at`, the words a section starts with),
  an intent, a title and a note. A new section in a prompt needs a new entry,
  in order. Mark a shared part's note with the `SHARED` constant.
- **The map:** `LAYOUT` places each job. A new job needs a node, and an edge if
  it sits in the dump's sequence.
- **The list:** `FINDINGS`, each with a `status` of `open`, `handed` or `done`.
  When a change closes an item, set it done and say where; when review finds a
  new one, add it open. This is the owner's to-do list, so it is never left
  describing a world that has moved.

## Intents

Nine, coloured the same in every bar, strip and section: role and job, core
decisions, fields and formats, write limits, limits and refusals, web bounds,
asking back, reply and voice, trust boundary. A section takes the intent its
words mostly serve; the note says what else it does.

## Related

- `harness-map` is one dump turn in depth: the loop, the wire, the tools per
  path. This page is every call at once, and the list.
- `cost-report` prices the same calls.
- Changing a prompt is `/test-llm`; measuring is `/run-llm-tests`. Both cost
  money and need the owner's yes.
