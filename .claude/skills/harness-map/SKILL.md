---
name: harness-map
description: Regenerate "One turn through offload", the page that shows the LLM harness as built: the sequence of a dump turn, the model loop, the prompt as sent, the tools per path, the models and bounds, where a person can be asked, and every prompt's full text colour coded by what it does. Use before changing the agent, the prompts or the turn's wire contract, and after, so the picture matches the code.
---

# The harness map

One HTML page, published as a private artifact, that a person can read cold and
come away knowing how a dump moves through offload. It exists because the
picture lives in six files across three services and nobody holds all of it.

## Build it

```bash
node .claude/skills/harness-map/build.mjs
```

Writes `docs/tech/harness-map.html`. Pass `--out <path>` to write elsewhere.
Then publish it with the Artifact tool against the existing page, so the link
people have keeps working:

- URL: `https://claude.ai/artifact/Gc4pAQ8BqkkjEXfuQxVcDg`
- pass that as `url` from any session; a publish without it makes a second page.

## What the build regenerates on its own

Read from the repository every run, so these are never stale:

- the section bar of `plan_v2.md`, proportional to word count, coloured by what
  each section is for
- section 7, every prompt's full text, coloured by section (prompts with
  headers) or by passage (prompts without, judged by the words in it: the
  legend says so)
- the models table and the bounds table, from the constants in `config.py`,
  `harness/plan.py`, `worker.py`, `reader.py`, the `turn-step` schema and
  `Composer.tsx`
- every number quoted in the prose and the figures that comes from one of those
  constants, the date, and the commit

If a placeholder is left unfilled the build fails and says which. If a constant
moves, fix the regex in `build.mjs` rather than the number in the template.

## What is hand drawn, and what to re-read before trusting it

`template.html` holds four inline SVG figures and two tables that describe the
shape of the code, not its numbers. Each has a source of truth. When that file
changes, read it whole and redraw what moved; do not patch a label.

| Figure or table | Read this |
| --- | --- |
| Fig 1, one turn end to end | `worker.py` `handle` and `_handle_answer`; `dumps.ts` the `/v1/dumps` route and the stream; `internal.ts` `turn-step` and `turn-result` |
| Fig 2, the loop | `harness/plan.py` `_run`, `Outcome.finished`; `worker.py` `_partial_reply`, `_stopped` |
| Fig 3, the user turn blocks and the tools column | `harness/plan.py` `build_blocks`, `build_answer_blocks`, `plan`, `plan_answer`; `harness/tools.py` `TOOLS`, `ANSWER_TOOLS`, `CALENDAR_TOOL_DEFS`, `LOOK_UP_TOOL`, `SAY_TOOL` |
| Section 4, tools by path | `harness/tools.py` `SCHEMAS` and the `_DESCRIPTIONS` dict; `worker.py` `_tool_caller` for where each runs |
| Fig 4, the write that waits | `routes/tools.ts` the `waitingForThem` result; `connectors.ts` `/api/calendar/pending/:id/:answer`; `Composer.tsx` the waiting control |
| Section 6, where a person can be asked | the four cards name their mechanism; check each still exists |

The quickest check is the diff since the commit stamped on the page:

```bash
git log --oneline <commit>..HEAD -- apps/agent apps/core-api/src/routes apps/web/src/components/shell
```

Anything in that list touching one of the files above means the matching figure
is read again, whole, before the page is republished.

## Colouring

Five colours, and they mean the same thing in every figure and in section 7:

- moss: the work, and our own data being written or stated as true
- amber: reaching the web, and the bounds the code puts on it
- blue: the person's side, what they wrote and what they see
- clay: refusals and failure
- grey: the frame, who the model is and what counts as data

`build.mjs` holds the two rule lists, `HEADER_MAP` for prompts with headers and
`PARAGRAPH_MAP` for prompts without. A new section that lands in the wrong
colour is fixed by adding a word to the list it should have matched, not by
editing the output.

## When to run it

- before a change to `apps/agent/src/offload_agent/prompts/`, to see what the
  change sits inside, and after, to see what it did to the mix
- before a spec that adds a tool, a model call or a way for a person to answer
  the model: section 6 is the list of what exists
- when somebody asks how the LLM call works today

The page is the answer to "what does the model actually see". Prose about it
that disagrees with the page is wrong or the page is stale, and the commit at
the top says which.
