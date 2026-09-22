---
description: Implement a planned feature from its spec artifacts.
argument-hint: <NNN-slug>
---
Implement the feature in `docs/specs/$ARGUMENTS/`. Read feature-spec.md, impl-spec.md and tasks.md first.

## Approach
1. Use the `explorer` agent to gather the relevant code context rather than reading broadly in this session. If the work has a visual result, have it point you at the kit screens and the component contracts too.
2. Work tasks.md in order. For each task, in this order and no other (QUAL-1):
   - Write the test for the acceptance criterion the task serves, in the suite that owns that code.
   - Run that test and watch it fail, for the reason the task exists. A test that passes before the code is written is testing something else; fix the test before touching the code.
   - Implement the smallest change that makes it pass (DEV-1).
   - Run the test again, green, and the file around it, still green.
   - Keep the code aligned to the impl-spec. If reality forces a divergence, update the spec in the same step (DEV-2).
   - Mark the task `[~]` then `[x]` in tasks.md as you go.
3. After each phase, run the whole test suite and fix failures before moving on.
3a. **If the feature touches a prompt, a tool the model calls, or what a person reads back from the model**, add to the LLM evals before the last phase: a new principle file in `apps/agent/evals/principles/` when no principle describes the behaviour, or cases under the one that does, negatives included. Run the principles that name the changed prompt in `sources`, before and after, and put both numbers in the decision log. `/run-llm-tests` has the shapes.
4. Before declaring done, run `code-reviewer` on the full diff, plus `client-reviewer` if it touches a client or the API contract, plus `security-reviewer` if it touches authorization, input handling, content storage, encryption, connected apps or secrets.

## While you build
- Consume design tokens, never retype a value. Use the semantic aliases.
- Use the product's vocabulary in identifiers as well as copy: thread, note, connection, dump, sorted, Undo. In schema and code the noun is content; in anything a person reads there is no noun at all.
- No em dashes anywhere, including comments and commit messages.
- If the implementation had to diverge from the kit, code wins, and the same change must append one entry to `.claude/skills/offload-design/decisions.md`, newest at the top, under today's date. Fill in **Design system impact** properly: that is the field the design system reads on its next sync, and `none` is a valid value but a missing field is not. The block format is in that folder's `handoff/CONTRIBUTING.md` (OFF-7).
- If the change is a token value, edit the file under `.claude/skills/offload-design/tokens/` in the same commit. A token value must never exist in two versions.

Stop and ask if the spec is ambiguous or an edge case is not covered. Do not invent product behaviour.

End with: tasks completed, test status, open review findings, and any decision-log entries you added.
