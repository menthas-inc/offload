export const meta = {
  name: 'swarm-tuning-ideate',
  description: 'Read-only lenses over offload model calls, each proposing cost and latency hypotheses for this round',
  phases: [{ title: 'Ideate', detail: 'one lens per agent, no model calls' }],
}

// args: { repo, round, baselineSummary, findings, lenses: [{key, prompt}] }
// `findings` is the condensed FINDINGS.md of the rounds before, or empty on round one.
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
          evidence: { type: 'string', description: 'what in the code, the baseline, the findings or the research says this will pay' },
          builds_on: { type: 'string', description: 'which earlier finding or candidate this refines, combines or corrects; empty if new' },
          effort: { type: 'string', description: 'small | medium | large' },
          independent_of: { type: 'string', description: 'which other levers this composes with cleanly' },
        },
        required: ['title', 'lever', 'change', 'files', 'surfaces', 'expected_cost', 'expected_latency', 'principles_at_risk', 'evidence', 'builds_on', 'effort'],
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
      `You are the ${lens.key} lens in the ideation phase of round ${args.round} of a swarm tuning offload's model calls for cost and latency. Read ${args.repo}/docs/experiments/2026-10-swarm-tuning/README.md and BRIEF.md first (the rules), then ${args.repo}/docs/experiments/2026-10-swarm-tuning/research-prompt-optimisation.md for the evidence base.

Read only. Do not edit anything. Do not run evals/run.py (it calls the real model). You may run --list, read code, read prompts, read the baseline records named below, and run small scripts that read files.

Baseline, measured on the unchanged app:
${args.baselineSummary}

${args.findings ? `What the rounds before this one found. Build on it: refine what worked, combine what composes, drop what was tried and did not pay unless you can say what was wrong with the attempt.\n\n${args.findings}` : 'This is the first round. Nothing has been tried yet.'}

Your lens: ${lens.prompt}

Propose up to ${args.round > 1 ? 'four' : 'six'} hypotheses in this lens, ranked by expected payoff per effort. In a later round, prefer the specific follow-ups the findings propose over new ideas unless a new idea is clearly larger. Each must be concrete enough that a worker with no other context can implement it in one session: name the files, the exact parameter or passage, and the surfaces it touches. Ground the expected effect in the baseline numbers (tokens per call, calls per case, cache reads, latency) and say which principles' cases would catch a regression. Say what each hypothesis builds on from the findings, if anything. Prefer levers that compose with other lenses' levers. Name what you rejected and why. Return the structured result only.`,
      { label: `ideate:${lens.key}`, phase: 'Ideate', schema: HYPOTHESES, model: 'opus' },
    ),
  ),
)
return results.filter(Boolean)
