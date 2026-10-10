export const meta = {
  name: 'swarm-tuning-try',
  description: 'One worker per hypothesis in its own worktree: implement, screen, report; then a skeptic per candidate',
  phases: [
    { title: 'Try', detail: 'one worker per hypothesis, own worktree, $3 eval cap' },
    { title: 'Skeptic', detail: 'one read-only reviewer per candidate' },
  ],
}

// args: { repo, round, findingsPath, baseline: {screen, screen2, full}, workers: [{name, worktree, hypothesisPath}] }
// `findings` is the condensed FINDINGS.md of the rounds before; a round two
// worker starts from the composite of round one, applied to its worktree.
const RESULT = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    implemented: { type: 'boolean' },
    summary: { type: 'string', description: 'what changed, two to four sentences' },
    screen_record: { type: 'string', description: 'results/<file>.json of the screen run, or empty' },
    screen_accuracy_before: { type: 'number' },
    screen_accuracy_after: { type: 'number' },
    cost_ratio: { type: 'number', description: 'after over before, product cost on the screen' },
    warm_cost_ratio: { type: 'number' },
    latency_ratio: { type: 'number', description: 'after over before, median case latency' },
    verdict: { type: 'string', description: 'better | same | worse, as compare.py printed it' },
    principle_runs: { type: 'array', items: { type: 'string' }, description: 'record files of principle runs' },
    eval_changes: { type: 'array', items: { type: 'string' }, description: 'case id: reason, one per changed case' },
    spent_usd: { type: 'number' },
    recommend: { type: 'string', description: 'keep | drop | keep-with-caveat' },
    caveats: { type: 'string' },
    learned: { type: 'string', description: 'what this taught about the lever, including what did not work' },
  },
  required: ['name', 'implemented', 'summary', 'verdict', 'eval_changes', 'spent_usd', 'recommend', 'learned'],
}

const SKEPTIC = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    eval_tampering: { type: 'string', description: 'none | suspect | confirmed, with the case ids' },
    production_risks: { type: 'array', items: { type: 'string' } },
    privacy_policy_touched: { type: 'boolean', description: 'true if a new company receives content, a retention window moves, or a log starts carrying content' },
    numbers_add_up: { type: 'boolean', description: 'the RESULT.md numbers match the record files' },
    keep: { type: 'boolean' },
    why: { type: 'string' },
  },
  required: ['name', 'eval_tampering', 'production_risks', 'privacy_policy_touched', 'numbers_add_up', 'keep', 'why'],
}

const tried = await pipeline(
  args.workers,
  (w) =>
    agent(
      `You are swarm worker "${w.name}". Your worktree is ${w.worktree}. Work only there. Read ${w.worktree}/docs/experiments/2026-10-swarm-tuning/BRIEF.md first and follow it to the letter; it is short.

This is round ${args.round}. ${args.round > 1 ? `Your worktree already carries the composite of the rounds before. Read ${args.findingsPath} before you start so you do not repeat a dead end or undo a win.` : `It is the first round. What the lead has noted so far is in ${args.findingsPath}; read it first.`}

Your hypothesis, from the ideation phase, is in ${w.hypothesisPath}. Read it in full: where several lenses proposed the same change, every proposal is there with its own reasoning, and you implement one coherent change from them.

Baseline records to compare against (copy them into your worktree's apps/agent/evals/results/ if compare.py needs them side by side):
- screen: ${args.baseline.screen} (${args.baseline.screenNote})
- full: ${args.baseline.full}

Before every eval run: source ~/.offload-swarm/${w.name}.sh. Your cap is $${args.cap} this round, enforced by the runner, which refuses a run that would pass it. Implement the hypothesis, run the unit suite without the _db tests, run the principles your change touches to read failures, then the screen once (twice only if the first was within the noise band and you changed something after). Read every failure against its transcript. Write RESULT.md and candidate.patch as the brief says. If the hypothesis turns out not to help, say so with the numbers; that is a complete result. Return the structured result only.`,
      { label: `try:${w.name}`, phase: 'Try', schema: RESULT, model: 'opus' },
    ),
  (result, w) =>
    result && result.implemented
      ? agent(
          `You are a skeptic reviewing swarm candidate "${w.name}" in ${w.worktree}. Read only; change nothing; run no evals. Read ${w.worktree}/RESULT.md, ${w.worktree}/candidate.patch, and the record files it names under ${w.worktree}/apps/agent/evals/results/. The worker's own claim: ${JSON.stringify(result)}. Its hypothesis is in ${w.hypothesisPath}.

Try to refute it. In particular: did any eval case get weaker in a way that makes the change pass (compare each changed case against its principle's statement in evals/principles); do the numbers in RESULT.md match the records; would the change behave differently in production than in the eval (cold versus warm cache, a tool the stub answers that production would not, a model parameter the eval does not exercise); does it touch what the privacy policy claims (a new company receiving content, a retention window, a log carrying content); does it break offload's copy rules in any prompt text (dashes, sentence case, vocabulary). Default to keep=false if you are unsure. Return the structured verdict only.`,
          { label: `skeptic:${w.name}`, phase: 'Skeptic', schema: SKEPTIC, agentType: 'code-reviewer', model: 'fable' },
        ).then((verdict) => ({ worker: w.name, result, verdict }))
      : { worker: w.name, result, verdict: null },
)
return tried.filter(Boolean)
