# Specs

One folder per feature: `docs/specs/NNN-feature-slug/`, zero-padded and monotonically increasing.

Each folder holds three artifacts, produced in order by `/plan-feature`:

1. **feature-spec.md**, the *what* and *why*. Product-level. No tech choices.
2. **impl-spec.md**, the *how*. Data flow, data model, interfaces, dependencies, edge cases, and which principles apply.
3. **tasks.md**, ordered testable tasks an agent can execute, each citing the acceptance criteria it satisfies.

`/implement` consumes all three. `/tweak` updates them in place for a small change.

## Volume and access is a required section

Every impl-spec that adds or changes a table, a list or a feed carries a **Volume and access** section, written before the schema and not after. The point is to make pagination, indexing and normalisation decisions fall out of stated numbers, rather than be discovered when a screen gets slow and the fix is a refactor.

Estimates are fine. Stating a number you later find wrong is useful; leaving it blank is not.

| Field | What to write |
| --- | --- |
| Records per account | Typical, and a realistic heavy case. "40 threads typical, 300 heavy." |
| Fan-out | Children per parent, and its worst case. "Things per thread: 15 typical, 500 heavy." |
| Growth | Per day or week for an active account, so the two-year number is derivable. |
| Read pattern | Which screens read it, how often, and what they need. Name the screen. |
| Write pattern | Rate, and whether it is bursty. |
| Sort and filter | Every ordering and predicate any screen needs, because that is the index list. |

Then say what follows from it, explicitly:

- **Pagination:** server-side or client-side, page size, and cursor or offset. Anything with a heavy case above a few hundred rows is server-side and cursor-based.
- **Indexes:** the covering indexes for the queries above, with the leading column stated. Account or thread scope leads, since every query is scoped by one of them.
- **Normalisation:** what is denormalised on purpose, such as a count on a thread row rather than a `COUNT(*)`, and what keeps it correct.
- **Partitioning:** only for hot append tables, and only once the numbers say so.

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
