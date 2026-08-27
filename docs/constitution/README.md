# Constitution

`principles.md` is the enforced set. Everything else about how we work is passive context in `CLAUDE.md` or a decision in `docs/tech/decisions.md`.

Two levels:

- **MUST** is a hard gate. A violated MUST is CRITICAL and blocks progress until it is resolved or the principle is amended.
- **SHOULD** is a strong default. A violation is a flag that needs a stated justification, not a blocker.

Amending a principle is a deliberate act: change it here, say why in `docs/tech/decisions.md`, and do it on `main` rather than inside a feature worktree.

The gate runs in two places. Mechanically, the hooks in `.claude/hooks/` block secrets and red tests. Semantically, `/plan-feature` and `/review` audit the artifact under review against every principle here and end with a `GATE: PASS` or `GATE: BLOCKED` line.
