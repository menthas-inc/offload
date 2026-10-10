export const meta = {
  name: 'swarm-tuning-ideate',
  description: 'Seven read-only lenses over offload model calls, each proposing cost and latency hypotheses',
  phases: [{ title: 'Ideate', detail: 'one lens per agent, no model calls' }],
}

// args: { repo, baselineSummary, lenses: [{key, prompt}] }
const HYPOTHESES = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          lever: { type: 'string', description: 'caching | effort | model | prompt | structure | output | eval' },
          change: { type: 'string', description: 'what to change, concretely, in two to four sentences' },
          files: { type: 'array', items: { type: 'string' } },
          surfaces: { type: 'array', items: { type: 'string' } },
          expected_cost: { type: 'string', description: 'direction and rough size per affected surface' },
          expected_latency: { type: 'string' },
          principles_at_risk: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string', description: 'what in the code, the baseline or the research says this will pay' },
          effort: { type: 'string', description: 'small | medium | large' },
          independent_of: { type: 'string', description: 'which other levers this composes with cleanly' },
        },
        required: ['title', 'lever', 'change', 'files', 'surfaces', 'expected_cost', 'expected_latency', 'principles_at_risk', 'evidence', 'effort'],
      },
    },
    not_worth_it: { type: 'array', items: { type: 'string' }, description: 'levers in this lens you looked at and rejected, with why' },
  },
  required: ['lens', 'hypotheses', 'not_worth_it'],
}

phase('Ideate')
const results = await parallel(
  args.lenses.map((lens) => () =>
    agent(
      `You are the ${lens.key} lens in the ideation phase of a swarm tuning offload's model calls for cost and latency. Read ${args.repo}/docs/experiments/2026-10-swarm-tuning/README.md and BRIEF.md first (the rules), then ${args.repo}/docs/experiments/2026-10-swarm-tuning/research-prompt-optimisation.md for the evidence base.

Read only. Do not edit anything. Do not run evals/run.py (it calls the real model). You may run --list, read code, read prompts, read evals/results/*.json baseline records named below, and run small scripts that read files.

Baseline, measured on the unchanged app:
${args.baselineSummary}

Your lens: ${lens.prompt}

Propose up to six hypotheses in this lens, ranked by expected payoff per effort. Each must be concrete enough that a worker with no other context can implement it in one session: name the files, the exact parameter or passage, and the surfaces it touches. Ground the expected effect in the baseline numbers (tokens per call, calls per case, cache reads, latency) and say which principles' cases would catch a regression. Prefer levers that compose with other lenses' levers. Name what you rejected and why. Return the structured result only.`,
      { label: `ideate:${lens.key}`, phase: 'Ideate', schema: HYPOTHESES },
    ),
  ),
)
return results.filter(Boolean)
