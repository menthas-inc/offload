export const meta = {
  name: 'swarm-tuning-try',
  description: 'One worker per hypothesis in its own worktree: implement, screen, report; then a skeptic per candidate',
  phases: [
    { title: 'Try', detail: 'one worker per hypothesis, own worktree, block1 on its own stake' },
    { title: 'Skeptic', detail: 'one blind read-only reviewer per candidate' },
  ],
}

// args: { repo, round, cap, briefsDir, baseline: {block1}, workers: [{name, worktree, statement}] }
// The worker's brief file (briefsDir/<name>.md, written by the lead from
// hypotheses.json) carries the hypothesis, the disconfirming test and
// threshold, the non-goals, the exclusion list, the board lines and the
// records; the workflow passes only what the skeptic also needs.
// A worker sees only its own hypothesis and the titles of the other picks
// (so it does not drift into them); it is not shown the findings. The
// skeptic is blind: the patch, the records and the hypothesis statement,
// never the worker's recommendation, its lens or its RESULT.md.
const RESULT = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    implemented: { type: 'boolean' },
    summary: { type: 'string', description: 'what changed, two to four sentences' },
    block1_record: { type: 'string', description: 'results/<file>.json of the block1 run, or empty' },
    block1_passed: { type: 'number', description: 'cases passed of 30' },
    paired_z: { type: 'number', description: 'the z compare.py --paired printed' },
    cost_ratio: { type: 'number', description: 'after over before, product cost on block1' },
    warm_cost_ratio: { type: 'number' },
    latency_ratio: { type: 'number', description: 'after over before, median case latency' },
    prefix_ratio: { type: 'string', description: 'what prefix.py --against printed for the surfaces you touched, or unchanged' },
    disconfirming_outcome: { type: 'string', description: 'the disconfirming test as run, its number against the threshold' },
    gate: { type: 'string', description: 'kept | refused, as compare.py --paired printed it' },
    principle_runs: { type: 'array', items: { type: 'string' }, description: 'record files of principle runs' },
    eval_changes: { type: 'array', items: { type: 'string' }, description: 'case id: reason, one per changed case' },
    spent_usd: { type: 'number' },
    recommend: { type: 'string', description: 'keep | drop | keep-with-caveat' },
    caveats: { type: 'string' },
    learned: { type: 'string', description: 'what this taught about the lever, including what did not work' },
  },
  required: ['name', 'implemented', 'summary', 'gate', 'disconfirming_outcome', 'eval_changes', 'spent_usd', 'recommend', 'learned'],
}

const SKEPTIC = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    eval_tampering: { type: 'string', description: 'none | suspect | confirmed, with the case ids' },
    production_risks: { type: 'array', items: { type: 'string' } },
    privacy_policy_touched: { type: 'boolean', description: 'true if a new company receives content, a retention window moves, or a log starts carrying content' },
    measured: { type: 'string', description: 'what the records say, as you computed it with compare.py --paired: passed of 30, z, warm day ratio, latency ratio' },
    keep: { type: 'boolean' },
    why: { type: 'string' },
    flip_condition: { type: 'string', description: 'the one thing that would reverse this verdict: a measurement, a test, a change to the patch' },
  },
  required: ['name', 'eval_tampering', 'production_risks', 'privacy_policy_touched', 'measured', 'keep', 'why', 'flip_condition'],
}

const tried = await pipeline(
  args.workers,
  (w) =>
    agent(
      `You are swarm worker "${w.name}". Your brief is ${args.briefsDir}/${w.name}.md: read it first and follow it; it names your worktree, your hypothesis, the disconfirming test, the non-goals, the other workers' scope, the board lines, the records to compare against and the commands to run. Work only in your worktree. Return the structured result only.`,
      { label: `try:${w.name}`, phase: 'Try', schema: RESULT, model: 'opus' },
    ),
  (result, w) =>
    result && result.implemented
      ? agent(
          `You are a skeptic reviewing a candidate change to offload's model calls, in the worktree ${w.worktree}. Read only; change nothing; run no evals. You are told the hypothesis and nothing of what its author concluded: ${w.statement}

Read ${w.worktree}/candidate.patch and the eval records under ${w.worktree}/apps/agent/evals/results/ newer than ${w.worktree}/.env. Measure for yourself: from ${w.worktree}/apps/agent, \`uv run python evals/compare.py ${args.baseline.block1} <the candidate's block1 record> --paired\` (no model is called; it reads records and the committed history). Then try to refute the change. In particular: did any eval case get weaker in a way that makes the change pass (compare each changed case against its principle's statement in evals/principles); would the change behave differently in production than in the eval (cold versus warm cache, a tool the stub answers that production would not, a model parameter the eval does not exercise); does it touch what the privacy policy claims (a new company receiving content, a retention window, a log carrying content); does it break offload's copy rules in any prompt text (dashes, sentence case, vocabulary); does the patch do what the hypothesis says and nothing else. A refusal must name the condition that would flip it and must be reproducible from the records. Default to keep=false if you are unsure. Return the structured verdict only.`,
          { label: `skeptic:${w.name}`, phase: 'Skeptic', schema: SKEPTIC, agentType: 'code-reviewer', model: 'fable' },
        ).then((verdict) => ({ worker: w.name, result, verdict }))
      : { worker: w.name, result, verdict: null },
)
return tried.filter(Boolean)
