---
description: Make a small adjustment to a feature and keep its specs in sync.
argument-hint: <what to change> (optionally: NNN-slug)
---
Small change: **$ARGUMENTS**

This is a minor adjustment, not a re-plan. Do not spin up the planning agents.

1. Locate the affected feature folder in `docs/specs/`. Ask if it is unclear which one.
2. Make the smallest code change that achieves it (DEV-1).
3. **Spec sync, required.** Update the affected feature-spec.md, impl-spec.md and tasks.md so they still describe reality (DEV-2). If the tweak changes behaviour or acceptance criteria, that edit is part of this task and is not optional.
4. **Decision log, if it has a visual result.** If the change diverges from the design system, append one entry to `.claude/skills/offload-design/decisions.md`, newest at the top, under today's date. Fill in **Design system impact** properly: that is the field the design system reads on its next sync, and `none` is a valid value but a missing field is not. If it changes a token value, edit the file under `.claude/skills/offload-design/tokens/` in the same commit. A token value must never exist in two versions (OFF-7).
5. Run the tests. Add or adjust tests if the change alters covered behaviour (QUAL-1).
5a. If the tweak touches a prompt under `apps/agent/src/offload_agent/prompts/` or a tool the model calls, add or rewrite the cases under the principle it changes in `apps/agent/evals/principles/`, and run that principle before and after with `/run-llm-tests`. A case the tweak makes wrong is rewritten or deleted in the same commit.
6. If it touches authorization, content storage, encryption or connected apps, run `security-reviewer`.

If this turns out to be a major change (a new data model, a new flow, cross-feature impact), stop and tell me. It should go through `/plan-feature` instead.
