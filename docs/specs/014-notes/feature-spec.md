# 014 Notes, feature spec

**Status:** drafted 2026-09-10
**Surfaces:** web, iOS, Android, the agent plane, and the privacy policy
**First of two.** 015, the timeline, reads what this produces and does not work without it.

*Amended 2026-10-05 by 038 and 2026-10-06 by 040: memory is a word again, for what offload knows about a person across their threads (account scope) and nothing else. A note stays what a thread knows about itself, as this spec made it. The phones' Notes tab became Memories, at the route `memories`, with `/notes` redirecting. AC-4's search for the word memory holds for anything about a thread.*

## Why

offload has two words for one idea and nobody outside the code can tell them apart.

A **memory** is "a short standing fact about a thread". A **note** is what every dump becomes when it is not a task, a link or a file: `add_content` defaults to `type: "note"`. Both are a sentence somebody wrote about a thread. They differ in ways nobody asked for:

| | memory | note |
| --- | --- | --- |
| Reaches the model | yes, every turn that touches the thread | never |
| Can carry a date | no, by rule | yes, and nothing reads it |
| Capped | ten, hard | unbounded |
| Where it lives | its own section | "Everything in here" |
| Searchable | `memory_chunks` | `content_chunks` |

008 drew the line with a test: "if it would show up in a widget, it is content". That test was right for a product with no dated sentences in it. **It stops working the moment a sentence has a date**, which is exactly what 015 needs. "We're staying in Istanbul 10-12th" is a fact about the thread, it is not a task and nobody ticks it, and under the current rules it has to be content, so it never reaches the model, and the thread's own model does not know where you are staying.

The person dumping it cannot say which of the two they meant and should never have to. That is the premise of the product applied to its own data model.

So: **one concept, called a note.** It can carry dates. It reaches the model. It is bounded by a prompt budget rather than by a wall, and compaction is what keeps it under.

## What

### One word

Memory becomes **note**, everywhere a person can see it: the thread section, the phones' tab, the privacy policy, the marketing site, the tool the model calls, and the identifiers in the code. `memory` leaves the product vocabulary and `note` takes its place.

*This is a change to the vocabulary list in `CLAUDE.md`, which names memory as one of six approved words, and to `.claude/skills/offload-design/readme.md`, which uses the word in four places including the phones' tab glyph. Both are amended by this feature rather than left disagreeing.*

**The screens that carry the word and the screen that carries the feature are not the same screens.** `WMemories.jsx`, `MemoriesScreen.jsx` and `M3MemoriesScreen.jsx` are the account-wide browsing screens, which this feature leaves alone: they change a label and nothing else. **The surface that actually ships here, the thread's Notes section, has no mock in any kit and never has**, which 008 recorded when it built the section against component contracts instead. 014 adds dates, a body, a folded-history control and an over-budget state to that same unmocked surface. So this feature commissions mocks rather than renaming existing ones, and the design system grows in four places:

- **`MemoryRow`** has no slot for a date, a place, a body, or a folded or over-budget state. It is extended and renamed, with the entry in `decisions.md` carrying its **Design system impact** field.
- **The folded-history control** has no governed pattern. The nearest built thing is the archived-content row on the thread page, which is bespoke. Either it becomes a pattern or this one is logged as a divergence.
- **The section heading with a count** is a raw `h2` in the built section rather than `SectionHeader`, which is a divergence that already exists and gets resolved here rather than copied again.
- **The phones' tab glyph** was chosen for the word Memories. It is looked at again, not carried over by inertia.

### A note can have a date, and most do not

A note carries `occurs_at`, an optional end, and `due_at`. It carries a place. It carries no tick, because that is what makes something a task.

*Amended 2026-09-16.* It carries a place in its section. This spec first said a note carries no priority either, and that held until somebody wanted to move one: a section ordered by when each sentence was written can only be rearranged by writing the sentence again, and writing it again is what makes it the newest thing said, which is not what moving it means. So a note has a `priority` on the same 0 to 100 scale content uses, every note starts at 50, and the section reads highest first then oldest first, which for a section nobody has touched is the order it always had. A person moves a note by dragging its row, on every surface, and the drop is the same midpoint-and-re-spread rule 007 states for To do. Nothing else writes it: not the tool, not compaction, and a note offload writes lands at 50 among the untouched ones.

