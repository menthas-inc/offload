# 008 Thread memories, feature spec

> The what and the why. No tech choices; those are in `impl-spec.md`.

## Why

A thread accumulates content. What it never accumulates is **how that thread should be handled**.

"Write the todo names in three words" is not a todo and will never become one. "Ana handles the electrician" is not a task, a date or a place. Both are true of the thread rather than in it, and today there is nowhere to put either. They get said once in a conversation, they scroll away, and offload makes the same mistake in the same thread next week.

So this feature adds the one thing a thread cannot currently hold: **a short standing fact about itself.**

It is also the first piece of derived state the product actually ships. `001-data-model` specified `memories` in full and it was never migrated, which is why 005 renders no standing block: the table has no writer. This gives it one.

## What

A **memory** is a short standing fact about a thread that is not content in it. Up to ten per thread. People type them, offload writes them when it notices one, and they go to the model whenever a turn touches that thread.

```
Flat renovation
  ├─ To do
  │    Chase the electrician
  │    Order the oak brackets
  └─ Memories
       [ Todo names in three words ]  [ Ana handles the electrician ]  [ + Add ]
```

### What is a memory and what is content

The line is the whole feature, so it is worth stating plainly.

| | |
| --- | --- |
| "Write todo names in three words" | memory |
| "Ana handles the electrician" | memory |
| "Chase the electrician" | content, a task |
| "Brackets: oak, 30cm, matte black" | content |
| "We meet at the flat on Tuesdays" | memory |
| "Meet Ana at the flat on Tuesday" | content, it has a date |

**The test: if it would show up in a widget, it is content.** A memory has no date, no place, no tick and no due. It is a fact about how the thread works, and it stays true after everything currently in the thread is done.

### Ten, and no eleventh

A thread holds at most ten memories. Not a soft limit and not a warning: at ten, the way forward is to delete one, and the screen says so next to the control that does it.

**The cap is the feature, not a safeguard on it.** Memories reach the model as standing instruction, and twenty instructions that half contradict each other make behaviour worse rather than richer. A cap forces the useful ones to survive at the expense of the rest, which is the same reasoning `context-and-memory.md` gives for compaction, applied to something small enough not to need a job.

offload gets no exemption. Its tool refuses the eleventh, and it does not mention the refusal, because offload never explains a failure.

### offload writing one is a decision, and 004 said it would not be

`004-the-planner/feature-spec.md:41` puts memory writes outside the model's choice set by name: "Memory writes, conversation compaction and client-side actions are consequences of a turn, not decisions within it. As tools the model could skip them, silently, and no test could assert otherwise."

**That reasoning is about always-work, and a memory write is not always-work.** The three things 004 lists share a property: they must happen on every turn, so making them optional means they get skipped and nothing can tell. A memory is the opposite. Most turns should write none, the judgement of whether a sentence is a standing rule or a task is exactly the judgement a model is for, and "did it write one" is not a property any deterministic step could compute.

So the tool exists and **004's sentence is narrowed in the same change** rather than left contradicting this: what belongs outside the choice set is work that must happen every turn, and the list of examples loses memory writes.

What 004 was protecting is still real and is answered differently. A model that never writes a memory is invisible to a unit test, so the guard is an eval on both directions, not just one: a dump carrying a standing rule writes a memory, and a dump carrying a task does not.

### Two authors, and one rule between them

A person types a memory, and it is **stated**. offload writes one, and it is **learned**. Anything offload wrote is marked as inferred wherever it appears, so it is never mistaken for something you said.

**Corrections beat inference**, which `context-and-memory.md` already requires and this makes concrete:

- offload may edit a memory it wrote, as long as no person has edited it.
- The moment a person edits it, it is stated, and offload cannot change it again.
- **offload never deletes a memory.** Only people delete.

### In a shared thread the memory belongs to the thread, and delete still belongs to its author

Every member reads every memory and may edit any of them. A memory carries the person who **created** it and keeps them: John editing Ana's memory does not make it John's. Who it belongs to is visible without opening it.

**Deleting is the author's, and muting is everybody's.** This is the split content already has, decided during 005 for exactly this reason: with only delete available to everyone, a shared thread becomes a place where somebody else can destroy what you put in. OFF-3 states it as a MUST and the privacy page states it in public, that nobody can delete what they did not write themselves.

