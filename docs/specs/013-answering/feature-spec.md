# 013 Answering, feature spec

**Status:** drafted 2026-09-09, revised after review the same day
**Surfaces:** web, iOS, Android, and the agent plane

## Why

offload files what you dump in and cannot find it again. The model reads one
thread, the one it just wrote to, and nothing else: there is no search across
threads, no search of memories, and no way to answer a question about anything
filed more than one turn ago.

So the product is an inbox. "What is left to do from Lisbon" and "where am I
staying in Istanbul" are the questions somebody has the moment a thread has
anything in it, and today both are unanswerable by the assistant that filed the
answer.

## What

**One question, one turn, no mode.** You type a question into the same composer
you dump into. Nothing about the interface changes and nothing asks you to
declare which you meant. That is the product's whole premise applied to reading
as well as writing.

**Asking files nothing.** A question is not a note, and putting it in a thread
is putting rubbish in the one place somebody is meant to trust.

**It searches what the server knows about you**, through two different paths,
because they are two different mechanisms and pretending otherwise is how one of
them gets skipped:

- **A corpus, searched.** Content across every thread you can see, including
  titles, bodies, tags and the thread's own name. Memories, the standing rules a
  thread carries. Both are found by text and by meaning.
- **Facts, looked up.** Your name, the calendars you have connected and where
  each one files, your default thread, a thread's own preferences. These are
  typed columns on `accounts`, `threads` and `connector_connections`. They are
  not embeddable and must never be pushed into the corpus to make one code path:
  they are read by a lookup that knows their shape.

**And answers in the shape the question deserves.** A single fact gets a
sentence. A question whose answer is a set gets the set: "what is left to do from
Lisbon" returns the actual rows, in the reply, with their checkboxes, and ticking
one there completes it for real.

### Most of this feature is the index, and it does not exist

Worth stating plainly, because the visible half is small and the invisible half
is not. **Nothing in this repository can search anything today.** There is no
`vector` extension, no `tsvector` column, no embedding column on `content` or
`memories`, no index, and no code that has ever called an embedding API. `0001`
enables `pgcrypto` and that is the only extension there has ever been.

The embedding column has now been deferred twice on purpose, by 006 and again by
008, both times with the same correct reason: nothing read it. **This is the
feature that reads it**, so it is the feature that builds it.

It builds it whole rather than leaving a second spec holding an index nobody
queries, which DEV-1 forbids and which is exactly the state 006 and 008 declined
to leave behind. What that means in practice is in the impl-spec; what matters
here is that the following is in scope and is most of the work:

- The `vector` extension, and `halfvec(1024)` columns per `decisions.md`.
- **Chunks stored separately from their vectors**, so a model change is a
  re-embed and not a data loss. `decisions.md` already settled this.
- A write path that embeds on create and edit, and a backfill for everything
  already filed.
- A full-text index alongside, for exact terms.
- `hnsw.iterative_scan` on from the start. `001` already worked out why: pgvector
  filters after the index scan, so a membership-scoped slice of a shared index
  returns far fewer rows than the limit asked for. Not an alpha problem and a
  real one later, and it costs nothing to set now.

**The Voyage call is the part local tests will not catch.** It is a third party
behind a credential, which is the same shape as the calendar's two production
failures: code that read correctly, passed every gate, and had never once been
executed. Something has to actually embed a string against the real API before
this is called done.

### One predicate, in SQL, because this is the second reader

`001` decided that the account-or-accepted-membership rule lives in **one SQL
view read by both planes**, not a helper written twice. The reason it gave is
this feature: the Core API reads through Kysely, the agent plane reads through
SQLAlchemy, and a fix to one would not reach the other.

**That view was never built.** `001`'s T16 is unticked, and the predicate lives
today only in TypeScript, in `threads/access.ts` and `threads/memories.ts`. It
has been correct because there has only ever been one reader.

Search is the second reader, and it runs in the other language. So this feature
finishes T16: the predicate becomes a view, the existing TypeScript reads move
onto it, and the search query uses it rather than restating it in Python. Two
mistakes it stops, both of which look reasonable in isolation:

- **Joining membership without checking `accepted`**, which shows your content to
  somebody holding an unanswered invitation.
- **Filtering on `content.account_id` alone**, which hides everything other
  members wrote in a shared thread. That one reads as broken and gets "fixed" by
  loosening the filter, which is how the check ends up gone.