**It is not precedence.** Which of two disagreeing notes is true still turns on when each was last written, and moving a note does not touch that. A note dragged to the top of the section is not thereby the newest thing said, and the prompt still reads the section oldest written first.

Most notes have no date at all, and nothing about them changes. A note that has one appears on the timeline (015) and, when it also has a place, on the map that thread already earns.

### Everything you dump as a sentence lands here

`content.type = "note"` goes away. A dumped sentence is a note, in one place, with one shape. Tasks, events, links, files, images, voice and locations are unaffected and stay content.

**A note is not in "Everything in here" any more.** It is in the thread's Notes section, which is where somebody looks for what is true about a thread, and it is there once rather than in two lists. This is a visible change to where a dumped sentence appears, and it is the point of the feature rather than a side effect.

**A repeat from a person lands; a repeat from offload does not.** 008 made a duplicate a no-op, which is right for a model asked the same question twice and wrong for a person, who dumps a sentence and watches nothing appear. The rule keeps the job it was built for and stops applying to people.

### A long note keeps its words, and the model reads the short form

A note's text is at most 200 characters and that is what reaches the model. A note may also carry a longer body, up to 4000 characters, and **the body never reaches a prompt**.

*Without this, a dumped paragraph has nowhere to go: it is not a task, its type no longer exists, and truncating it into 200 characters destroys what somebody dumped. The body is how "you dump things in" stays true for a paragraph.*

**Who writes the text.** A dump that fits in 200 characters is the note, word for word, and carries no body. A dump that does not fit keeps every word in the body, and offload writes the text over it. That second case is inference standing in front of somebody's own words, so **the note is marked as offload's wording wherever it appears**, the same mark an inferred note already carries, and editing the text is one tap. The rule matters because the text is what instructs: without the mark, a sentence offload wrote reads on screen exactly like a sentence you wrote.

**Where the body is.** The row shows the text. Opening the note shows the body under it, and the editor edits both. A note with a body says so on the row, because a row that silently hides four thousand characters is a row people stop trusting.

### One hundred is a prompt budget, not a wall

**Nothing you dump is ever refused.** A note always lands, whatever the thread already holds. That is not negotiable and it is the difference between this cap and 008's.

A thread's **active** notes are the ones that reach the model, and there are at most 100 of them. When a thread goes over, a compaction job folds the set: it merges what overlaps and generalises what repeats, and produces a smaller set that says the same things.

**Compaction never deletes, and what it folded is history.** The notes it folded from are **superseded**: out of the prompt, out of the section, kept on the thread as a record and still findable by search. They are not a second list somebody works with, and there is no restore: once a set has been folded, the folded ones are what it used to say. This is what `context-and-memory.md` already requires, that compaction bounds the prompt and does not delete what it compacted from, and what 008 states as a rule, that offload never deletes a note and only people do.

**What was folded is counted, never silently dropped.** The section says how many notes have been folded into the ones on screen, and reading them is one control away. Anything else would mean offload quietly rewriting sentences somebody typed.

**While the job is behind, the screen tells the truth.** A thread that has passed 100 shows the count it actually holds. Nothing freezes at a hundred, nothing spins, and no row is marked as waiting on a job: compaction is offload's work, not yours, and a thread mid-fold is a thread that is fine. The only visible change is the one AC-12 requires, and it appears when a note stops instructing rather than when a job is queued.

**The budget is enforced when the prompt is assembled, not by hoping the job ran.** A turn carries the 100 most recently written notes of each thread it touches, whatever the thread holds at that moment. Compaction is a background job and is allowed to be minutes behind; the prompt is bounded either way, and there is no state a note can be in where the bound depends on a job having finished.

**What that costs, stated rather than implied.** `docs/tech/decisions.md` records the ceiling as three constants multiplied: 10 notes times 200 characters times 8 tool calls, 16,000 characters per turn. This feature moves the first number to 100, so the same arithmetic gives **160,000 characters, worst case, per turn**, and one thread's own notes now exceed the whole of the old ceiling. It is still three constants and still does not grow with the age of an account, which is what OFF-8 asks, and it is still ten times the number this repo already ratified. `decisions.md` is amended in this change rather than left describing the old one.

*A turn-level ceiling is the cheap way to keep the worst case honest: 100 per thread, and no more than 200 notes across the whole turn. Eight distinct threads at 100 notes each is not a real turn, and a number that only bites in a case that does not happen is a number worth having.*

