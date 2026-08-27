---
description: Implement a planned feature from its spec artifacts.
argument-hint: <NNN-slug>
---
Implement the feature in `docs/specs/$ARGUMENTS/`. Read feature-spec.md, impl-spec.md and tasks.md first.

## Approach
1. Use the `explorer` agent to gather the relevant code context rather than reading broadly in this session. If the work has a visual result, have it point you at the kit screens and the component contracts too.
2. Work tasks.md in order. For each task:
   - Implement the smallest change that satisfies it (DEV-1).
   - Keep the code aligned to the impl-spec. If reality forces a divergence, update the spec in the same step (DEV-2).
   - Mark the task `[~]` then `[x]` in tasks.md as you go.
3. After each phase, run the test suite and fix failures before moving on.
4. Before declaring done, run `code-reviewer` on the full diff, plus `client-reviewer` if it touches a client or the API contract, plus `security-reviewer` if it touches authorization, input handling, content storage, encryption, connected apps or secrets.

## While you build
- Consume design tokens, never retype a value. Use the semantic aliases.
- Use the product's vocabulary in identifiers as well as copy: thread, thing, memory, dump, sorted, connection.
- No em dashes anywhere, including comments and commit messages.
- If the implementation had to diverge from the kit, code wins, and the same change appends one entry to `.claude/skills/offload-design/decisions.md` in the format that file's CONTRIBUTING describes (OFF-7).

Stop and ask if the spec is ambiguous or an edge case is not covered. Do not invent product behaviour.

End with: tasks completed, test status, open review findings, and any decision-log entries you added.
