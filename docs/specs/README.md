# Specs

One folder per feature: `docs/specs/NNN-feature-slug/`, zero-padded and monotonically increasing.

Each folder holds three artifacts, produced in order by `/plan-feature`:

1. **feature-spec.md**, the *what* and *why*. Product-level. No tech choices.
2. **impl-spec.md**, the *how*. Data flow, data model, interfaces, dependencies, edge cases, and which principles apply.
3. **tasks.md**, ordered testable tasks an agent can execute, each citing the acceptance criteria it satisfies.

`/implement` consumes all three. `/tweak` updates them in place for a small change.

## Conventions

- Acceptance criteria are numbered `AC-1`, `AC-2` and are testable. If you cannot write a test for it, it is too vague.
- Every task cites the AC it serves.
- Empty, error and conflict states are explicit, not implied.
- A feature that touches the clients specs three tracks, API, Mobile and Web, and is closed only when all three pass. Platform-native capabilities (push, camera, share sheet, the sunset calculation, platform sign-in) are per-platform by nature and are noted per track rather than counted as a gap.
- Anything with a visual result cites the design system: which kit, which screen, which component contract.

## Suggested first specs

Not a roadmap, just the order in which the open questions in `docs/tech/decisions.md` need answering.

1. **The data model.** thread, thing, memory, connection, grant, account. Names fixed from the first migration.
2. **Encryption and key custody.** Resolves open decision 1, and blocks every content table.
3. **Getting in.** Waitlist, invite, Apple and Google sign-in, first run, the no-invite screen.
4. **The dump.** Composer to outbox to blob to Core API to sort job to a thing in a thread, with Undo.
