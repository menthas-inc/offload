export const meta = {
  name: 'sweep-review',
  description: 'Repo sweep, phase 2: nine review lanes over one commit, every medium-or-above finding put to a skeptic',
  whenToUse: 'Only from the sweep skill, Phase 2. args: { worktree, reviewed, base, since, focus: { <lane>: [string] } }',
  phases: [
    { title: 'Review', detail: 'nine lanes, briefs in .claude/skills/sweep/lanes.md' },
    { title: 'Verify', detail: 'skeptics try to refute each serious finding' },
  ],
}

const CODE = 'code-core-api, code-agent, code-web, code-mobile'
const LANES = [
  { key: 'seams-data', section: 'seams-data' },
  { key: 'seams-clients', section: 'seams-clients', agentType: 'client-reviewer' },
  { key: 'code-core-api', section: CODE, area: 'apps/core-api', agentType: 'code-reviewer' },
  { key: 'code-agent', section: CODE, area: 'apps/agent', agentType: 'code-reviewer' },
  { key: 'code-web', section: CODE, area: 'apps/web with the admin panel, packages/ and apps/backup', agentType: 'code-reviewer' },
  { key: 'code-mobile', section: CODE, area: 'apps/mobile', agentType: 'code-reviewer' },
  { key: 'security', section: 'security', agentType: 'security-reviewer' },
  { key: 'legal', section: 'legal' },
  { key: 'product', section: 'product', agentType: 'project-lead' },
]

const SEVERITY = { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
const FINDING = {
  type: 'object',
  properties: {
    severity: SEVERITY,
    title: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'integer' },
    evidence: { type: 'string' },
    failure_scenario: { type: 'string' },
    fix: { type: 'string' },
    test: { type: 'string', description: 'the test that goes red first, and the suite that owns it' },
    owner_call: { type: 'boolean' },
    introduced_by: { type: 'string', description: 'merge, PR or spec, when git can say' },
  },
  required: ['severity', 'title', 'file', 'evidence', 'failure_scenario', 'fix', 'owner_call'],
}
const LANE_RESULT = {
  type: 'object',
  properties: {
    checked: {
      type: 'array',
      items: {
        type: 'object',
        properties: { item: { type: 'string' }, evidence: { type: 'string' } },
        required: ['item', 'evidence'],
      },
    },
    findings: { type: 'array', items: FINDING },
  },
  required: ['checked', 'findings'],
}
const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    severity: SEVERITY,
  },
  required: ['refuted', 'reason', 'severity'],
}

const a = args || {}
const focus = a.focus || {}

function reviewPrompt(lane) {
  const start = (focus[lane.key] || []).map(f => `- ${f}`).join('\n') || '- none beyond the brief'
  return [
    `You are the ${lane.key} lane of the repo sweep, in the worktree ${a.worktree}.`,
    `Review commit ${a.reviewed}. What changed since the last sweep is ${a.base}..${a.reviewed}, merged since ${a.since}.`,
    `Read .claude/skills/sweep/lanes.md whole: the opening section, then "## ${lane.section}", which is your brief.`,
    lane.area ? `Your area is ${lane.area}.` : '',
    `The lead's focus for you, start here:\n${start}`,
    `Return what you checked and found sound, and your findings, as the brief describes. Read-only: change nothing.`,
  ].filter(Boolean).join('\n\n')
}

const LENSES = [
  'Does it reproduce from the code as written at that commit? Trace the path yourself; a finding that rests on a misread line is refuted.',
  'Is it already handled elsewhere (a caller, a constraint, a predicate, a test), or intended by a spec or a logged decision? Then it is refuted.',
]

function verifyPrompt(lane, f, lens) {
  return [
    `A reviewer in the repo sweep (${lane.key} lane) reported this against commit ${a.reviewed} in ${a.worktree}.`,
    JSON.stringify(f, null, 2),
    `Try to refute it. ${lens}`,
    `If uncertain after reading the code, refuted is true. If it is real, say so and give the severity it deserves by the scale in .claude/skills/sweep/lanes.md. Read-only.`,
  ].join('\n\n')
}

async function verify(lane, f) {
  if (f.severity === 'low') return { ...f, lane: lane.key, verdict: 'PLAUSIBLE' }
  const lenses = f.severity === 'medium' ? LENSES.slice(0, 1) : LENSES
  const votes = (await parallel(lenses.map((lens, i) => () =>
    agent(verifyPrompt(lane, f, lens), {
      label: `verify:${lane.key}:${f.file.split('/').pop()}:${i}`,
      phase: 'Verify',
      schema: VERDICT,
    })))).filter(Boolean)
  const standing = votes.filter(v => !v.refuted)
  if (!votes.length) return { ...f, lane: lane.key, verdict: 'PLAUSIBLE', notes: 'no verifier returned' }
  if (!standing.length) return { ...f, lane: lane.key, verdict: 'REFUTED', notes: votes.map(v => v.reason).join(' | ') }
  return { ...f, lane: lane.key, severity: standing[0].severity, verdict: 'CONFIRMED', notes: standing.map(v => v.reason).join(' | ') }
}

const lanes = await pipeline(
  LANES,
  lane => agent(reviewPrompt(lane), {
    label: `review:${lane.key}`,
    phase: 'Review',
    schema: LANE_RESULT,
    ...(lane.agentType ? { agentType: lane.agentType } : {}),
  }),
  async (result, lane) => {
    if (!result) {
      log(`${lane.key}: no result`)
      return { lane: lane.key, missing: true, checked: [], findings: [] }
    }
    const findings = await parallel(result.findings.map(f => () => verify(lane, f)))
    const kept = findings.filter(Boolean)
    log(`${lane.key}: ${result.checked.length} checked, ${kept.filter(f => f.verdict !== 'REFUTED').length} of ${kept.length} findings stand`)
    return { lane: lane.key, checked: result.checked, findings: kept }
  },
)

const done = lanes.filter(Boolean)
const missing = LANES.map(l => l.key).filter(k => !done.find(l => l.lane === k && !l.missing))
if (missing.length) log(`lanes with no result, rerun them: ${missing.join(', ')}`)
return { reviewed: a.reviewed, base: a.base, missing, lanes: done }
