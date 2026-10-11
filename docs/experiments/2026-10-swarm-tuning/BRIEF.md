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

## What you may run

- Unit tests: `cd apps/agent && uv run pytest -q -p no:cacheprovider --ignore-glob='tests/*_db.py'`.
  The `_db` tests write to a shared database and are not yours.
- Evals, only with your spend environment sourced first, every time:
  `source ~/.offload-swarm/<your name>.sh`. Then, from `apps/agent`:
  - `uv run python evals/run.py --subset screen --concurrency 4 --note "<what changed>"`,
    at most twice. The screen is about $1.30 and takes a few minutes.
  - `uv run python evals/run.py --principle <N> --concurrency 4 --note "..."`
    for a principle your change touches, to read failures. Prefer this to
    the screen while iterating; a principle is $0.10 to $1.
  - Always `--concurrency 4`: a dozen workers share one API rate limit.
  - `uv run python evals/compare.py <baseline record> <your record>` to read
    a run against the baseline. The baseline records are named in your task.
- **Never** `--subset holdout`, never the full set, never `--runs 3`, never
  `--live`. Never open `evals/subsets/holdout.json`. Your cap is $3 and the
  runner refuses past it; a refusal is the end of your eval budget, not a
  thing to work around.

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
   - the numbers: screen before and after, and any principle runs, as
     `compare.py` printed them, with the record file names;
   - every eval case you changed, with the reason;
   - what you learned, including what did not work;
   - risks you see for production that the evals cannot show.
2. The patch: from your worktree root,
   `git add -N . && git diff > candidate.patch` (so new files are in it).
3. The structured result the task asks for.

Be fast. Read the files your lever touches, not the repo. Four to six tool
calls of orientation is plenty. Finish inside your cap and stop.