**Compaction resolves rather than summarises.** Its job is not to shorten a thread's notes, it is to work out which of them are still true. Four things, and only the first two are what the word usually means:

1. **Duplicates go**, literal and conceptual. Two sentences saying one thing become one.
2. **What belongs together is combined** into the fact it adds up to.
3. **What has stopped being true is dropped.** A date that has passed, a plan that was replaced, a note about something finished.
4. **What was learned that day is added**, from the conversations, which is the only route by which something said in passing and never filed reaches a thread's notes at all.

Shortening is what falls out of that rather than the goal.

*Amended 2026-10-02 by 032: compaction is one part of a nightly pass per thread and member, which also adds what that member's day of dumps shows, and which may set aside, fold or remove only notes its member wrote. Security review L27, closed.*

**It runs once a day, as part of one job per account**, alongside Today generation and thread-level compaction. That job is described in `docs/tech/context-and-memory.md`; this feature builds its first part and nothing else in it.

**Superseding is offload's; deleting is not.** offload may set any note aside, including one somebody typed, because that changes what it acts on and destroys nothing. It may delete only notes it wrote itself. A sentence a person typed straight into a thread is not a derivation of anything, it is the dump, and living in a derived table does not make it offload's to remove. OFF-1 was amended on 2026-09-10 to say exactly this.

**A folded note keeps an author, and folding never crosses one.** offload's notes carry the account whose turn wrote them, and on a shared thread that means several members' inferred notes sit side by side. Compaction folds within one author's notes only, and the note it produces carries that author. Merging across two people would make a row nobody wrote, which OFF-3 has no answer for: either somebody can delete a synthesis of another person's notes, or it is authorless from birth and everybody can.

**Corrections still beat inference.** A note a person typed is never rewritten into a generalisation and never deleted. It can be set aside once it has stopped being true, which leaves their words on the thread and takes them out of what offload acts on. A note derived from a connected app is never folded at all: folding it would mean a model rewriting text a stranger controls and handing back a sentence that no longer looks like it came from an app. If a thread holds more than 100 person-typed notes, compaction cannot get under the budget: the 100 most recently updated instruct, the rest do not, and the section says so plainly rather than pretending they all reach the model.

### Only what a person wrote instructs

A note reaches the model in one of two lists, and the split already exists in the code from 012:

- **What the thread's people wrote.** Typed by any member, or written by offload from something a member dumped themselves. Read as instruction.
- **What came from a connected app.** Derived from a calendar event, an email, a page. Read as data, never obeyed, whatever it says.

This feature keeps that split, states it as a rule rather than a calendar detail, and applies it to every note. A connector that ships later inherits it.

**A co-member's note still instructs.** John's note shapes what offload does on Ana's turns, in a thread they share. That is what 008 decided and what a shared thread means, and mute is what Ana reaches for.

**And the channel gets wider here, which is a change rather than the old hole restated.** Under 008 a sentence reached the obeyed list only by being classified as an explicit rule and written through `add_memory`: rule-phrased text, a model deciding, ten per thread. Under this feature a note is what any dump becomes by default, a hundred of them reach the model, and whether one is a rule is decided when the model reads it rather than when something wrote it. So the gate moves from write time to read time, and somebody who can put a sentence on a shared thread no longer has to phrase it as an instruction to be somewhere instructions are read. SEC-1 says person-dumped text travels as data and is never treated as an instruction; this makes the exception to that the default rather than a narrow case.

**So the containment `decisions.md` already named is taken here rather than deferred again.** A turn carries three lists rather than one: notes you wrote, notes other members of the thread wrote, and notes derived from a connected app. The first is instruction. The second is read as what somebody else in the thread has said, weighed accordingly. The third is data and is never obeyed. In a solo thread, which is almost all of them today, the second list is empty and nothing about the prompt changes.

### A newer note beats an older one, and the prompt is what enforces it

Compaction is a job, so it runs after the fact and it can be minutes behind. In that window a thread holds both "we're staying in Alfama" and the note from Tuesday that replaced it, and the model has no way to tell which is current. **Resolving that is compaction's real work, and the prompt covers the window before it runs.**

So every note reaches the model **with the date it was last written**, oldest first, and the prompt states the rule: when two notes disagree, the newer one is what is true. A note is not an eternal fact, it is the most recent thing somebody said about the thread.

This holds after compaction as well as before it. Compaction folds what it can, and everything it has not reached yet is still ordered, still dated, and still resolved the same way.

