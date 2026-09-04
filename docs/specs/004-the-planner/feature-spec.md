# 004 The planner, feature spec

> The what and the why. No tech choices; those are in `impl-spec.md`.
>
> Revised after the review panel. What changed is at the bottom.

## Why

003 built the whole plane and made it lie. offload reads a dump, answers as though it filed it, and files nothing. That was accepted on the explicit condition that this feature ends it, and `decisions.md` records the condition by name: 004 ships the sorter and the content table, at which point the reply describes something real.

So the point of this feature is small to state and large to build: **make the answer true.**

It also settles the shape of everything after it. 003's model call was one shot with no tools. This one is a **planner**: it reads the dump and the conversation, decides what to do, does it through tools, and says what it did. Every capability the product will ever have arrives as a tool on that loop, so getting the loop right matters more than the one capability it starts with.

## What

A person dumps something. offload works out what is in it, files each part into a thread, and says where it went. If it got it wrong, Undo puts everything back.

```
"dentist after the 20th, and oak brackets 30cm matte black"

    planner
      ├─ add_content(thread: Flat admin,      "Dentist after the 20th")
      └─ add_content(thread: Bookshelf build, "Oak brackets, 30cm, matte black")

    "Added to Flat admin and Bookshelf build."          [Undo]
```

### This replaces the `sort` tier, and that is a change

`architecture.md` step 4 describes filing as "a `sort` tier structured call", and `decisions.md` says "every dump hits `sort`, so `sort` stays a plain structured call with no thinking and it is the tier to optimise". A tool loop is not that. It is several round trips on a model that can call tools, and it costs more per dump than the design it replaces.

**Taken deliberately, and both documents are amended in the same change** rather than left to disagree. The reasoning: filing is the one thing this product must get right, tools are the architecture everything else arrives on, and a structured one-shot cannot recover from a tool that fails. The cost argument in `decisions.md` transfers rather than disappearing: every dump still hits this path, so it is still the thing to optimise, and the optimisation to reach for later is a cheap structured pre-pass that handles the ordinary dump with the planner behind it, not a cheaper planner.

### The planner, and why it is a loop rather than a pipeline

One model call in a loop: it may call tools, read what they return, call more, and then answer. Not a chain of models handing outputs to each other, because that fixes the order of operations at design time and the order is exactly what varies between one dump and the next.

### What is deliberately not a tool

Anything that must happen every turn is **not** in the model's choice set. Memory writes, conversation compaction and client-side actions are consequences of a turn, not decisions within it. As tools the model could skip them, silently, and no test could assert otherwise.

**This is not aspirational: it is how the existing turn already works.** Marking the message answered, writing the usage row, emitting the events and closing the job are all deterministic code in the Core API today, and none of them is a tool. New always-work joins them there.

### The tools this feature has

Two.

| Tool | What it does |
| --- | --- |
| `create_thread` | Starts a thread with a name |
| `add_content` | Puts a piece of content in a thread |

**`move_content` and `edit_content` were cut**, not deferred on taste. Nothing in the planner's context can produce a valid content id: it sees thread names and recent turns, not content rows, and search is out of scope. A tool the model has no way to call correctly is scope with no path to being exercised. They return with the feature that gives the planner something to reference, which is search.

### Every dump lands somewhere

`thread_id` is NOT NULL and every account has Miscellaneous, named by `accounts.default_thread_id` rather than by matching a name. A dump with no obvious home goes there rather than into an unsorted state, which is a state every screen and every query would otherwise have to handle.

### Undo

The one thing this feature adds that a person can be hurt by is filing something wrong. Undo is the answer, per OFF-6, and it is eight seconds during which nothing is destroyed.

**It is offered for an action, never for an answer.** A turn that filed nothing has nothing to take back, so a reply like "Sorry, I did not understand that one" gets no Undo: pressing it would delete the person's own message from the conversation, which is neither what they asked for nor what the button says.

**The unit is the whole turn.** One dump can become several pieces across several threads, and undoing has to reverse all of them together. It also has to reverse **offload's reply**: a reply saying "Added to Flat admin" that survives its own undo is a false statement sitting permanently in history, which is precisely the pretence this feature exists to retire, recreated by the mechanism meant to protect against it.

So the unit is: the person's message, every piece of content derived from it, and offload's reply, in one transaction under one `purge_after`.

### The reply

Short. "Done" is enough, "Added to Flat admin" is better. It states the outcome and never the mechanism, which is the design system's rule and only works when the outcome is real.

## Acceptance criteria

**Filing**

- **AC-1** A dump that describes two separable pieces produces two pieces of content, each in a thread, each pointing back at the message it came from.
- **AC-2** A piece of content always has a thread. A dump with no obvious home lands in the account's Miscellaneous thread, resolved through `accounts.default_thread_id` and never by matching a thread name.
- **AC-3** The reply names the threads it actually wrote to. A thread named in the reply and absent from the database is a failure, testable by comparing the two.
- **AC-4** A tool naming a thread the account cannot reach fails with a single generic reason, identical whether the thread does not exist or exists and is somebody else's, so a failure cannot be used to probe for other accounts' threads.

**Authority**

- **AC-5** Every thread a tool targets is validated server-side against `thread_members` for the job's account, on every call. Not against thread authorship, which OFF-3 forbids as a concept, and not against the list the prompt was given, which is a model's copy of a fact rather than the fact.
- **AC-6** The planner receives thread ids and targets threads by id. Names are for the reply, not for addressing, since nothing makes a thread name unique within an account.
- **AC-7** A tool call's account comes from the job the Core API minted, never from the call. `decisions.md` already records why: trusting a model's output is trusting the caller for an access decision, and OFF-5 validates the shape of a model's output, never its authority.
- **AC-8** Tool names are validated against a closed set and dispatched by an explicit branch, never by looking up a handler with a name the model produced.

