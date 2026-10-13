export const meta = {
  name: 'swarm-tuning-seeds',
  description: 'Blind skeptics over seeded candidates with known verdicts, to measure false rejection and false acceptance per round',
  phases: [{ title: 'Seeds', detail: 'one blind skeptic per seeded candidate, same brief as the real ones' }],
}

// args: { round, worktree, prompts, baseline, seeds: [{name, dir, statement}] }
// `dir` holds candidate.patch and results/ from an earlier run; `worktree` is
// a checkout at the base those patches apply to; `prompts` is that base's
// prompts hash, for the paired read. The skeptic is told nothing of the
// known verdict. The same SKEPTIC schema as try.js.
const SKEPTIC = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    eval_tampering: { type: 'string', description: 'none | suspect | confirmed, with the case ids' },
    production_risks: { type: 'array', items: { type: 'string' } },
    privacy_policy_touched: { type: 'boolean' },
    measured: { type: 'string', description: 'what the records say, as you computed it with compare.py --paired' },
    keep: { type: 'boolean' },
    why: { type: 'string' },
    flip_condition: { type: 'string' },
  },
  required: ['name', 'eval_tampering', 'production_risks', 'privacy_policy_touched', 'measured', 'keep', 'why', 'flip_condition'],
}

phase('Seeds')
const verdicts = await parallel(
  args.seeds.map((s) => () =>
    agent(
      `You are a skeptic reviewing a candidate change to offload's model calls. The code it applies to is checked out at ${args.worktree}; the candidate is ${s.dir}/candidate.patch with its eval records under ${s.dir}/results/. Read only; change nothing; run no evals. You are told the hypothesis and nothing of what its author concluded: ${s.statement}

Measure for yourself: from ${args.worktree}/apps/agent, \`uv run python evals/compare.py ${args.baseline} <each record under ${s.dir}/results/, one at a time; a screen record if there is one, else the principle records> --paired --prompts ${args.prompts}\` (no model is called; it reads records and the committed history). Then try to refute the change. In particular: did any eval case get weaker in a way that makes the change pass (compare each changed case against its principle's statement in evals/principles); would the change behave differently in production than in the eval (cold versus warm cache, a tool the stub answers that production would not, a model parameter the eval does not exercise); does it touch what the privacy policy claims; does it break offload's copy rules in any prompt text (dashes, sentence case, vocabulary); does the patch do what the hypothesis says and nothing else. A refusal must name the condition that would flip it and must be reproducible from the records. Default to keep=false if you are unsure. Return the structured verdict only.`,
      { label: `seed:${s.name}`, phase: 'Seeds', schema: SKEPTIC, agentType: 'code-reviewer', model: 'fable' },
    ).then((v) => ({ seed: s.name, verdict: v })),
  ),
)
return verdicts.filter(Boolean)