*Precedence is `updated_at`, not the note's own date. "We arrive on the 14th" written yesterday beats "we arrive on the 12th" written last week, whatever the two sentences say about the calendar. Editing a note is therefore how a person makes an old note current again, which is the behaviour they would expect from editing it.*

### The model is told what a note is, and it is no longer only rules

Today the prompt says of memories: "read them and do what they say". With facts in the same list that instruction is wrong: "we're staying in Istanbul 10-12th" is true, not an order. The prompt says instead that notes are what is true about the thread, that some of them are rules, that a rule is followed, and that the newer of two notes that disagree is the one that counts. The change is measured with `/test-llm` against held-out cases rather than assumed.

### What does not change

Authorship, delete, mute, sharing and Undo are 008's and stay exactly as they are. Any member reads and edits any note. Only its author deletes it. Any member mutes any note, thread-wide and reversibly. Deleting is undoable for eight seconds. Account deletion leaves your notes on the threads you shared and takes your name off them.

## Acceptance criteria

**One concept**

- **AC-1** A note holds text of at most 200 characters and an optional body of at most 4000. Both are stored as given; neither is silently truncated.
- **AC-2** A note can carry `occurs_at`, an end, `due_at` and a place, and any of them may be absent. A note carries no tick. *Amended 2026-09-16:* it carries a `priority`, which is where it sits in its section and nothing else.
- **AC-2a** *(2026-09-16)* Any member can drag a note to a new place in the section on web and both phones, the section reads back in that order everywhere, and the move leaves `updated_at` alone: the prompt's order and precedence are unchanged by it. Reversible, one Undo for every number written.
- **AC-3** Nothing in the product creates content of type `note` after this ships. Existing note rows are deleted by the migration rather than moved. That is a deliberate destruction of dumped content, taken under the dated one-time exception written into OFF-1 on 2026-09-10, and defensible only while the product is in alpha with a handful of accounts. Every other content type is untouched.
- **AC-3a** A note is in the Notes section and nowhere else. "Everything in here" holds tasks, events, links, files, images, voice and locations after this ships.
- **AC-3b** A person dumping a sentence a thread already holds gets a second note. offload writing one it already wrote gets nothing new, which is what the rule was built for.
- **AC-4** Every surface that said memory says note: the thread section, the phones' tab, the tool name, the privacy policy, the marketing site and the design system's readme. A search for the word memory in a person-facing string returns nothing.
- **AC-4a** The identifiers change too, and the check is not the copy check: `MemoryRow`, `MAX_MEMORIES_PER_THREAD`, `memoriesForPrompt`, the CSS module classes and the route paths are all person-invisible and would survive AC-4 forever.
- **AC-4b** A phone build already on somebody's device keeps working. The four memory routes are renamed, and the old paths answer for one release rather than being deleted under a client that cannot be updated remotely. *AC-3 reasons about the cost of breaking old data and says nothing about breaking old clients; EAS builds are distributed, so this is the same class of decision.*

**Nothing is refused**

- **AC-5** A dump into a thread already holding 100 notes lands. No path in the product refuses a note for being one too many.
- **AC-6** At most 100 notes per thread reach a prompt, enforced when the prompt is assembled rather than by a job having run. The characters notes contribute to one turn are bounded by stated constants, asserted by a test, and do not grow with the age of an account or the number of threads it has.
- **AC-7** A turn that touches the same thread more than once carries that thread's notes once.

**What landed**

- **AC-7c** A turn whose only output is a note names the thread it landed in and links to it. `add_memory` writes no content row and marks no thread as landed today, which is correct while a memory is not what you dumped and wrong the moment a dumped sentence becomes one. Without this, dumping a sentence produces a reply with nothing to click, which is the failure `readme.md` names in its own words: a sentence cannot be clicked.

**Precedence**

- **AC-7a** Notes reach the model oldest first, each carrying the date it was last written.
- **AC-7b** Given two notes that contradict each other, offload acts on the newer one. Measured with `/test-llm` on held-out cases, both directions: the newer note wins, and a pair that does not contradict leaves both standing.

**Compaction**

