---
name: sweep
description: The repo sweep. A repo-wide review by a panel of sub-agents (seams between features, line-level code quality and security, the UI on web, iOS and Android, the privacy policy and terms against the code, the specs against the product), merged into one parallel worklist, implemented by a second fan-out, reviewed as one diff and opened as one PR. Use when the SessionStart nudge or `.claude/scripts/sweep_due.py check` says a sweep is due, or when the owner asks for one. Runs only in its own worktree.
---

# The sweep

Features land here at about five merges a day, each one reviewed alone. What no
single review sees is the space between them: a table added after the export was
written and never taught to it, a response field the web reads and the phone
renames, a privacy line that was true before a vendor was added. The sweep looks at the whole repository at
once, fixes what it can, and hands the owner the few calls that are theirs.

It is the 2026-09-22 security review made repeatable and widened to five lanes.
That document is the bar for what a lane's checklist looks like.

**When.** `python3 .claude/scripts/sweep_due.py check` measures what merged since
the last sweep (lines, lines in risky paths, merges, days) against thresholds
tuned to this repo's pace. The SessionStart hook runs the same check on the main
checkout and, once a day, asks the session to flag it. The thresholds and the
risky paths are constants at the top of that script; change them there, the tests
read them. The harness's own tests: `python3 .claude/scripts/test_sweep_due.py` and
`node --test .claude/workflows/test-sweep-workflows.mjs`, which dry-runs both
workflows against stubbed agents.

**Cost.** About twenty to forty sub-agents: nine reviewers, one or two verifiers
per serious finding, two or three per work package, three on the final diff. Say so before Phase 2 if
the owner has not already said go.

## Rules for the whole run

- **Only in a sweep worktree.** If this session's checkout is the main one, stop and
  say: `.claude/scripts/new-worktree.sh sweep-<date>`, then /sweep in a session there.
  The branch name has `sweep` in it; that is what keeps the nudge quiet while it runs.
- **Shared state is the exception that proves the rule.** The sweep is the one
  worktree allowed to edit `docs/constitution/`, `docs/tech/` and
  `.claude/skills/offload-design/`, because its whole PR is reviewed as one. Say so
  on the board when it starts and keep those edits in one package the lead makes last.
- **The owner's calls wait, everything else proceeds.** An owner call is anything
  that makes a line of the privacy policy or terms untrue or changes their wording,
  changes what the product does for a person, cuts or rewrites a spec's intent, or
  edits CLAUDE.md. They go to the owner in one `AskUserQuestion` batch in Phase 3.
  Code, tests, comments and spec text that drifted from shipped behaviour are fixed
  without asking.
- **Red before green holds for every fix** (QUAL-1). A fix without a test that was
  seen failing for the finding's reason is not done.
- **No LLM evals.** If a fix touches a prompt or a tool, name the principles whose
  `sources` include it and ask in the Phase 3 batch. Never run them unasked.
- **No EAS cloud builds.** Devices run local builds, and are left as found.
- **Bound every output that reaches a model.** Suites and servers log to files in
  the scratchpad; read the summary, grep the file.
- **Everything the run writes follows the copy rules.** No em or en dashes in the
  report, the commits or the PR.

## Phase 0. Set up

1. `python3 .claude/scripts/board.py as sweep-<date>`, then
   `board.py say "sweep-<date>: repo sweep running in <worktree>. Reads everything,
   will edit shared docs in its own PR. Will hold suite, sim-<device> and pixel when
   it needs them."`
2. `python3 .claude/scripts/sweep_due.py check --json` gives `base` and `since`.
   Record `git rev-parse HEAD` as **reviewed**: every lane reviews that commit.
3. Write `<scratchpad>/sweep/scope.md`: the merges since base
   (`git log --first-parent --merges --format='%h %ad %s' --date=short <base>..HEAD`),
   the specs added or changed, `git diff --stat <base>..HEAD` grouped by area, the new
   migrations, and the previous sweep report's **Held** section, which is carried over.
4. Databases, the way a feature session makes them (memories: feature-session-loop,
   shared-test-database, agent-role-is-cluster-wide): `offload_sweep` for servers and
   devices, `offload_sweep_test` for the lead's suite. Only `create database`,
   `create extension vector` and `pnpm migrate`; never `pnpm agent:role`. Build the
   agent URL by swapping the database name in-process, and keep the pairs in
   `<scratchpad>/sweep/env-<name>.sh`. Never print a URL.

## Phase 1. Plan

Read `scope.md` and turn it into each lane's **focus**: the handful of places that
lane should start from, beyond its standing checklist in `lanes.md`. The seams
lanes get the pairs of merges that touched the same table, route, job kind or
component days apart; the code lanes get the risky paths that moved most; legal
gets every merge that added a vendor, a stored field, a log line or a retention
constant; product gets every spec touched and every spec whose code moved without
its spec moving.

