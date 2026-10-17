---
description: On-demand deep review. Bugs, design fidelity, security, and constitution adherence.
argument-hint: [scope: diff | path | feature NNN-slug] (default: uncommitted diff)
---
Deep review of: **$ARGUMENTS** (default: the current uncommitted diff).

Run the panel in parallel and synthesize. Do not review inline yourself:
- `code-reviewer`, ponytail-review: bugs, scale, tests, speed, lean.
- `client-reviewer`, design-system fidelity, UX, parity, API contract divergence. Skip only if the change touches nothing client-facing.
- `security-reviewer`, authorization, input handling, prompt injection, secrets, encryption, egress.

Then do the constitution pass yourself: audit the change against every principle in `docs/constitution/principles.md`, read fresh. For each relevant principle, state compliant, violated or not-applicable with one line of evidence.

Merge everything into one report, deduplicated, ordered by severity (CRITICAL to LOW). For each finding: `file:line`, the issue, the principle or AC it touches, and a concrete fix. End with a single line: `GATE: PASS` or `GATE: BLOCKED (open MUST violations: <ids>)`.

Do not fix anything unless I ask.
