# 038 Memories, feature spec

**Status:** drafted 2026-10-05 from the owner's direction of the same day and their answers to five questions, after a survey of how ChatGPT, Claude, Gemini, mem0, Letta, LangMem and Zep keep memories (Grounding, below). Revised the same day after the project-lead, security and client reviews; what changed is under Review. Built the same day on `feat/038-account-notes`.
**Surfaces:** the Core API and the agent. No new screen: the Memories tab is the fast follow (owner, 2026-10-05). Three small changes outside them: the privacy page, the admin panel's job names, and the design log.
**Depends on:** 014 (notes), 019 (calendars, AC-11 as amended 2026-10-05), 013 (asking back), 022 (shared threads), 032 (the nightly pass and the daily job), 035 (export and deletion)
**Amends:**
- **The vocabulary.** *Memory* comes back for one thing: what offload knows about a person across their threads. A **note** stays what a thread knows about itself. 014 retired *memory* because the person dumping something "cannot say which of the two they meant and should never have to". That stays true: the split here is scope, not type, and nobody chooses at capture. offload decides, the way it decides a thread. `CLAUDE.md` and the design readme's vocabulary table are amended on main.
- `docs/tech/context-and-memory.md`: the daily job gains a part, and *per-account derived context* in the prompt budget is this.
- 019 AC-11: a calendar named by who it is shared with that settles on none asks in the person's terms and remembers the answer.
- **OFF-1, by the owner's dated exception of 2026-10-05:** memories ship without a screen. See Constitution.
- The privacy page, before any code that writes a memory ships.

*Amended 2026-10-06 by 040, the Memories tab:* five kinds, *words* folded into *about*; a person adds, changes and forgets memories in the tab, which ends OFF-1's exception; at most 300 memories and 20 rules; and the 50 that reach a turn are chosen by meaning against the person's own words once there are more than 50.

## Why

Thread notes exist so a person does not repeat themselves inside one thread. The same is true across threads and nothing holds it. offload is told "Meera is my wife" in one thread and "add it to my calendar with Meera" in another, and has to be told again.

The case that started it: Meera is not on offload, so "my calendar with Meera" has nothing to find her by. Google's sharing list holds an address, not a name. offload asks "Which calendar?" among every calendar, every time, and learns nothing from the answer.

## What

### 1. What a memory is

**One sentence about the person that is true across their threads and will still be true next month**, at most 200 characters, stored in the third person ("Their wife is Meera."), with its class, where it came from (its origin), the day it was written and one source.

| Class | Is | Example |
| --- | --- | --- |
| **People** | Somebody in their life: the name, how they relate to the person, what the person calls them, and their birthday or the person's anniversary with them. Nothing else about that person: no address, number, email, health or opinions. | Their wife is Meera. Meera's birthday is 14 March. They call their mother Maman. |
| **Their things** | Accounts, calendars, places and belongings offload deals with, and what each one is. A place is a city or a name, never a street address unless they asked. | They share a calendar with Meera. Home is in Toronto. Their car is a 2019 Civic. |
| **About them** | Durable facts about their life that change how something is filed or answered: work, household, languages, the country they live in, their own birthday and other dates that recur, and what a name or a shorthand means wherever they use it. *Amended 2026-10-06 by 040: Their words folded in here.* | They work at Shopify as a designer. They have two kids, Sam and Leila. "The cottage" is the place in Muskoka. |
| **Their rules** | How they want offload to work everywhere, stated by them with *always*, *never* or *from now on*, about more than one thread. | They write dates day first. Work things never go in Home. |
| **Patterns** | Something they did on several different days, across threads, written as a fact and never as an instruction. | They pay bills on the 5th. |

**Never a memory**, whatever is said:

- **Something that happens once.** A plan, a task, an appointment, a trip: that is content, and the thread holds it with its reminder. A date is a memory only when it is a fact that recurs (a birthday, an anniversary).
- **Anything about one thread.** That is a note.
- **A guess.** Feelings, personality, motives, anything worked out rather than said or done. A pattern is something they did, not something they are.
- **The sensitive list, unless they asked offload to remember it**: health, religion, political views, sexuality or gender identity, ethnicity, criminal record, money and debts. "Remember I'm allergic to nuts" is kept; "ugh, my back again" is not. **Never, even when asked:** government ID numbers, account and card numbers, passwords, immigration status.
- **Anything that is not the person's own words**: a forwarded email, a calendar event or a calendar's name somebody else gave it, a web page, a photo's or a screenshot's text, another member's dump, note or row, offload's own replies, and a memory offload already holds.
- **Text they are only passing through**: something they asked to be shortened, translated or tidied.