- **AC-8** A thread whose active notes pass 100 is compacted, and afterwards its active set is at or under 100, or what remains above it is person-typed notes that are all still true. Neither outcome is a failure and both assemble a valid prompt.
- **AC-9** Compaction sets a note aside rather than removing it, and may delete only notes offload wrote itself and nobody has edited. A note that has been set aside is off the prompt and off the section, kept on the thread as history and still returned by search. offload's own folded rows are history for 30 days and then purged; a sentence a person typed is never purged by us.
- **AC-10** Compaction never rewrites or deletes a note a person typed or edited. It may set one aside when it has stopped being true, which leaves the row and its words in place.
- **AC-10a** Compaction does the four things it exists for, each testable on its own: a conceptual duplicate collapses, a related pair combines, a note whose date has passed is set aside, and a rule stated in a conversation and never filed becomes a note.
- **AC-11** The thread says how many notes have been folded and offers to read them. A thread with none says nothing. There is no restore: history is read, not worked with. What it shows is the folded notes newest first, each naming the note it was folded into, so reading it answers "where did that go" rather than only "what did I say".
- **AC-12** A thread holding more than 100 notes that compaction cannot fold still assembles a valid prompt: the 100 most recently written instruct and the rest do not. The screen says how many do not, and says it beside the control that resolves it, which is deleting notes that have stopped being true. A fact with no action beside it is the shape this product does not use.
- **AC-12a** A note that is not instructing is visibly not instructing, in the same register a finished task uses when it sinks. Indistinguishable from an instructing one is the failure mode: somebody rereads a note, believes offload has it, and it does not.
- **AC-13** offload deletes only notes it wrote itself. A note a person typed cannot be deleted by offload through any path, including compaction.

**Instruction and trust**

- **AC-14** A note derived from a connected app reaches the model in a separate list and is marked as not to be obeyed. The list it lands in is a server-side property of the row and is enforceable; what the model then does with it is measured, not enforced, so this criterion is met by an adversarial held-out set with a stated pass bar rather than by an assertion that behaviour never changes.
- **AC-14a** A note produced by compaction carries the author of the notes it folded, and compaction never folds notes belonging to two different authors.
- **AC-15** A note typed by another member of a thread reaches the model in its own list, separate from the ones you wrote, and the prompt says what each list is for. A solo thread produces an empty second list.
- **AC-16** Note text reaches the model on the untrusted channel with every other tool result.

**Dates**

- **AC-17** A note with a date is returned by the same reads that return dated content, so 015 can draw both without knowing which store a row came from.
- **AC-18** Dates on a note are set only when the dump states or implies one, the same rule content already follows.

**Carried over from 008, restated because the migration can break them**

- **AC-19** Access resolves through thread membership, never through a note's own account id.
- **AC-20** Only the author deletes. Any member mutes, thread-wide and reversibly.
- **AC-21** Deleting a note is undoable for eight seconds and nothing is destroyed before then.
- **AC-22** No note text reaches an analytics event, a log, a trace or a job error. Compaction is the new path here: it is a model call over up to a hundred notes, and its failures carry ids and counts. The repo has already paid for this once, on `jobs.last_error`.
- **AC-23** Deleting an account leaves the notes it created on shared threads, carrying no author. Deleting a thread deletes its notes in the same transaction.

**The claim surface**

- **AC-24** The privacy policy is true on the day this ships. Four places, and the last two are new findings rather than a rename:
  - the word memory, in the "what offload makes from your content" bullet and in the encryption section;
  - the account-deletion exception, which must visibly cover notes;
  - **section 10's retention promise**, rewritten during planning to separate what somebody put in, which is kept, from what offload worked out, which it revises daily. The criterion is that it still describes what the code does on the day this ships;
  - **section 17's promise to email account holders before a change that affects what happens to their content takes effect**, which both folding and the migration trigger. *Met on 2026-09-10 by there being one account holder, who decided the change. It binds again the moment there are two.*
- **AC-24a** The page is rewritten rather than find-and-replaced. It already uses the word notes for content, so swapping memory to note leaves two different things called notes on one page.

## Depends on

- **008**, which built memories and whose memory-versus-content test is replaced here. Three of its statements are amended in this change rather than left disagreeing: the cap of ten, the "web only" scope, which 009 already overtook by shipping the section on both phones, and its out-of-scope line saying compaction "arrives with account scope". Compaction arrives here, per thread, because that is where a hundred notes now sit.
- **008's impl-spec is superseded wholesale, not bullet by bullet.** Its cap of ten, its 409 at the cap, its chip truncation arithmetic, its toast copy and its screen section all describe a feature this replaces. Left uncorrected it is the next reader's ground truth.
- **013**, which gave memories `memory_chunks` and the embedding sweep. A note is searchable on the day it lands and stays searchable after it is folded, so nothing here needs a new corpus. 008's "no embedding column" is already history.
- **012**, for the trusted and untrusted split the model already reads.
- **013**, for the search corpus a note stays in.
- **004**, for the tool loop and the whole-turn Undo.