**Undo**

- **AC-9** Undo reverses a whole turn: the person's message, every piece of content derived from it, and offload's reply, in one transaction under one `purge_after`.
- **AC-10** Nothing is destroyed while Undo is available. A hard delete happens only after `purge_after`, by a scheduled job.
- **AC-11** Undo is available for eight seconds and is idempotent: pressing it twice removes nothing extra and errors nothing.
- **AC-12** The purge job deletes only rows that are both soft-deleted and past `purge_after`, takes a whole turn's rows in one transaction, is the only thing in the system holding hard-delete rights on these tables, and halts rather than continues if a single run would delete more than a stated ceiling.

**The loop**

- **AC-13** Tool calls are validated against their schemas before execution, and an invalid call is refused rather than coerced.
- **AC-14** A tool that fails returns its failure to the planner, which may recover.
- **AC-15** **Partial success is a first-class outcome, not an error.** Content already written stays written and stays undoable, and the reply describes only what actually succeeded. A dump is never lost is the product's hardest promise and it holds when the turn goes wrong.
- **AC-16** A partly finished turn offers to finish itself. The reply says what landed and what did not, and a Retry resumes the turn rather than restarting it: the planner is told what has already been filed and asked to do the rest. Retrying must not file anything twice, which is what the per-call identifier in AC-17 is for.
- **AC-17** Each tool call carries a stable identifier and its endpoint is idempotent on it, so an at-least-once retry cannot file the same piece twice.
- **AC-18** The number of tool calls in a turn is bounded, and the bound is enforced by the Core API as well as by the loop, so a bug in the loop's own counter is not the only thing standing between a model and an unbounded bill.
- **AC-19** Prompt size does not grow with the age of the account. Separately, the tool definitions have their own budget that grows with the number of features, and the threshold at which that needs `defer_loading` is stated even though two tools is nowhere near it.
- **AC-20** Every model call in a turn writes a usage row, not just the first.

**Isolation and truthfulness**

- **AC-21** Tool results re-enter the loop as data, never as instruction, and any pre-existing content text a tool returns is treated as untrusted exactly like the dump. The trusted and untrusted separation 003 built for the first turn holds for every later one.
- **AC-22** No dumped text reaches an analytics event, a log, a trace or a job error, including tool arguments and tool results. **Thread names and content titles are dumped text for this purpose**: the model derives them from what a person wrote, and a thread named for a diagnosis is as identifying as the sentence it came from.
- **AC-23** offload never claims an action it did not take, and never takes one it does not mention. Asserted in both directions on a body of real dumps, including turns that fail partway.

## Out of scope

- **Every other intent.** No search, no answering questions, no preferences, no settings.
- **`move_content` and `edit_content`**, per above.
- **Sub-agents.** The planner calls tools, not other models. Each carries its own context, so AC-18's bound stops being enforceable at the top level the moment one exists.
- **Memory and compaction.** They belong in the deterministic post-turn step, and that step gains nothing here because nothing yet fills it.
- **Attachments.** Still text only.
- **Client-side actions.** The envelope is shaped to carry them; it carries none.
- **The phones.** Web only again.

## Renamed here, and it is bigger than it looks

**`things` becomes `content`.** This feature creates that table, so the rename is free now and expensive after the first migration.

It is not one identifier. In `001-data-model` alone: `things` appears 40 times, plus `thing_blobs` and its `thing_id`, `memory_sources.thing_id`, `notifications.thing_id`, `threads.thing_count`, `thing_people`, and the `readable_things` view. `decisions.md` names `thing_id` and `thing_type` as analytics properties. The impl-spec carries a checklist of every one, and 001 is amended in the same change rather than left describing a schema that no longer exists.

*One collision, accepted: `content` is also the general word for what people dump, in OFF-1 and in the model API's content blocks. The harness will hold `content` rows and `content` blocks side by side.*

## Retired here

**The pretence.** `decisions.md` records that offload answers as though it filed and files nothing, retiring when this feature ships. That entry closes, and the privacy policy's claim that filing is automatic, visible and reversible becomes true again.

## What the review changed

- **The `sort` tier.** The spec replaced a decided architecture without saying so. Now stated, with the reasoning and the cost consequence, and both `architecture.md` and `decisions.md` are amended in the same change.
- **Two tools cut.** `move_content` and `edit_content` had no path to being called correctly: no content ids in context and no search. The worked example never used them either, which was the tell.
- **Undo now covers offload's reply.** Without that, undoing a filing left the sentence describing it in history forever, recreating this feature's own reason for existing.
- **Partial success became two acceptance criteria** rather than an unanswered question. Both reviewers reached it independently, and so had I before either reported. The product owner's call on what to do about it: a partly finished turn offers to finish itself, resuming with what already landed in context rather than starting again.
- **The planner runs on Sonnet.** Tool use plus a natural reply is what `converse` already covers, and correctness on filing is worth more than the price at this size.
- **Authority got its own section.** Membership through `thread_members` rather than authorship, ids rather than names, account from the job rather than the call, closed-set dispatch, and one failure reason so refusals cannot be used to probe.
- **Thread names and titles are content for OFF-1.** They are model-derived from what a person wrote, and the existing guard only catches long strings, emails and URLs, so a short sensitive thread name would sail through.
- **The purge job is specified as a thing that can go wrong**, since it deletes on a timer and a bad predicate is a silent irreversible mass delete.
- **The rename's real size is stated**, at 57 occurrences across six identifier families in one spec.