Most days nothing is learned, and that is the expected outcome.

### 2. Three ways one is written

**a. Asked, in the turn.** "Remember that…", "from now on, everywhere…", "forget that…". The live turn writes the memory, or forgets one, and the reply names it, verb first, in the second person: *Remembered that Meera is your wife.* / *Forgot that P\*\*B is your calendar with Meera.* Only on an explicit ask; never otherwise. The sensitive list and the rules class can come from here.

- **Refused when the turn read anything that is not theirs**: a link, a photo, a forwarded email, a connected app, or another member's words beyond the thread's standing notes. offload cannot tell which words the request came from, so it asks for it alone: *Send that on its own and it will be remembered.*
- **Refused on the never-even-when-asked list**, with one clause that does not repeat the value: *Not keeping that one.*
- **A forget that matches nothing** says *Nothing like that was kept.*
- **Undo** on the turn takes back a remember or a forget, as it takes back anything else the turn did.

**b. Answered, to a question offload asked.** The first is the calendar one. When a calendar is named by who it is shared with ("my calendar with Meera") and nothing settles on one, offload asks:

> Filed "Pay mortgage". Which calendar is shared with Meera?

The name is the person's word with their own casing, clipped to 16 characters. The values are the matches when there are several, otherwise their approved writable calendars, up to four, with `Not that` last. The answer, tapped or typed, writes the event exactly as 019's answer after a name does: this event only, no pick in the thread, through the confirm-or-do test. It also writes the memory *They share a calendar with Meera.*, linked to that calendar by id. **The calendar's name is never in the memory**: it may be somebody else's words, and nothing needs it. A second answer for the same name replaces the first. `Not that` writes nothing, so the next "with Meera" asks again. No model writes this memory.

**c. Learned overnight.** A nightly **memory pass**, one per account, is a new part of the daily job, booked after the thread passes and not waiting for them. It is shown:

- the person's own messages since its last pass, at most seven days back: typed, spoken or shared from another app, **questions included**, since facts arrive in questions too; never mail, calendar, browser or untrusted messages, never another member's, never offload's. At most 60, newest first, 500 characters each, each its own structured entry. The Core API builds this set; the worker does not choose it.
- their own active thread notes that are not marked untrusted, at most 40, newest first: the compacted evidence a pattern needs, which seven days of messages cannot hold, and where a fact said in one thread already sits.
- the memories they already have, at most 50.

It may **add** a memory citing one message or note it was shown, **supersede** one with what is now true ("lives in Toronto" becomes "lives in Montreal" when they say they moved), and **fold** two that say one thing into one. It never deletes. It never writes the sensitive list or the rules class, never supersedes an asked memory unless citing a later message of theirs that says otherwise, never supersedes an answered one at all (only a new answer replaces it, since it carries the calendar), and never cites a message a forgotten memory came from. It adds at most five a night and holds at most 25 active learned memories.

### 3. Settling "with Meera" next time

"With Meera" settles in code on the calendar an answered memory is linked to, when the name matches the one the memory was written for: whole words, case and accents folded, the same flattening calendar names use. Before Google is asked and with no question. It beats the thread's pick, as a named calendar does under 019. Two memories for the name ask. A memory whose calendar has gone, been un-approved or stopped being writable settles nothing and asks again; the memory stays. The write still goes through the confirm-or-do test: a calendar shared with Meera is one somebody else sees, so it is put to the person first. This removes *which calendar*, not *shall I*.

### 4. Where memories go

**A closed list of calls gets them**: filing, answering, the nightly thread pass and the memory pass. Nothing else, including any call added later until its spec adds it here. The web reader, the mail look, the answer judge, classify, thread icons and the embed sweep do not.

**As data, in a user-turn block, never in the system prompt**, cached with its own breakpoint, under a heading saying these are things offload knows about the person. One exception, the same one 014 makes for a person's own thread notes: **the rules class is their standing instruction**, given as the person's own words, because a rule nobody follows is not a rule. Only the person makes one (2a), so nothing offload or anyone else wrote is ever obeyed from this block.

**At most fifty reach a prompt**: every rule, then the person's own (asked, answered, typed) nearest the person's own words in the call, then learned ones nearest, fifty in all, and all of them, in that order, while there are fifty or fewer. A learned one never pushes out one of the person's own. *Amended 2026-10-06 by 040, whose section 3 says which words each call measures against, and the fallback.*