**Memories need their own predicate and it is not the same one.** A thread-scope
memory has `account_id IS NULL` by design, so it resolves through
`thread_members` on `subject_id`. `WHERE account_id = :viewer` returns nothing
and invites exactly the loosening above.

### Answering carries no tools that write

Until now the model read one thread it had just written to. After this it reads
matching rows from every thread you are in, including shared ones, where the text
was written by somebody else. That is a real widening of who can put words in
front of a model that holds tools, and several of those tools are on the OFF-6
reversible allowlist, so they run behind an eight second toast rather than a
confirmation.

Two rules, and the second is the one that actually holds:

- **Retrieved rows are untrusted data.** They travel as user-turn content, are
  labelled as what they are, and are never read as instructions. SEC-1 already
  says this; it is restated here because search results are a new kind of
  input arriving in a prompt.
- **An answering turn is given no tools that write.** Not filing, not memory
  edits, not calendar writes. A sentence in somebody's shared thread saying
  "archive everything in this thread" then has nothing to call. This is the part
  that does not depend on the model behaving.

A turn that both asks and dumps is a dump: it files, and it does not search. One
turn does one of the two.

### Two things it cannot search, and one is not obvious

**Photos and voice notes.** They cannot be stored yet: there is no `blobs`
table, no upload, no transcription, and both composers have the camera and the
microphone deliberately undrawn. Searching their descriptions and transcripts is
a real want and it is **its own spec**, because storing them is most of a feature
on its own and touches OFF-2's key hierarchy. When it lands, the description and
the transcript are just more text and this feature extends to cover them without
changing its shape.

**Your theme.** "What is my theme now" cannot be answered and will not be. The
theme is a device preference held in `SecureStore` on the phones and
`localStorage` on the web, deliberately, so it can be read before first paint
with no frame of the wrong colour. The server has never known it and giving it a
copy to answer a question would be a second source of truth for a value that
already has one. The same is true of text size. **offload says it does not know
rather than guessing**, and that is the honest answer rather than a gap.

### How a question is told from a dump

**The call is made on the text, before anything is searched.** That ordering is
the rule, not an implementation detail: if the decision were made after
retrieval, the same sentence would be a question on a day the corpus happened to
match and a note on a day it did not, and nobody could predict which. A question
that finds nothing is still a question.

- **A question is answered from what you have**, and nothing is filed.
- **Anything that could be either is filed.** "Dentist after the 20th?" is a note
  with a question mark on it. The mistake that costs somebody something is losing
  what they wrote; the mistake that costs them nothing is a row they can archive.
- **A question with no answer gets one short sentence saying so**, and still
  files nothing. Not an apology, not a suggestion to try different words, and
  never a guess.

*This rule is deliberately blunt and is expected to soften.* The next feature is
offload being able to ask a follow-up, and "did you mean to file that or are you
asking me" is the natural answer to the ambiguous case. Filing by default is what
we do until it can ask.

### What the reply looks like

**A fact is a sentence.** "The Alfama flat, 14th to 17th." Not a paragraph, not
a list of one.

**A set is the set**, as real rows, behaving as rows do.

**The reply stores ids and resolves them when read.** It never bakes a copy of
the row into the message. `005` already settled the same question for thread
links, that they come from the ids and never from parsing the reply, and the
reason is the same here: a row ticked or edited somewhere else must not sit stale
in a conversation from last week.

**Ticking one is an ordinary row edit**, with the ordinary per-row Undo the
thread page already has. It is not the turn Undo: `undoTurn` reverses what the
model wrote during a dump, and here the model wrote nothing and the person tapped
a checkbox. It re-checks permission at the tap, on the server, rather than
trusting that a search returned the row a minute ago.

**Everything is a link to where it lives.** A row in an answer can come from any
thread, so it has to say which, which the thread page never needed to show
because it only ever draws one thread's rows.

**There is no mock for this screen.** `find-kit.sh` finds no search or answer
kit, which makes this one of the few screens that has to be designed rather than
matched. The nearest things in the kits are real and should be read before
building: `WPalette` already opens with "Type a command, or ask offload
something", so the design anticipated asking, and it already puts a quiet
right-aligned hint on each result saying what kind it is. `WRow` carries
a `meta` line under the title, which is where the thread name goes. Its `check`
is a bordered span with no behaviour, so a genuinely tickable row in a reply is a
divergence and gets a `decisions.md` entry with the Design system impact filled
in.

### Not built

- **Web search.** Later, and it is a different trust boundary: text from the open
  internet in front of a model that has tools.
