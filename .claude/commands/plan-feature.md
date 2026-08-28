---
description: Plan a feature end to end. Spec, multi-perspective review, constitution gate, impl-spec and tasks.
argument-hint: <feature description>
---
Plan the feature: **$ARGUMENTS**

Work through these phases. Pause for my input where noted.

## 1. Feature spec, the what and why
Read `docs/specs/README.md` for the format and pick the next NNN. If the feature has a visual result, read the relevant kit README under `.claude/skills/offload-design/ui_kits/` before writing anything: the screens are already designed and the spec should describe what is there, not invent a parallel design.

Draft `docs/specs/NNN-slug/feature-spec.md`: why, what, acceptance criteria (AC-n, testable), out of scope. No tech choices yet.

## 2. Clarify
Identify ambiguities and edge cases. Ask me the open questions in one batch. Fold the answers into the spec.

## 3. Multi-perspective review
Spawn these agents in parallel, each in its own context, to review the feature-spec:
- `project-lead`, product coherence, complexity, and high-altitude technical judgment
- `client-reviewer`, design-system fidelity, flow, missing states, cross-surface parity
- `security-reviewer`, the threats and privacy consequences the spec must address

Synthesize their findings and revise the feature-spec to resolve them. Report what you changed and what you deliberately did not.

## 4. Constitution gate
Audit the revised feature-spec yourself against every principle in `docs/constitution/principles.md`, read fresh. For each relevant principle state compliant, violated or not-applicable, with one line of evidence. A violated MUST is CRITICAL and blocks. A violated SHOULD is a flag needing a stated justification.

Pay particular attention to the ones this product gets wrong most easily:
- OFF-1, does anything in this feature put content into an event, a trace or a log?
- OFF-3, is every new read and write scoped to an owning account or an explicit grant?
- OFF-6, does every automatic action have an eight-second Undo, and is everything outward facing confirmed?

End the phase with a single line: `GATE: PASS` or `GATE: BLOCKED (open MUST violations: <ids>)`. Do not continue while a MUST is open.

## 5. Impl-spec, the how
Write `docs/specs/NNN-slug/impl-spec.md`: data flow, data model, **volume and access**, interfaces, dependencies, edge cases, and a constitution check saying which principles apply and how they are satisfied.

The **volume and access** section is required whenever the feature adds or changes a table, a list or a feed, and its format is in `docs/specs/README.md`. Write it before the schema, not after: pagination, indexes and denormalisation should fall out of stated numbers. Estimates are fine, blanks are not.

If the feature puts anything into a model prompt, say what bounds it (OFF-8). Ground every choice in `docs/tech/`. If the feature depends on one of the open decisions at the bottom of `docs/tech/decisions.md`, say so explicitly rather than assuming an answer.

## 6. Tasks
Write `docs/specs/NNN-slug/tasks.md`: ordered testable tasks (setup, foundational, feature, tests), each citing the acceptance criteria and principles it satisfies. Split by track (API, Mobile, Web) where the feature touches the clients.

End by listing the three artifact paths and any unresolved SHOULD-level flags.
