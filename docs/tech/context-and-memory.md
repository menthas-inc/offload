# Context and memory

> How offload stays the same size to reason about, however long someone has used it.
> Grounds OFF-8. The data model spec turns this into tables.

## The problem this exists to prevent

An assistant that remembers by accumulating gets slower, more expensive and worse the longer it is used. Someone two years in has thousands of pieces of content and hundreds of conversations, and the naive design puts more and more of that into every prompt: cost grows, latency grows, and quality falls because the signal is buried.

offload inverts that. **What goes into a model call is bounded and roughly constant, whether the account is a week old or three years old.** Growth happens in storage, not in context.

## Two tiers of data, with different roles

**Raw.** Content, its media, conversation turns. Stored as given, never rewritten, and shown back to the person exactly as they dumped it. This is the product's promise: it is the one place you put things, and they are still there.

**Derived.** Memories, preferences, the standing blurb on a thread, what offload knows about a person. Continuously compacted and generalised. This is what gets injected into a prompt, and it is the reason the prompt does not grow.

The relationship is one-way. Derived data is computed from raw data. Raw data is never rewritten to match a derived conclusion.

The tiers differ in what a prompt carries, and **as of 2026-09-10 they also differ in what survives.** Raw is kept indefinitely. Derived is not, and that is the point of it: offload's picture of somebody changes, and a picture that can only be added to is one that gets worse. Compaction supersedes freely, deletes only what offload itself wrote, and never touches the raw row a derived one came from. OFF-1 carries the rule and 014 is where it was written down.

## Compaction

A scheduled job, not something on the request path. It reads recent raw activity plus the existing derived state, and rewrites the derived state to be a better and not longer summary of both.

### What the job actually does

Four things, and only the first two are what the word usually means:

1. **Removes duplicates**, literal and conceptual. Two sentences that say one thing become one.
2. **Combines what belongs together**, so a set of related notes becomes the fact they add up to.
3. **Drops what has stopped being true.** A date that has passed, a plan that was replaced, a note about a thing that is done. This is the half that keeps a thread's picture current rather than merely short, and it is why compaction is resolution rather than summarising.
4. **Adds what it learned**, from the day's conversations, which is the only way something said in passing and never filed reaches the derived tier at all. *Built by 032: a member's dumps that landed in the thread since their last pass, and only a fact, a correction, a pattern seen again or a rule they stated.*

### The daily job

One job per account per day, and compaction is one part of it. In order:

- **Note compaction**, per thread, the four steps above. *Since 032 this is the nightly pass, one per thread and member, booked only on material change since that member's last pass, at most ten threads a member a night; it also learns, and on the default thread suggests threads (028).*
- **Today generation**, the account's own view of the day ahead, assembled once rather than computed on every open.
- **Thread compaction**, the same resolution one level up: a thread's standing picture of itself, rewritten from its notes and recent activity.

They share an account, a clock and a budget, which is the reason they are one job rather than three schedules that each wake an idle account up. Each part is specced where it lands; this is the list, so a later feature adds to it rather than inventing a second daily job.

Rules that make it safe:

- **Compaction is lossy on purpose, and it is bounded.** Each derived scope has a budget, and the job's task is to stay inside it while losing as little as possible, not to be complete.
- **A memory keeps its sources.** The design shows a memory with the content it came from, and that provenance is what makes a wrong memory correctable and a surprising one explicable.
- **Corrections beat inference.** Something a person stated directly outranks something offload worked out, and compaction never generalises away an explicit correction.
- **Supersede, then delete only your own.** Setting a note aside changes what offload acts on and destroys nothing, so it applies to anything. Deleting the row applies only to notes offload wrote itself: a sentence somebody typed is theirs, wherever it is stored.
- **Never generalise across accounts.** Memories are per account and per that account's own content. Nothing learned from one person's content ever reaches another's prompt as anything but that person's words. *Amended 2026-10-02 by 032, to say precisely what was already true:* in a shared thread a note learned from Ana's dumps is Ana's, and reaches Sam's filing turns only in the block every prompt reads as what other people in the thread wrote, data and never instruction, which is the reach a note filed from the same dump in a live turn already had. A pass reads one member's words and changes only that member's notes.

## Retention

**What a person put in is kept indefinitely.** Content, its media and conversation turns are kept until the person deletes them. There is no purge clock on anything a person put into offload.

**What offload worked out is kept while it is still true.** Derived rows are superseded and removed by the daily job as its picture changes. Nothing there is a record of what somebody said; the record is the raw row it came from, which is still where it was.

Retention applies instead to the data that exists for us rather than for them: analytics events, application logs, traces, and the LLM metadata in Langfuse. Those are minimised on a short clock, because they carry operational value that decays fast and risk that does not.

That split is the honest version of data minimisation for this product. Deleting someone's photos on a timer is not privacy, it is losing their content. Not keeping six months of logs about how they used it is.

One consequence worth noticing, because it removes a problem rather than creating one: since raw content never ages out, **a note can always show its sources.** The design draws a memory with the content it came from, and that stays true forever rather than degrading into an assistant that knows something and cannot say why.

The obligation this creates is on storage growth rather than on deletion. Nothing shrinks, so per-account storage only goes up, and that is a cost line to watch rather than a correctness problem. Deletion is still real and immediate when a person asks for it, and it still cascades.

## The prompt budget

Prompt assembly has a fixed budget per tier, and the budget is enforced at assembly rather than hoped for.

- The frozen system prompt: stable, and cached (`cache_control`), so it is nearly free after the first call.
- Per-account derived context: bounded, and stable enough between turns to stay cached.
- The turn's own material: the message, the thread in view, the content retrieved for this question.

**"The thread in view" is literal, and it is one line.** `messages.looking_at_thread_id` records the thread that was on screen when somebody dumped, and the planner is told about it: "They are looking at thread <id>, called 'Sustain'. Anything to file belongs there unless what they dumped names a different thread, in which case that one wins." It is a default rather than a destination, it is never dropped to fit because it is what decides where things land, and membership is resolved again when it is read rather than trusted from the stored id.

Only the third grows with the question, and it is bounded by retrieval returning a fixed number of candidates rather than everything that matches.

**The test for any new feature: does it add something to a prompt that grows with account age?** If yes, it belongs in the derived tier behind compaction, not in the prompt.
