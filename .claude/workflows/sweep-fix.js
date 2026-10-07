export const meta = {
  name: 'sweep-fix',
  description: 'Repo sweep, phase 4: one agent per file-disjoint work package, red before green, then a review and one answer',
  whenToUse: 'Only from the sweep skill, Phase 4, one wave at a time. args: { worktree, packages: [{ id, title, area, files, envFile, security, findings }] }',
  phases: [
    { title: 'Implement', detail: 'red before green, in the shared sweep worktree, no commits' },
    { title: 'Review', detail: 'code-reviewer, or security-reviewer where the package says so' },
    { title: 'Answer', detail: 'one pass on the review findings' },
  ],
}

const RESULT = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['fixed', 'skipped'] },
          red: { type: 'string', description: 'the test and the failing line it printed before the fix' },
          green: { type: 'string', description: 'the same test passing after, and the file around it' },
          why: { type: 'string', description: 'for a skip: why' },
        },
        required: ['title', 'status'],
      },
    },
    created: { type: 'array', items: { type: 'string' }, description: 'every file you created' },
    outside: { type: 'array', items: { type: 'string' }, description: 'failures you saw in files you do not own' },
  },
  required: ['findings', 'created', 'outside'],
}
const REVIEW = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          issue: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'issue', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const a = args || {}

function rules(p) {
  return [
    `You own only these files: ${p.files.join(', ')}. You may create new test files beside them; list every file you create.`,
    `Other agents are editing other files in this same tree right now. Never edit, format, stash, reset, checkout or restore anything outside your set, and run no git command that changes the index or the tree. Commit nothing. Start no servers.`,
    `Run tests only on your own database: \`source ${p.envFile}\` in the same shell before every test command, then the narrowest command that runs the test (one file, not the suite). Send its output to a file and read the end of it.`,
    `A failure in a file you do not own is not yours: report it under outside, do not fix it.`,
  ].join('\n')
}

function implementPrompt(p) {
  return [
    `You are implementing work package ${p.id} of the repo sweep in ${a.worktree}: ${p.title} (${p.area}).`,
    rules(p),
    `For each finding below, in order: write the test that shows it, run it and see it fail for the finding's reason, make the smallest change that fixes it, run it green, then run the file around it. If a finding is not real, or its fix needs a file you do not own, skip it and say why.`,
    `Findings:\n${JSON.stringify(p.findings, null, 2)}`,
  ].join('\n\n')
}

function reviewPrompt(p, result) {
  return [
    `Review work package ${p.id} of the repo sweep in ${a.worktree}: \`git diff -- ${[...p.files, ...(result.created || [])].join(' ')}\`, uncommitted. Other packages' edits in the tree are not part of it.`,
    `It was meant to close these findings:\n${JSON.stringify(p.findings, null, 2)}`,
    `The implementer reported:\n${JSON.stringify(result.findings, null, 2)}`,
    `Check that each fix closes its finding, that its test would fail without the fix, and that the change is the smallest that does. Report only real problems. Read-only.`,
  ].join('\n\n')
}

function answerPrompt(p, result, review) {
  return [
    `You are finishing work package ${p.id} of the repo sweep in ${a.worktree}: ${p.title}. Another agent implemented it; a reviewer then found the problems below. Fix each one that is real, red before green where it is a behaviour, and say which you did not and why.`,
    rules(p),
    `What the package was for:\n${JSON.stringify(p.findings, null, 2)}`,
    `What the implementer reported:\n${JSON.stringify(result.findings, null, 2)}`,
    `The review:\n${JSON.stringify(review.findings, null, 2)}`,
  ].join('\n\n')
}

const packages = await pipeline(
  a.packages || [],
  p => agent(implementPrompt(p), { label: `fix:${p.id}`, phase: 'Implement', schema: RESULT }),
  (result, p) => !result ? null : agent(reviewPrompt(p, result), {
    label: `review:${p.id}`,
    phase: 'Review',
    schema: REVIEW,
    agentType: p.security ? 'security-reviewer' : 'code-reviewer',
  }).then(review => ({ result, review })),
  async (step, p) => {
    if (!step) {
      log(`${p.id}: no result from the implementer`)
      return { id: p.id, missing: true }
    }
    const { result, review } = step
    const open = (review && review.findings) || []
    let answer = null
    if (open.length) {
      answer = await agent(answerPrompt(p, result, review), { label: `answer:${p.id}`, phase: 'Answer', schema: RESULT })
    }
    const fixed = result.findings.filter(f => f.status === 'fixed').length
    log(`${p.id}: ${fixed} of ${result.findings.length} fixed, ${open.length} review findings${answer ? ' answered' : ''}`)
    return { id: p.id, result, review: open, answer }
  },
)

return { packages: packages.filter(Boolean) }