Surface a decision only if one is real, in one `AskUserQuestion` call: a device
that is not connected, a lane worth skipping this time, an item under "Open,
needing a call" in `docs/tech/decisions.md` that a lane would otherwise report as
a defect. If there is none, do not ask.

## Phase 2. Review

Start the review fan-out in the background:

```
Workflow({ name: "sweep-review", args: {
  worktree, reviewed, base, since,
  focus: { "seams-data": [...], "seams-clients": [...], "code-core-api": [...],
           "code-agent": [...], "code-web": [...], "code-mobile": [...],
           "security": [...], "legal": [...], "product": [...] } } })
```

Each lane reads its brief in `lanes.md`, returns what it checked and found sound
plus its findings, and every finding rated medium or above is put to a skeptic who
tries to refute it before it comes back.

While that runs, the lead does the **functional lane** from `functional.md`. It
needs the servers, the simulator and the Pixel, which a sub-agent should not hold.

When the workflow returns, re-read the source yourself for every critical and
high finding before it goes in the report, as the security review did.

## Phase 3. Merge into a worklist

1. **Deduplicate by cause, not by line.** A seam finding and a code finding about
   the same contract are one item. Keep the clearest evidence and every lane that
   saw it.
2. **Sort every item into one of four:**
   - **fix**: the sweep fixes it.
   - **owner**: an owner call as defined above. All of them go in one
     `AskUserQuestion` batch now, each with the concrete options and a recommendation.
     An answer turns it into a fix or a hold.
   - **held**: real, but bigger than a sweep (a redesign, a new spec). Offer each as a
     `spawn_task` chip and list it under Held in the report, so the next sweep sees it.
   - **dropped**: refuted, or not worth the change. One line of why, in the report.
3. **Pack the fixes into work packages** the implement fan-out can run at once:
   - The file sets of two packages never overlap. Two fixes that touch one file are
     in one package. A package names its files up front.
   - One area per package, at most about eight findings, each with the test that will
     go red first and the suite that owns it.
   - Shared-state edits (`docs/constitution/`, `docs/tech/`, the design system) are
     one package the lead does last, by hand.
   - A package that depends on another's change goes in a second wave.
4. Write the worklist into the report draft (`report.md` is the template) before
   anything is implemented, so a dead session leaves the plan behind.

## Phase 4. Implement

1. For each package make `offload_sweep_<id>_test` and its env file, as in Phase 0.
2. Start the fix fan-out, one wave at a time:

```
Workflow({ name: "sweep-fix", args: { worktree, packages: [
  { id, title, area, files: [...], envFile, security, findings: [{ title, file,
    line, evidence, failure_scenario, fix, test }] } ] } })
```

   Each package is implemented red before green by one agent in the sweep worktree,
   touching only its files, committing nothing and starting no servers. Its diff is
   then reviewed by `code-reviewer`, or by `security-reviewer` when `security` is set
   because it touches authorization, content, crypto or secrets, and a second agent
   answers that review once.
3. After each wave: `git status --porcelain` lists only files some package owned. A
   file outside every set is a defect to look at, not to commit.
4. **Commit per package**, with the `suite` hold: `board.py hold suite "sweep:
   commit <id>"`, commit, `board.py release suite`. The gate runs the shared suite,
   so check the board first and never commit while another session holds it. The
   message names the findings it closes.

## Phase 5. Review the whole, and the PR

1. Run the `/review` panel on `<reviewed>..HEAD` (code, client, security in parallel,
   then the constitution pass yourself). Fix by pass, one commit per pass.
2. Re-run the functional journeys whose code changed, on every platform it touched.
3. **Lessons.** For each defect class that showed up twice, or that a mechanical
   check could have caught, write what would have caught it: a `dead-*.mjs` style
   script, a lint rule, a hook, a test helper. Small ones are built in this PR, red
   before green. A line for CLAUDE.md's "Things that have already gone wrong" is
   proposed in the report and the PR body, not written.
4. Finish `docs/sweeps/<date>.md` from `report.md`, and rewrite `docs/sweeps/last.json`
   as `{ "date", "reviewed", "report" }` with no `base`: the next measurement counts
   from the commit that lands this file.
5. Bring the branch up to date with `sync_with_base_branch`, run every gate in the
   worktree, push, `gh pr create --base main`, bind the PR. Do not merge it.
6. **Leave everything as found.** Stop the servers, remove the temporary launch
   entries from main's `.claude/launch.json`, restore every device setting, drop the
   per-package databases, release every hold, and post the PR link on the board.
   Give the owner the command that removes the worktree once the PR merges: while it
   exists the nudge stays quiet.

End with: the PR link, the owner calls and how each was answered, what was held,
and the counts by lane and severity. Nothing else.