**In a shared thread**, a memory may decide where and how something is filed, and **never changes the words of what is filed there**: titles and notes in a shared thread keep the person's own words (owner, 2026-10-05). "Dinner with my wife" stays that in a shared thread and may become *Dinner with Meera* in their own. A memory never reaches a call made for another account.

**Never into a web query.** A lookup's query and the address it fetches carry no memory text unless the person's own question names it.

### 5. Seeing and correcting, until the tab exists

- **Ask.** "What do you remember about me?" is answered from the block, as a list of sentences in the second person.
- **The export** lists every active memory with its class, origin and day (it already exports account-scope notes; a memory is one).
- **Say so.** "Forget that…" (2a). A new answer supersedes an answered memory (2b).
- **A forgotten memory leaves every prompt at once and is deleted when the turn can no longer be undone.** Its source message stays: forgetting a memory never takes the conversation it came from.
- **Deleting a message** removes a learned memory whose source it was. Deleting the account deletes every memory.

## Acceptance criteria

**What a memory is**
- **AC-1** A memory belongs to one account, is at most 200 characters, and carries a class from section 1, an origin (asked, answered, learned), the day it was written and one source: a message, a note, or the question it answered.
- **AC-2** No memory is written from mail, calendar, browser or untrusted messages, another member's message, note or row, offload's own reply, or a memory's own text. The answered path is not a message: it is a tap or a typed match on options the server wrote.
- **AC-3** No memory holds a government ID, an account or card number, a password or immigration status: the Core API refuses a long digit run and the shapes of a card number, an IBAN or a national ID, whoever wrote it. A People memory with an email address, a phone number or a street address is refused.

**Asked (2a)**
- **AC-4** A remember or forget happens only on the person's own explicit ask, measured by the eval (AC-19), and the reply names what was remembered or forgotten, verb first. The turn's record bears the reply out, so a turn that remembered something and filed nothing still says so.
- **AC-5** The Core API refuses a remember in a turn whose message is untrusted, not the person's, or from mail, calendar or browser, or in a turn that read a link, a photo, a connected app or mail; the reply is *Send that on its own and it will be remembered.* A refused never-list remember replies *Not keeping that one.* without the value; a forget matching nothing replies *Nothing like that was kept.*
- **AC-6** Undo on the turn reverses a remember or a forget. A forgotten memory reaches no prompt from the moment it is forgotten and is deleted once the turn's Undo has closed; no message, blob or reply is taken with it.

**Answered (2b)**
- **AC-7** A `create_event` naming a calendar by a person, settling on none, raises `Filed "<title>". Which calendar is shared with <name>?`, the name in the person's casing clipped to 16 characters and the whole text within the question bound, with the matches or the approved writable calendars, up to four, and `Not that` last.
- **AC-8** The answer, tapped or typed, writes the event under 019's rules for an answer after a name and writes one memory, origin answered, class Their things, *They share a calendar with <name>.*, linked to the calendar by id, with no calendar name in its text. A second answer for the same name supersedes the first. `Not that` writes no memory.
- **AC-9** A later `create_event` naming the same person settles on the linked calendar, with no question and no Google read and over the thread's pick, when exactly one active answered memory matches the name by whole words after flattening and its calendar is still theirs, approved and writable; the write goes through the confirm-or-do test. Otherwise it asks as in AC-7.

**Learned (2c)**
- **AC-10** The daily job books one memory pass per account per day, after booking the thread passes, only when the person has a message of their own the pass may read since its last pass. The pass is shown only what section 2c lists, within its bounds, built by the Core API.
- **AC-11** A pass may add at most five memories, supersede and fold, and never deletes. Each add or rewrite cites one message or note it was shown, which the Core API re-derives rather than trusts. It is refused the sensitive list (schema and a keyword gate in the Core API) and the rules class, never supersedes an asked memory without citing a later message of the person's, never supersedes an answered one (only a new answer does, since it carries the calendar), and never cites a message a forgotten memory came from.
- **AC-12** A pass adds nothing while 25 learned memories are active. A memory whose flattened text equals an active one is not added. A superseded learned memory is purged after 30 days, as 014's folded notes are.
- **AC-13** A pass whose answer does not fit its schema gets one repair and then applies nothing; a result posted twice applies once.

**Reach**
- **AC-14** Exactly filing, answering, the nightly thread pass and the memory pass are given the account's memories, at most fifty: every rule, then the person's own nearest, then learned nearest; a test lists every model call the worker makes and asserts the rest get none. *Amended 2026-10-06 by 040 (its AC-19 and AC-21).*
- **AC-15** The block is a user-turn block, never in a system prompt. The rules class reaches the prompt as the person's own instruction, the rest as data.
- **AC-16** A memory never reaches a call made for another account. In a shared thread, filing never puts a memory's words into a title or a note, measured by the eval.
- **AC-17** A lookup's query and fetched address carry no memory text unless the person's question names it, measured by the eval.

