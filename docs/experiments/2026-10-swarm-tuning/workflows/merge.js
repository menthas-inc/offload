export const meta = {
  name: 'swarm-tuning-merge',
  description: 'One merge agent composes the surviving candidates, runs the sealed holdout and the full set, and writes the report',
  phases: [{ title: 'Merge', detail: 'one agent, holdout then full set, the report' }],
}

// args: { repo, worktree, baseline: {screen, full, holdout}, candidates: [{name, worktree, patch, result, verdict}], reportPath }
phase('Merge')
const report = await agent(
  `You are the merge agent of a swarm tuning offload's model calls for cost and latency. Your worktree is ${args.worktree}; work only there. Read ${args.worktree}/docs/experiments/2026-10-swarm-tuning/README.md and BRIEF.md first. You are the one agent allowed to run the holdout and the full set. Your spend environment is ~/.offload-swarm/merge.sh; source it before every eval run. Your cap is in it.

Baseline records (the unchanged app):
- screen: ${args.baseline.screen}
- holdout: ${args.baseline.holdout}
- full: ${args.baseline.full}

Candidates that survived the screen and the skeptic, in the lead's order of value (best first). Each has a patch, a RESULT.md and the skeptic's verdict:
${JSON.stringify(args.candidates, null, 2)}

Procedure:
1. Apply the candidates one at a time with \`git apply --3way <patch>\` in order. After each: run the unit suite (\`uv run pytest -q -p no:cacheprovider --ignore-glob='tests/*_db.py'\` from apps/agent). If a patch conflicts, resolve it by hand where the intent is clear and drop it where it is not, and say which.
2. After all compatible candidates are in, run the screen once and compare against the screen baseline. If the composed result is worse than the best single candidate's screen result by more than the noise band, bisect: remove the lowest-value candidate and rerun the screen, at most twice.
3. Run the holdout once (\`--subset holdout\`) and compare against the holdout baseline. A candidate set whose holdout delta is far below its screen delta is overfitted; identify the candidate responsible by reading which cases flipped, drop it, and run the holdout once more at most.
4. Run the full set once, with \`--note "swarm merge"\`. Compare against the full baseline.
5. Write ${args.reportPath}: under 1,200 words. Before and after on screen, holdout and full: accuracy, product cost, warm cost, median and p90 latency, a day's cost at the normal mix, per surface. What was kept, what was dropped and why, every eval case changed with its reason, the flakiest cases you saw, what the swarm taught about organising such a run (what the workers got right and wrong, where the budget went), and what you would try next. offload's copy rules apply: no dashes, sentence case.
6. Leave the composed working tree in place, uncommitted. Return the report text as your final output.`,
  { label: 'merge', phase: 'Merge' },
)
return report
