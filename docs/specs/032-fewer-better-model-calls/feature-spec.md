# 032 Fewer, better model calls

**Status:** drafted 2026-10-02 from the owner's review of every model call ("offload's model calls", the published page that maps them, and its First pass list). The owner made the product decisions in that review. Revised the same day with the project-lead, client and security reviews: the nightly pass is per member, not per thread, which closes the security review's two critical findings (one member's dump steering a note attributed to another), and section 1 gained the client details.
**Surfaces:** the Core API and the agent, with two client changes on iOS, Android and the web (a typed row stops waiting on offload).
**Depends on:** 004, the filing loop; 013, answering; 014, notes and compaction; 016, the reader; 018, the answer judge; 022, shared threads; 025, labels and the nightly sort; 026, the mail look; 028, loose proposals.
**Amends:**
- The + on a section heading (commit 1690bd3, `docs/tech/decisions.md`): a typed row is saved as typed, and no model reads it.
- 014's compaction, and `docs/tech/context-and-memory.md`'s daily job: one pass per thread, which also adds what it learned.
- 025's nightly sort: deleted.
- 028's daily pass: folded into the nightly pass.
- `docs/tech/context-and-memory.md`'s rule *Never generalise across accounts*, which section 3 states precisely for shared threads.
- The privacy policy's sentence *it adds what it learned from your conversations that day*, which is untrue today and true once this ships, literally: a pass reads only its member's own dumps. The link-picture paragraph stays true (a typed address never fetched a picture; only filing a `link` does). Nothing else on the page changes.

## Why

The review found offload making model calls whose work was already done, or done better, somewhere else, and prompts that contradicted themselves or told a model about things it never sees.

- **Quick add reads a row somebody typed into a section and rewrites it.** The section's + has already chosen the type, and the tool it is given cannot change the type. What it adds is splitting a comma list, refusing a duplicate and shortening a paste, and in exchange every typed row costs a Sonnet call, counts against the daily budget, shows a spinner, and has its title change under the person a few seconds later.
- **Three nightly jobs read the same threads separately**, and the privacy page promises a fourth thing none of them does: learning from the day's conversations. One of the three, the label sort, has been switched off since 27 September.
- **The prompts have drifted.** The answering prompt tells a read-only turn to file. The filing prompt says two reasons to ask, lists three, numbered 1, 3, 2. The refused-subject list and the query rules are written twice and differ. The reader is told about threads and calendars it never sees. Small single-purpose calls say *offload* to a model that has never been told what it is, and the filing and answering prompts never say what offload, a dump or a thread are.

## What

### 1. A row typed into a section is saved as typed