**Seeing**
- **AC-18** "What do you remember about me?" is answered with the active memories in the second person. The export lists every active memory with class, origin and day. Deleting a message removes the learned memory it sourced; account deletion removes every memory.

**Evals, hygiene, docs**
- **AC-19** A new memories eval principle covers each class, each never-rule, birthdays as facts and one-off dates as content, the sensitive rule both ways, superseding, folding, the shared-thread wording rule, the asked path and its refusals, and the web-query rule; `15-injected-text-is-data` gains a forwarded mail and a linked page that each say "remember that…", and another member's note that tries a forget. The impl-spec says which cases block the merge and the pass bar.
- **AC-20** No log line, trace, error, analytics event, push payload, step line, admin view or ledger row carries a memory's text: ids, counts, classes and outcomes only (OFF-1). The admin panel names the new job and counts memories apart from notes.
- **AC-21** Before any code that writes a memory ships, the privacy page says what memories are, how each kind is written, that sensitive ones are kept only when asked, that names and relations of people in their life are kept, how to see one (ask, export) and remove one (say so), and that every call now also carries them. `CLAUDE.md`, the design readme's vocabulary, `context-and-memory.md`, 019 AC-11 and the design `decisions.md` are amended in the same change.

## Out of scope

- **The Memories tab** on web and the phones: viewing, editing, muting. The fast follow, which takes these rows as `MemoryRow` already draws notes.
- ~~**Birthdays reaching Today or a calendar.** A remembered birthday reaches the model only.~~ *Amended by 042 (2026-10-10): the memory pass writes the month and day of a birthday or an anniversary it holds, reminders name it, and Today's Reminders section draws it once its reminders have begun. A birthday still never reaches a calendar.*
- **Retrieval.** Fifty sentences fit in every prompt; memories are not embedded or searched. *Amended 2026-10-06 by 040: each memory is embedded on its own row to choose the fifty, and is never in the search corpus.*
- **Person-scoped notes**, and anything shown about a connection.
- **Remembering a `Not that`.**

## Privacy

Memories are derived content about the person and, in People, about people in their life who may not be on offload: a name, how they relate, what they are called, a birthday or anniversary. Stored in plaintext like every note (OFF-2), sent to the same model providers as notes are, deleted with the account and exported with it. None of it reaches a web search. **The privacy page changes before any code that writes one ships** (AC-21), which is this spec telling the owner, as `CLAUDE.md` asks.

## Constitution

**OFF-1** holds that offload's picture of a person is shown to them and correctable. This ships without a screen. The owner accepted that on 2026-10-05 as a fast follow; it is recorded here as a dated exception, not a precedent, and it ends when the Memories tab ships. What stands in for the screen meanwhile: asking (section 5), the export, forgetting by saying so, and the reply naming every memory written or forgotten in a turn.

## Review, 2026-10-05

**Changed after the reviews.**

- **The calendar's name stays out of the memory.** A calendar's name can be somebody else's words, so the security review found the first draft's example writing a stranger's sentence into every prompt. The memory now reads *They share a calendar with Meera.*, and the id carries the link.
- **Remember is refused in a turn that read anything not the person's**, checked by the Core API. The first draft allowed it citing the person's message, which nothing can verify.
- **The rules class is the person's own, and is followed.** The first draft called the whole block data, so a rule would never have been followed. Rules now come only from asking, the pass cannot write one, and they reach the prompt as the person's instruction.
- **The pass has bounds and a place in the daily job:** 60 messages of 500 characters, 40 thread notes and 50 memories, after the thread passes. Questions count. The 40 notes are what make patterns detectable, which seven days of messages could not.
- **The sensitive list is gated in code as well as in the prompt** for the pass, and ID and number shapes are refused in code for everyone.
- **Caps.** 25 learned memories, so asked ones are never pushed out, and superseded learned ones are purged after 30 days.
- **A forgotten memory is deleted, never takes its source, and is never re-learned** from the same message.
- **Shared threads keep the person's words in what is filed** (owner).
- **Reach is a closed list**, the block is never in the system prompt, and memories stay out of web queries.
- **What the person sees:**
  - The reply names what was remembered, and the turn's record now has a reason for it.
  - The question keeps the row's title, so Today's card still makes sense hours later.
  - A typed answer counts like a tap.
  - The refusals have their lines.