So a memory gains the thing content has in `archived_at`: **mute**. Any member mutes any memory, it stops reaching the model, it stays on the thread with its author still on it, and any member can unmute it. Muting is thread-wide rather than per person, the same as archive, and it still counts against the ten.

*This is also the only answer the product has to the case the security review named: a co-member writes "never file anything from Ana as a task", and because offload never diagnoses itself nothing points at the memory doing it. Mute is what Ana can reach for without destroying something John wrote.*

**One consequence, stated because it is new to the product.** Memories instruct the model, so a memory John typed shapes what offload does during Ana's turns. That is the intended behaviour of a shared thread, and it is the first place in offload where one person's typing reaches another person's model call.

### Deleting an account leaves your memories in shared threads

The same rule OFF-3 already makes a MUST: "Account deletion therefore never cascades into a shared thread, which is the one place the obvious implementation of 'delete everything of theirs' is wrong."

A memory on a shared thread survives its author's account deletion. What does not survive is the attribution: the account is gone, so the memory carries no name any more. That is the privacy-correct outcome rather than a gap, and it is legible because every other memory in a shared thread does carry one, so an absent name reads as somebody who left rather than as yours.

A memory on a thread nobody else was in goes with the thread, which goes with the account.

*The policy needs one word either way. Its account-deletion paragraph lists "your memories" flat and then makes a bold exception for "what you put into a thread you shared with other people". A memory plainly is that, so the exception has to visibly cover memories rather than reading as though it covers uploads alone.*

### Two consequences of the rules above, accepted rather than solved

**A refused memory is invisible.** offload's write at the cap gets the generic failure and says nothing, per AC-2. Nothing in the reply mentions a memory either way, unlike content, which gets "Added to Flat admin". So a person whose dump contained an explicit instruction gets no signal that it did not take, and finds out by opening the thread and counting. Accepted, and the cheapest fix later is for the reply to name a memory it wrote, which would also make AC-4's inferred marking reachable from the conversation.

**Memories are written from every client and managed only on the web.** `add_memory` fires on any filing turn regardless of where the dump came from, so a person who only uses the phone accumulates memories that shape offload's behaviour with no way to see, correct or delete one until they open a browser. This is worse than 005's web-first phasing, where the phones had nothing to view yet. Accepted only until the phones get the section, which task E1 asks the design system for.

### Reaching the model

A turn carries memories **only for the threads it touches**. `add_content` and `create_thread` hand back the target thread's memories in the tool result, so the model learns a thread's rules at the moment it files into it and not before.

The alternative was putting every thread's memories in the prompt up front. That is the OFF-8 failure written out: ten memories times every thread an account has ever made, growing forever, in every prompt. This way the ceiling is a stated constant that does not move as an account ages.

It has one cost and it is paid rather than hidden: **the model has already written the title by the time it learns the thread wants three-word titles.** The fix is `edit_content`, and **that tool already exists**: 006 revived it from 004's cut list and `decisions.md:84` records it. It is gated on authorship (`tools.ts:390`), and content the turn just created is authored by that turn's own account, so the model can already correct what it just filed. This feature needs no new tool for it and no change to that one.

*An earlier draft of this spec said `edit_content` was still cut and argued at length for reviving it. That was written from 004's feature spec, which 006 never amended and which still describes the tool as out of scope. The stale document is 004, and it is amended here.*

## Acceptance criteria

**Authoring**

- **AC-1** A member of a thread can add a memory of at most 200 characters, and it appears on the thread without a reload.
- **AC-2** A thread holds at most ten memories. A person attempting an eleventh is refused with the reason on screen beside the control that resolves it. offload attempting an eleventh gets the single generic tool failure and says nothing about it.
- **AC-3** offload can write a memory during a turn, and the memory records the message it came from.
- **AC-4** A memory offload wrote is marked as inferred wherever it is shown; one a person typed is not.
- **AC-5** Two memories with the same text cannot exist on one thread. A repeat returns the existing one and creates nothing.

**Correction**

- **AC-6** offload may edit only a memory it wrote that no person has since edited. A person's edit makes it stated, and a later edit by offload is refused.
- **AC-7** offload cannot delete a memory by any path.
- **AC-8** Editing edits the memory's full text, never the shortened form shown on the thread.

**Sharing**