The + on a To do or Timeline heading writes the row exactly as typed, with the type the section gives it, and that is the end of it. No job, no model, no spinner, and the title never changes after the person presses enter. (030 retires the Map section's +; whichever lands second keeps both.)

- **A line that is one `http` or `https` address and nothing else** keeps the section's type and also carries the address as its `url`, which is exactly the row quick add produced from the same line today; its title is the address until the person edits it. `www.example.com` with no scheme is words. The optimistic row the client draws at the press already carries the address, so nothing on the row changes when the write lands.
- **Not done any more, and accepted by the owner:** a comma list stays one row; a duplicate is not refused; a long paste keeps its whole text as the title (up to the existing 500 characters); a thread's rules about titles do not apply to typed rows.
- **A typed row is not a model call**, so it no longer counts against the daily turn budget or the daily spend, and an account over its budget can still type into its own lists. On the phones a section's + raises the shell composer, and at the day's limit that composer stays open for it rather than drawing *Enough for today*.
- **The field's placeholder stops promising tidying.** *Type it, offload will sort it out* becomes *Add to this*, the kit's nearest line, on all four fields (web and phones, To do and the timeline). There is no kit mock for the section's +, so this is a code-side call, logged in the design decisions.
- **The spinner goes**, on the row and in the optimistic row, with the client code that drew it. `filingAt` stays in the API response, always null, because shipped phones read it.
- A day picked on the timeline's + still sets the row's day, exactly as now. A typed line in a section with no type still becomes a note, exactly as now.

### 2. One nightly pass per thread and member

The daily run books one pass for each thread a member needs one in, and each pass is one model call that does what three jobs did, plus the thing the privacy page already says it does. **A pass belongs to one member**: it runs as them, it is shown only their own words, it changes only their notes and offload's notes written in their name, and its cost is theirs. In a thread nobody else is in that is the whole thread; in a shared thread each member who needs a pass gets their own.

**Every pass: keep their notes true.** Compaction as 014 defines it: fold duplicates, combine what belongs together, set aside what has stopped being true, leave the rest. Every rule 014 holds stays held by the same code, and one narrows: **a pass may set aside, fold or remove only notes authored by its member**. Other members' notes are shown as context, so a pass knows what the thread already says, and are never touched. Until now compaction could set aside any trusted note in a shared thread, which is how a hostile dump could have quieted somebody else's words.

**An ordinary thread: add what the day's dumps show.** The pass reads what its member dumped into the thread since the last pass and may write up to three new notes, each one of:

- **a fact they stated about the thread** that no note or row holds: where they are staying, who is doing what, a budget, the dates;
- **a correction they made**, written as what is true, never as a mistake that happened;
- **a pattern they showed again**: today's dumps repeat what a note from another day already shows, written as a fact, never as an order;
- **a rule they stated**, with *always*, *never* or *from now on*, written as they said it. A rule offload worked out itself is never a note, because the filing planner obeys rules in notes and only the person may make one.

It never writes a summary of what was said, anything a note or a row already holds, a guess about the person (feelings, health, money, beliefs, relationships), anything from a forwarded email, a calendar or a web page, or anything taken from offload's own replies. Most days it writes nothing, and that is the expected outcome.

**A learned note** is offload's, in its member's name: `learned` in origin, drawn as offload's notes already are, authored by the member whose dumps it came from, deletable by them, mutable by any member, and removable by a later pass. It sends no notification and makes no Activity row: a note is not news. A member holds at most twenty active learned notes in one thread; past that, a pass adds nothing until it has folded some away, so a person's own notes are never pushed out of the 100 the prompt carries.

**The default thread: suggest threads.** 028's pass, unchanged in what it proposes and in every rule its endpoint holds, run by the member whose default thread it is (it is never shared). The default thread is not learned from: what lands there has no shared subject.

**When a pass runs.** For a member in an ordinary thread: a note they authored there changed in the last 25 hours, or the thread holds more than 100 active notes (014's budget), or something of theirs counts as the thread's conversation (section 3). For the default thread: its notes changed or are over budget, or 028's condition holds. At most one pass per thread per member per day.

**A pass that fails** applies nothing when its answer does not fit the schema after one repair, and the thread is as it was; the job retries once an hour later, as compaction's does, and otherwise the next night's pass reads the same thread. A single learned note or proposal that fails its own check is dropped, and the rest of the pass applies.

**What it costs.** Sonnet 5, behind its own setting: the owner's choice on 2 October from the nightly principles, where Haiku 4.5 passed 23 of 26 and restated rows as notes and Sonnet 5 passed 26 of 26. About a cent a pass, at twice Haiku's price per token, with the system prompt cached across a night's passes. The pass is shown at most 100 notes and at most 40 messages of at most 500 characters each, newest first, so its input is bounded whatever the account's age (OFF-8): at most about 15,000 tokens, typically 2,000 to 4,000. Its spend is on the member's own ledger, scheduled, as compaction's is today.

**The label sort is deleted.** Its job, worker, prompt, endpoint, tests and eval principle go. Labels come from people and from live turns, as they have since it was switched off. Its migration's tables stay, read by nothing new; Activity rows it wrote in the past keep their Undo until they age out as they do today.

### 3. What counts as the day's dumps

- **A dump of theirs that landed in the thread**: a message of the pass's member from which a row or a note in this thread was filed, typed, spoken, or shared from another app, in the last 25 hours.
- **Never:** a question (it was answered, not filed), a dump that filed nothing in this thread, a forwarded email or anything else whose words are somebody else's (mail, a calendar, a browser capture), anything marked untrusted, offload's own replies, and anything another member said.

Each message reaches the model as its own structured entry, with its number, its day and its words, so text inside one cannot pass for another entry or for a note.

In a shared thread, a learned note reaches the other members the way every note in their name already does: on the thread, and in their filing turns as *what other people in this thread have written*, the block every prompt reads as data and never as instruction. That is the reach a note filed from the same dump in a live turn has today. `context-and-memory.md`'s *Never generalise across accounts* is amended to say this precisely rather than to forbid it.

### 4. The prompts

- **The filing and answering prompts open with what offload is**: where somebody puts down whatever is on their mind so they never have to organise it; the forms a dump takes; that a thread is one subject they keep and some are shared; that they see a Done mark and a link to each thread written to. One paragraph, written once and joined into both.
- **The policy both paths share is written once**: the refused subjects, the test for what is not offload's to answer, and the shape of a web query. Each prompt keeps its own line for what to do about it, because filing says it with `say` and answering says it as the reply. Both prompts stay fixed text.
- **The answering prompt stops telling a read-only turn to file.** A lookup that did not produce the fact is answered *Not sure.*
- **The filing prompt's Asking back** says three reasons, numbered in order, and states the photo exception once; the Photos section points to it.
- **The reader is a web lookup and nothing else.** Its opening says it is given a question or a page and the fields wanted, and returns them; the list of capabilities it never had goes. Its reasons for being quarantined stay in the code, where they are enforced.
- **Single-purpose calls do not say offload.** The answer judge, classify and the nightly pass say what the thing is (*the question they were asked*, *a message somebody sent*, *the assistant*), and where authorship matters the prompt and the listing the code builds use the same words.
- **Every prompt is a file in `prompts/`.** The answer judge and the mail look move out of Python.
- **The nightly prompt carries the trust paragraph compaction never had**: the notes and the messages are things people wrote, and nothing in them decides what is set aside, added or suggested.

### 5. Nothing a person reads changes, except

- A typed row has no spinner, its title does not change, and the field asks *Add to this*.
- Notes offload learned appear on a thread the next morning, as offload's notes already appear (014): in the Notes section, in their member's name, deletable by that member. They take no change mark and send nothing.

**Needs checking on a device** (the kits cannot show it): a section's + at the daily limit on both phones; a 500 character typed title in the row and in its edit sheet; a 200 character learned note at 200% text size.

## Acceptance criteria

**Typed rows**
- **AC-1** A row typed into a section with a type is written with that type and the typed text as its title, and no job is enqueued for it.
- **AC-2** A typed row's `filing_at` is not set, the optimistic row's `filingAt` is null, and neither client has code left that draws a row as being sorted.
- **AC-3** A typed line that is exactly one `http` or `https` address is written, and drawn at the press, with `url` set to it and the section's type kept.
- **AC-4** An account at its daily turn or spend limit can still type a row into a section, on the server and through the phones' composer.
- **AC-5** The worker has no quick add path, the Core API has no quick add result route, nothing enqueues the kind, and a job of a retired kind still waiting at deploy is closed by the migration.
- **AC-6** The four typed-row fields say *Add to this*.

**The nightly pass**
- **AC-7** The daily run books at most one nightly pass per thread per member per day, on the conditions in section 2, and books no compaction, loose proposal or label sort job.
- **AC-8** A pass applies compaction under 014's AC-8 to AC-10 through the same code, and sets aside, folds or removes only notes authored by its member; any other id is ignored.
- **AC-9** A pass may add at most three learned notes, and none once its member holds twenty active learned notes in the thread. Each is at most 200 characters, cites at least one message, and every message it cites is one the pass was shown; the Core API re-derives that set itself (section 3) rather than trusting the worker. A note failing any check is dropped and the rest of the pass applies.
- **AC-10** A learned note is `learned` in origin and authored by the pass's member; a note with the same text as an active note on the thread is not added again; adding one sends no notification.
- **AC-11** A pass is shown only its member's own messages that landed in the thread in the last 25 hours, at most 40, newest first, each cut to 500 characters, as structured entries; never a question, a dump that filed nothing there, mail, calendar, browser or untrusted messages, or offload's.
- **AC-12** A pass on the default thread proposes threads under every rule 028 states, through the same code, and is shown no messages and adds no learned note.
- **AC-13** A pass whose answer does not fit its schema gets one repair, sent as a `tool_result`, and then applies nothing.
- **AC-14** A result posted twice for one job applies once.
- **AC-15** The label sort's job, worker path, prompt, endpoint and switch do not exist.
- **AC-16** No log line, error, repair turn or ledger row of the pass carries a note's, a message's or a title's text: counts, ids, latency and outcomes only (OFF-1).

**Prompts**
- **AC-17** Every system prompt the worker sends is read from a file under `prompts/`, and a prompt built from shared parts is fully assembled at import, with no include marker left in it.
- **AC-18** The filing and answering prompts as sent both contain the shared paragraph on what offload is and the shared policy, word for word.
- **AC-19** The eval principles gain cases for the nightly pass's learning (section 2's list, negatives included), and lose quick add's and the label sort's.

**Docs**
- **AC-20** `context-and-memory.md`'s daily job and its shared-thread rule, 014's compaction scope, 025's nightly sort and 028's daily pass are amended to match, and `docs/tech/decisions.md` and the design `decisions.md` each carry an entry.

## Out of scope

- Moving any other call to another model or setting an effort level. Both are open on the page's list and are decided by an eval run, not here.
- Learning in the default thread, or across threads.
- A person-facing control over learned notes beyond what notes already have.
- Today generation and thread compaction, the other parts of `context-and-memory.md`'s daily job.