## Out of scope

- **The timeline.** 015.
- **Account scope and person scope.** The phones' Notes tab stays the empty screen it is today. Folding thread notes does not give offload an account-wide view of you, and person scope still needs a people table.
- **Embeddings changing.** 013 already chunks and embeds memories through the sweep, and a note is the same shape. The corpus keeps its name or takes a new one; the mechanism does not move.
- **Notes changing layout.** "Always show the map on top" is `threads.attrs.widgets` and 007 owns it, unchanged.
- **Reopening the co-member instruction hole.** Named above, widened, and the containment is in Open rather than here.
- **The `kind` column.** `going_on`, `preference`, `noticed` and the rest are what the account-wide screen would group and tone by, and that screen is out of scope. Everything this feature writes keeps taking `preference`, which already stretched in 008 and stretches further now. The column is left alone rather than redefined by a feature that has no reader for it.

## Decided during planning, recorded because each one destroys or retires something

- **Existing `note` content rows are deleted, not moved.** Put to the product owner twice, with the lossless backfill costed, and answered the other way both times. What goes is every sentence dumped into a thread before this ships, in every account including their own.

  **This breaks a MUST and two published claims, and the answer was to move the principle rather than the plan.** Put to the product owner with all of it costed:
  - OFF-1 said "content is stored, not discarded";
  - the privacy policy's section 10 promised uploads are never thinned out;
  - its section 17 promises an email before a change that affects what happens to somebody's content;
  - `docs/tech/decisions.md` records "no retention on user-facing content" as decided;
  - and a shared thread's notes belong to its other members too.

  **Resolved on 2026-09-10 by amending OFF-1**, which now separates what somebody dumped, durable, from what offload worked out, which changes and is removed, and which carries one dated exception for this migration. The policy's retention section is rewritten in the same change and says what actually happens, including the daily job. Section 17's email is a task rather than a footnote.

  *One thing the amendment does not cover and this spec has to say plainly: a note typed straight into a section carries no message behind it, so for those rows the note is the dump and the migration is the only copy going. Rows offload filed from a dump still have their message.*
- **The word memory is retired.** `CLAUDE.md` loses it from its six product words, five kits get a renamed screen, and the privacy policy and marketing site change the word. Confirmed rather than assumed, because changing it back is not cheap.
- **A note lives in the Notes section only.** Not in both lists.

## Open, and needing the product owner

- **Nothing outstanding.** Both blocking calls were made on 2026-09-10: OFF-1 is amended and the migration keeps its deletion, and SEC-1's widening is accepted with the three-list containment taken here rather than deferred.

## Constitution gate, 2026-09-10

Audited against `docs/constitution/principles.md` read fresh, after the three reviews.