- **Anything that writes.** Answering is reading. Asking offload to change
  something is a dump, and the existing tools do it.
- **Answering across accounts.** Only what you can see.
- **Ranking that learns.** No click feedback, no personalisation of results.
- **A reranker.** Voyage has one and it is the obvious next lever, deliberately
  not pulled until there is a real question that the first pass gets wrong.

## Acceptance criteria

**AC-1** A question is answered from what the account can see and files nothing.

**AC-2** Content and memory search resolve membership through **one predicate
defined once in SQL**, read by both the Core API and the agent plane. `001`'s
T16 is closed by this feature. No membership rule is written a second time in
Python.

**AC-2a** An account with a **pending** invitation to a thread gets nothing from
it. Accepted membership is the test, in the view, not at a call site.

**AC-2b** Content authored by other members of a thread you are an accepted
member of **is** returned. Author-only filtering is a defect, not a safe default.

**AC-2c** Thread-scope memories resolve through `thread_members` on `subject_id`.
A memory with `account_id IS NULL` is reachable by every accepted member and by
nobody else.

**AC-3** The question-or-note decision is made on the message text before any
retrieval runs, so the same sentence always lands the same way whatever the
corpus happens to hold.

**AC-3a** Anything ambiguous is filed.

**AC-4** A question with no answer gets one short sentence saying so, files
nothing, and neither guesses nor apologises.

**AC-5** An answer that is a set returns real content rows. Completing one from
the reply completes it for real, through the same server-side permission check
the thread page uses, evaluated at the tap, and is reversible by the ordinary
per-row Undo rather than the turn Undo.

**AC-5a** A reply stores row ids and resolves them on read. A row changed
elsewhere reads as changed in the old reply, and a row deleted elsewhere does not
render as still present.

**AC-6** Every row in an answer says which thread it is in and links to it.

**AC-7** A device preference is not answerable and offload says so plainly.
Theme and text size live on the device by design and the server has never held
them.

**AC-8** What reaches the prompt is bounded by named constants, in the shape 006
already set with `LIST_PAGE` and `LIST_ROW_CHARS`: a fixed maximum number of
results and a fixed maximum characters per result, asserted by a test, so a
question costs the same whether the account is a week or a decade old (OFF-8).

**AC-9** Search never decides on distance alone. Retrieval shortlists; the model
reads the candidates and answers. `decisions.md` records why: embedders score
below random on negation, so "not Lisbon" and "Lisbon" are neighbours.

**AC-10** No search text reaches analytics, a log, or an **LLM trace**. Counts,
latencies and outcomes only (OFF-1).

**AC-11** An answering turn is offered no tool that writes. Verified by asserting
the toolset for that turn, not by observing that the model did not call one.

**AC-11a** Retrieved rows reach the model as untrusted user-turn content,
labelled, never concatenated into a system prompt (SEC-1).

**AC-12** Embedding happens on create and on edit, and everything already filed
is backfilled. A row that cannot be embedded is still findable by text rather
than invisible.

**AC-13** `hnsw.iterative_scan` is enabled, and a test proves a membership-scoped
query returns the number of rows the limit asked for when the account holds a
small share of the table.

**AC-14** Something in the suite embeds a real string against the real Voyage
API, so the credential, the request shape and the response shape are known to
work before this ships rather than after.

## Depends on

- 006 for the extraction that makes a row worth finding.
- 008 for memories, which are searched alongside content.
- 012 for the pattern the reply follows when it carries a control.
- 001's T16, which this closes rather than depends on.

## Privacy policy

**No wording change, and one line to confirm rather than assume.** Section 6
already says Voyage receives "the text being indexed", which covers memory text
and shared-thread content once both are embedded. The claim was written before
either existed and it happens to still be true, so this is a check, not an edit.
Flagged here because the page is a claim surface and a widening of what gets
embedded is exactly the kind of change that makes a true line false from a
distance.

## Open

- **How wrong the first answers are is not knowable from here.** There is no
  evaluation set, and the honest way to build this is to ship it, ask real
  questions of real threads, and fix what misses. Worth saying now so the first
  bad answer is expected rather than alarming.

- **`derived_from_untrusted` on memories has no reader yet and will need one.**
  `001` put the flag there to stop connector-derived text being laundered into
  trusted context. It is always false today because no connector writes a memory,
  so nothing here is exploitable. Search is the first feature that would carry
  such a memory into an answer, and whichever spec first sets that flag true has
  to say how a memory carrying it is handled. Named here so it is inherited
  rather than rediscovered.