- **AC-9** Every member of a thread reads and edits every memory on it, whoever wrote it.
- **AC-9a** Only the account that created a memory can delete it. Enforced server-side, per row, by author, per OFF-3.
- **AC-9b** Any member can mute and unmute any memory. A muted memory stays on the thread with its author, still counts against the ten, and does not reach the model. Muting is thread-wide, not per person.
- **AC-10** A memory carries the account that created it, and editing never moves it. In a shared thread, who it belongs to is visible without opening it.
- **AC-11** Access is resolved through `thread_members` on the thread, never through the memory's own account id. The account id is authorship and is never an authorization input.
- **AC-12** A memory on a thread the account cannot reach fails with one generic reason, identical whether it does not exist or belongs to somebody else.

**Deletion and undo**

- **AC-13** Deleting a memory is undoable for eight seconds, and nothing is destroyed before then.
- **AC-14** A soft-deleted memory does not count against the cap of ten, so deleting one and adding another works inside the undo window.
- **AC-14a** Restoring a memory is refused when the thread is already at ten, and the screen says why. *Delete one at the cap, add another, then press Undo: without this the thread holds eleven, through the one path the cap does not guard.*
- **AC-15** Deleting an account leaves the memories it created on shared threads in place, carrying no author. Memories on a thread that account alone was in go with the thread.
- **AC-16** Deleting a thread deletes its memories in the same transaction. `subject_id` is polymorphic and carries no foreign key, so nothing does this on its own.

**The prompt**

- **AC-17** A turn carries the unmuted memories of the threads it touches, and no others. The characters memories contribute to a prompt are bounded by a stated constant and do not grow with the number of threads an account has.
- **AC-18** `add_content` and `create_thread` return the target thread's memories.
- **AC-19** A thread's rules can be applied to content the same turn filed, without a second dump. `edit_content` already does this and is author-gated; the assertion is on the loop working end to end, not on a new tool.
- **AC-20** Memory text reaches the model as data on the untrusted channel, like every other tool result.

**Truthfulness and privacy**

- **AC-21** No memory text reaches an analytics event, a log, a trace or a job error. Memory text is dumped text for OFF-1: a person wrote it, or offload derived it from something a person wrote.
- **AC-22** The privacy policy's account-deletion exception visibly covers memories, not uploads alone, and its description of what offload makes from your content says memories now have two authors. Both before this ships.

## Depends on

- **004** for the tool loop, the whole-turn Undo and `MAX_TOOL_CALLS`. Its feature spec is stale in two places and is amended here: `edit_content` was cut there and revived by 006, and memory writes were placed outside the model's choice set.
- **005** for the thread page and its access helpers.
- **007** for the thread page's section vocabulary.
- **001** for the `memories` table, which it specified and which has never been migrated. Amended here, see `impl-spec.md`.

## Out of scope

- **The Memories tab.** It is an aggregation across the whole account, with account scope and person scope and a `people` table that also does not exist. Later, and it inherits this table.
- **Person-scope memories.**
- **The standing blurb**, the model-written summary at the top of a thread. Different feature, different failure mode, and the kits already draw it.
- **Memories that change layout deterministically.** "Always show the map on top" is `threads.attrs.widgets` and 007 already owns it. If the same intent could arrive as typed text there would be two writers for one fact, and the person would be right to call it broken when the map did not move.
- **Embeddings and retrieval.** Ten short rows per thread need neither.
- **Compaction.** Ten is small enough that nothing needs compacting. It arrives with account scope.
- **The phones.** Web only.
- **Prompt injection.** Deferred by the product owner, and recorded here rather than left implicit: a memory is an instruction delivered on the untrusted channel, and in a shared thread it is an instruction written by somebody who is not you. That is a real hole rather than a theoretical one, and it is open on purpose.

## Open, and needing the product owner

- **The privacy policy wording (AC-22).** Blocking, per `CLAUDE.md`. Two sentences, one pass: the shared-thread exception has to cover memories, and the bullet describing memories as offload's generalisations has to admit that half of them are now typed by a person.
- **`content.account_id` is `on delete cascade`** (`0011_the_planner.sql:31`), which contradicts the same bold sentence in the policy for content rather than memories. Nothing exercises it because account deletion is not built, so it is a trap rather than a live falsehood. Out of scope here, and the cheapest moment to fix it is before anything relies on it.