| | | |
| --- | --- | --- |
| **DEV-1** | flagged | Compaction is the largest thing here, and the product review named a smaller alternative: keep injecting a curated few and retrieve the rest per turn from the corpus 013 already built. It is smaller and it is not what was asked for. Recorded, not silently dropped. |
| **DEV-2** | compliant | Every document this contradicts is amended in the same change: 008 in three places, `decisions.md` on the prompt ceiling and the allowlist, `CLAUDE.md` on vocabulary, the design system readme, the privacy policy. |
| **DEV-3** | compliant | No new tool, no new store, no new mechanism. A job on the existing queue, found by the existing sweep. |
| **QUAL-1** | compliant | Every AC is testable. AC-14 was an absolute about model behaviour and is now a measured property with a pass bar, which is the difference between a test that can fail and one that cannot. |
| **QUAL-2** | n/a | Nothing at this altitude. |
| **SEC-1** | accepted exception, contained | A note is dumped text read as instruction, which 008 crossed and the product owner accepted in writing. This widens it from ten rule-phrased sentences classified at write time to a hundred of any kind sorted at read time. **Accepted again on 2026-09-10, with the containment taken this time**: three lists, yours, other members', and connector-derived, weighted differently in the prompt. Recorded in `decisions.md` in the same change. |
| **SEC-2** | compliant | Membership is re-checked server-side against the job's account, never taken from the tool call. Unchanged from 008. |
| **DATA-1** | pending | The impl-spec is phase 5 and does not exist yet. |
| **OFF-1** | compliant, after amendment | The principle was amended on 2026-09-10: what somebody dumped is durable, what offload worked out is not, offload supersedes anything and deletes only what it wrote, and this migration is a dated one-time exception written into the principle rather than left in a migration comment. The egress half is unchanged and fine: AC-22 covers compaction's model call and its failure path. |
| **OFF-2** | compliant | Nothing about encryption changes. The policy's encryption section changes one word. |
| **OFF-3** | compliant | Reads through membership, delete by author, account deletion never cascades, and AC-14a closes the folded-note authorship gap by refusing to fold across authors. The migration reaching other members' note rows is covered by OFF-1's dated exception rather than left unstated. |
| **OFF-4** | n/a | No new connected-app ingestion. App-derived notes keep their flag and their separate list. |
| **OFF-5** | compliant | Compaction is a model call and takes a validated schema with one repair-and-revalidate retry, like every other. |
| **OFF-6** | compliant, conditional | Compaction acts automatically, destroys nothing, and is not undoable for eight seconds because it has no toast and no turn. OFF-6's own answer is the allowlist: an action is reversible only once listed. The entry in `decisions.md` is a task in this feature, and without it compaction defaults to outward facing, which would mean confirming it per action. |
| **OFF-7** | compliant | Four design-system changes named, each with a `decisions.md` entry and a **Design system impact** field. |
| **OFF-8** | compliant, flagged | Still three constants, still flat in account age, and prompt assembly enforces the budget rather than trusting the job. The flag is the size: 16,000 characters a turn becomes 160,000, ten times the number `decisions.md` ratified. |

`GATE: PASS`

*Two MUSTs were open when this table was first written, OFF-1 and SEC-1. Neither was waved through: OFF-1 was amended in the constitution with a dated exception, and SEC-1's exception was re-accepted with a containment that did not exist before. Both are recorded where the next person will find them.*

## Amended 2026-09-29

**A note's body is no longer drawn or edited** on any surface: no second field in the editor and no "more" on the row. It is still stored and still never reaches a prompt. On the phones a note offload wrote no longer leads with `sparkles`; its ink says who wrote it.

## Amended 2026-10-02 by 028

A note moves between threads, by its author, or by any member once its author has left, into a thread the caller is in: the note sheet's Move on every surface, and 028's suggestions. It keeps its words, its origin, its untrusted mark and when it was put down. Its labels stay where they are and are unseen in the new thread, because a label belongs to a thread. A learned note whose words the destination already holds is refused rather than duplicated.

## Amended 2026-11-06, the owner

**A plan kept as a note passes on its own.** Compaction's third job, a note whose date has passed is set aside, only ever reached the notes a model was shown, and a note derived from a connected app or an email is never shown to one. So "Kyle staying with us, Sun Nov 1 to Wed Nov 4", from a forwarded invitation, stood on the thread a week after Kyle left, while "Chiara is staying 21 to 25 October", from a dump of the owner's own, was set aside the night after her last day. The hourly `content.passed` job now does it for every thread note, with no model: a note with `occurs_at`, no rule and no `due_at`, once its last day (`occurs_end_at`, else `occurs_at`) is over in its author's clock, and only when that last day was still ahead on the day the note was written.

**That last clause is what keeps a dated fact.** "The house was built in 1931", "we lived in Lisbon 2010 to 2015" and "the boiler was serviced today" had reached their date when they were written, so they were records from the start and are never set aside by this. "The lease ends on 30 June", written in advance, is treated as a plan: when the day is over it is off the prompt. A plan written on its own day ("dinner tonight") is not reached either, and stays with the nightly pass. A note with `due_at` stays as a late to-do stays, and one with a rule has a next time.

**It ends where the nightly pass leaves one: set aside**, in the folded history and off the prompt and the section. Not muted, which is a person's control and leaves the row in the section. It carries no `purge_after`: AC-9's thirty days are for what a fold replaced, and a passed plan was replaced by nothing, so it stays on the thread as the privacy page's section 13 says. `apps/core-api/src/threads/passed.ts`.

**A note a memory cites is kept as well.** A learned memory goes when its source note has gone, read as a person deleting it, so a note set aside while a memory cites it takes no `purge_after` either, and a `remove` of one is a set-aside (038's amendment of the same day).
