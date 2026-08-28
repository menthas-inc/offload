# Context and memory

> How offload stays the same size to reason about, however long someone has used it.
> Grounds OFF-8. The data model spec turns this into tables.

## The problem this exists to prevent

An assistant that remembers by accumulating gets slower, more expensive and worse the longer it is used. Someone two years in has thousands of things and hundreds of conversations, and the naive design puts more and more of that into every prompt: cost grows, latency grows, and quality falls because the signal is buried.

offload inverts that. **What goes into a model call is bounded and roughly constant, whether the account is a week old or three years old.** Growth happens in storage, not in context.

## Two tiers of data, with different lifetimes

**Raw.** Things, their media, conversation turns. Stored as given, never rewritten, and shown back to the person exactly as they dumped it. This is the product's promise: it is the one place you put things, and they are still there.

**Derived.** Memories, preferences, the standing blurb on a thread, what offload knows about a person. Continuously compacted and generalised. This is what gets injected into a prompt, and it is the reason the prompt does not grow.

The relationship is one-way. Derived data is computed from raw data. Raw data is never rewritten to match a derived conclusion.

## Compaction

A scheduled job, not something on the request path. It reads recent raw activity plus the existing derived state, and rewrites the derived state to be a better and not longer summary of both.

Rules that make it safe:

- **Compaction is lossy on purpose, and it is bounded.** Each derived scope has a budget, and the job's task is to stay inside it while losing as little as possible, not to be complete.
- **A memory keeps its sources.** The design shows a memory with the things it came from, and that provenance is what makes a wrong memory correctable and a surprising one explicable.
- **Corrections beat inference.** Something a person stated directly outranks something offload worked out, and compaction never generalises away an explicit correction.
- **Never generalise across accounts.** Memories are per account and per that account's own content. Nothing learned from one person's things ever reaches another's prompt, including through a shared thread.

## Retention

**Raw content is kept for as long as the retention setting says. Derived data is kept forever.**

The design states one retention rule in the product, on conversations, as a setting whose options include Forever. The consequence of the split above is that offload can keep knowing something after it can no longer show you where it learned it.

That is the correct behaviour, and it needs to be visible rather than eerie. A memory whose sources have aged out should say so. A memory should never be silently unexplainable, because an assistant that knows things about you and cannot say why is exactly the thing people are right to distrust.

## The prompt budget

Prompt assembly has a fixed budget per tier, and the budget is enforced at assembly rather than hoped for.

- The frozen system prompt: stable, and cached (`cache_control`), so it is nearly free after the first call.
- Per-account derived context: bounded, and stable enough between turns to stay cached.
- The turn's own material: the message, the thread in view, the things retrieved for this question.

Only the third grows with the question, and it is bounded by retrieval returning a fixed number of candidates rather than everything that matches.

**The test for any new feature: does it add something to a prompt that grows with account age?** If yes, it belongs in the derived tier behind compaction, not in the prompt.