- **Seeing and correcting:** you can ask what offload remembers, and the export lists memories with class, origin and day.
- **Birthdays and anniversaries are facts, not content** (owner).
- **The hygiene and doc lists are complete:** analytics, push payloads, the step line, the admin panel and the design log.

**Not changed, deliberately.**

- **The nightly pass ships now.** The project lead recommended holding it until the tab, as the risky half. The owner chose to ship it, and the bounds above are what make that reasonable.
- **The People class keeps names and relations** of people who are not on offload. That is the feature, and the privacy page will say so.

## Changed by the code and security reviews of the build, 2026-10-05

- **Asking is checked in code, not only in the prompt.** A remember needs "remember", "from now on", "keep in mind" or "don't forget" in the person's own message, and a forget needs "forget". A rule needs every word of it said, and an "always", "never" or "from now on". Before this, half the words matching was enough, so another member's note or a tool result in the same turn could have written a standing instruction.
- **An answer to the calendar question is remembered only when the name is in the person's own message and the turn read nothing of anybody else's.** Otherwise the question is the plain "Which calendar?" and nothing is kept. The name is clipped to what the question shows, and held to what a People memory may carry.
- **The answer's Undo takes its memory back** and puts back the one it replaced. **Two answers for one name at once** are serialised, and the later one wins.
- **The nightly thread pass sees memories only in a thread nobody else is in**, since every member reads what it writes. **The memory pass learns only from thread notes in threads only the person is in**, since a note in a shared thread may summarise another member's words.
- **Any replaced memory goes after 30 days**, whoever wrote it, which is what the privacy page says. The export lists each memory's class.
- **Number shapes are checked after normalising,** with dots and slashes as separators too. Nine digits is the line, so a birthday written with its year is kept.

Not changed: a per-turn cap on remember calls (the prompt budget's fifty already bounds what reaches a model), and the forgotten-sources table keeping message ids, never words, until the account goes.

## Grounding: what the field does (research, 2026-10-05)

Read as leads, not facts: several sources are leaked prompts or third-party write-ups.

- **A small profile in every call, the rest searched.** ChatGPT and Claude settled on roughly 1k to 4k tokens of saved facts in every call, with history searched on demand. offload's content is already the searched layer.
- **Two write paths.** An inline tool for an explicit "remember" or "forget" (ChatGPT's `bio`), and a background pass that consolidates and retires stale facts (ChatGPT's "dreaming", Claude's former daily synthesis, LangMem, Letta's sleep-time agents).
- **Unasked inference is where the harm is.** A study of 2,050 real ChatGPT memories found 96% created without being asked, and another found over 95% of health entries inferred from passing remarks. Gemini is the most conservative, and is the model for the sensitive rule here.
- **The same sensitive list everywhere**, and Claude's hard never-store list even when asked.
- **Supersede, never delete.** mem0 let its model delete on contradiction, lost both facts, and dropped deletion in April 2026. Zep invalidates instead. That is OFF-1's existing rule.
- **A date and a source on every memory.**
- **Failure modes designed against:**
  - untrusted text writing memory (SpAIware, MINJA);
  - stale facts held as current;
  - consolidation dropping a fact's limits;
  - sycophancy from a condensed profile;
  - one person's memory surfacing where others see it.

## Amended 2026-11-06, the owner

**A memory takes priority over a thread's note when the fact is not about the thread.** The nightly thread pass read "Thursday grocery shopping with Ritu (meera's mom)" and wrote "Ritu is Meera's mom." as a note on Home, and the memory pass, a second later, took it for a memory from that note. The fact sat in both places, and the thread's copy was the wrong one.

- **Learning.** The thread pass writes no note that would stand just as well with the thread gone: who somebody in their life is, what is true of the person. The memory pass reads the same dumps, so nothing is lost. What somebody is to this thread stays a note: "Ana is doing the electrics."
- **Keeping true.** A note offload wrote that a memory the pass is shown already says, and that is not about the thread, is set aside. A sentence a person typed stands. This reaches a note the live turn filed from a dump of that one sentence, which still has to land somewhere: the live turn never writes a memory unasked (2a).
- **Shared threads.** A pass in one is shown no memories (section 4), so the second rule has nothing to read there and such a note stands. The first rule needs no memory and holds.
- **A memory outlives the note it came from.** `sweepMemories` takes a learned memory whose source note has gone, which is right when a person deleted the note and was wrong when offload's own thirty day purge took one it had set aside: this rule would have deleted every memory it deferred to, a month later. `applyCompaction` now gives a note no `purge_after` while a memory cites it, and sets such a note aside when a pass asks to remove it.
