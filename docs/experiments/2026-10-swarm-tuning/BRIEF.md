# Brief for every swarm agent

You are one agent in a swarm tuning offload's model calls for cost and
latency without losing eval accuracy. Read `README.md` beside this file for
the shape of the run. This file is the rules. They are short because each one
has cost real time in this repo.

## Where you work

- **Only in the worktree you were given.** Never the main checkout, never
  another worktree. Every path you touch starts with your worktree's path.
- **Only under `apps/agent/`.** Prompts in `src/offload_agent/prompts/`, the
  harness in `src/offload_agent/harness/`, `config.py`, `worker.py`,
  `context.py`, the small call modules, and `evals/`. Nothing else: not the
  Core API, not the clients, not `docs/tech`, not the design system.
- **Never commit, never push, never stash.** Your candidate is the working
  tree. A `git commit` here runs a gate that truncates a shared database.
- **Never run `pnpm`.** The agent's suite is `uv run pytest`.
- **Say what you touch.** `python3 .claude/scripts/board.py as <your name>`
  once, then `board.py say "claimed: <files>"` before your first edit and
  `board.py say "done: <files>, interface changed: <yes or no>"` after
  RESULT.md. The lead reads the board before composing; two candidates that
  changed one function's signature are found there, not in a merge.

## What you may run

- Unit tests: `cd apps/agent && uv run pytest -q -p no:cacheprovider --ignore-glob='tests/*_db.py'`.
  The `_db` tests write to a shared database and are not yours.
- Evals, only with your spend environment sourced first, every time:
  `source ~/.offload-swarm/<your name>.sh`. Then, from `apps/agent`:
  - `uv run python evals/run.py --subset block1 --concurrency 4 --note "<what changed>"`,
    once. Block1 is thirty cases, about $0.60, a few minutes. It is the
    first block of a race: the lead's pool buys block2 and block3 for a
    candidate the gate keeps, so you do not.
  - `uv run python evals/prefix.py --against ~/.offload-swarm/prefix-base.json`
    before block1: no model, a second. A prefix that grew when your change
    is only prompt or tool text is a refusal; report it and stop.
  - `uv run python evals/run.py --principle <N> --concurrency 4 --note "..."`
    for a principle your change touches, to read failures. Prefer this to
    the screen while iterating; a principle is $0.10 to $1.
  - Always `--concurrency 4`: a dozen workers share one API rate limit.
  - `uv run python evals/compare.py <base block1 record> <your record> --paired`
    to read a run. The `paired` line is your accuracy against the history of
    every run of those cases, in standard errors; the `gate` line is the
    verdict. One base run is the cost and latency reference only.
- **Never** `--subset screen`, `block2`, `block3` or `holdout`, never the
  full set, never `--runs 3`, never `--live`. Never open
  `evals/subsets/holdout.json`. Your cap is $1.60 and the runner refuses
  past it; a refusal is the end of your eval budget, not a thing to work
  around.

## What counts

- **Red before green** holds for code. A harness or config change gets a unit
  test that fails first. A prompt change is measured, not unit tested.
- **A failure is a claim about the reply.** Read every eval failure against
  its transcript before believing it. About half turn out to be the case.
  Correct a case only when it is wrong by its principle's statement, say so
  in your result, and never weaken a case your change fails.
- **Do not tune a prompt towards one case.** A change that fixes one case is a
  patch; a change that fixes four is a rule. Never write a case's words into
  a prompt.
- **A lever that does not help is a finding.** Report it with the numbers.
  You were handed a hypothesis, not a conclusion.
- **Models.** Before changing a model id, effort, thinking or `max_tokens`,
  invoke the `claude-api` skill and read its migration notes for the model
  you are moving to. Haiku 5.5, Sonnet 5.5 and Opus 5.5 differ from their
  predecessors in forced `tool_choice`, thinking defaults, effort defaults
  and cache read prices. Every price you use comes from that skill, never
  from memory.
- **Caching.** A change that touches the system prompt, the tool list or the
  block order changes the cache prefix. Check `cache_read_tokens` in your
  record before and after; a drop there is a cost you caused.

## Every word a prompt says

offload's copy rules apply to anything the model will read or write: no em or
en dashes anywhere (the repo's gate refuses the characters), sentence case,
lowercase offload, no emoji, and the vocabulary in `CLAUDE.md`: thread, note,
connection, dump, sorted; never folder, item, space, project, capture,
classified, thing. Short, friendly, not emphatic, not apologetic.

## What you hand back

1. `RESULT.md` at the root of your worktree, under 600 words:
   - the hypothesis in one sentence and what you actually changed;
   - the disconfirming test you were given, as run, its number against the
     threshold;
   - the numbers: block1 as `compare.py --paired` printed it, the prefix
     ratio, and any principle runs, with the record file names;
   - every eval case you changed, with the reason;
   - what you learned, including what did not work;
   - risks you see for production that the evals cannot show.
2. The patch: from your worktree root,
   `git add -N . && git diff > candidate.patch` (so new files are in it).
3. The structured result the task asks for.

Be fast. Read the files your lever touches, not the repo. Four to six tool
calls of orientation is plenty. Finish inside your cap and stop.

## Learned the hard way, so it is here

- If the session's permission system refuses an eval command, write
  RESULT.md with the exact commands and stop. The lead runs them under your
  spend name. Do not retry and do not route around it.
- Read a record only with `--paired --prompts <the base hashes in your
  brief>` and `--surface <yours>` when your change touches one surface. A
  read against your worktree's own log at the newest hash is your own run
  read against itself.
- Your one-sentence statement in RESULT.md says what the patch does, not
  what the hypothesis hoped. A blind skeptic refuses the gap between them.
- A probe (`--model surface=id`, no code change) is a complete result. If
  your hypothesis is a model, run the probe before writing a line.
- Never a rubric's sentence in a prompt, never a rule aimed at one case:
  both are refused on sight, and the second moves the whole surface.
