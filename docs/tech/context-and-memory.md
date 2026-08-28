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

**User-facing content is kept indefinitely.** Things, their media and conversation turns are kept until the person deletes them. There is no purge clock on anything a person put into offload.

Retention applies instead to the data that exists for us rather than for them: analytics events, application logs, traces, and the LLM metadata in Langfuse. Those are minimised on a short clock, because they carry operational value that decays fast and risk that does not.

That split is the honest version of data minimisation for this product. Deleting someone's photos on a timer is not privacy, it is losing their things. Not keeping six months of logs about how they used it is.

One consequence worth noticing, because it removes a problem rather than creating one: since raw content never ages out, **a memory can always show its sources.** The design draws a memory with the things it came from, and that stays true forever rather than degrading into an assistant that knows something and cannot say why.

The obligation this creates is on storage growth rather than on deletion. Nothing shrinks, so per-account storage only goes up, and that is a cost line to watch rather than a correctness problem. Deletion is still real and immediate when a person asks for it, and it still cascades.

## The prompt budget

Prompt assembly has a fixed budget per tier, and the budget is enforced at assembly rather than hoped for.

- The frozen system prompt: stable, and cached (`cache_control`), so it is nearly free after the first call.
- Per-account derived context: bounded, and stable enough between turns to stay cached.
- The turn's own material: the message, the thread in view, the things retrieved for this question.

Only the third grows with the question, and it is bounded by retrieval returning a fixed number of candidates rather than everything that matches.

**The test for any new feature: does it add something to a prompt that grows with account age?** If yes, it belongs in the derived tier behind compaction, not in the prompt.
