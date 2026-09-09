# 013 Answering, tasks

Every task cites the AC it serves. Ordered so each step is shippable: the index
is built and proven before anything asks it a question, and nothing is
user-visible until F.

## A. The predicate, first, because everything reads through it

- [x] **A1** Migration `0026`: `readable_content`, `readable_memories` and `readable_messages` as views, thread scope only for memories, with the comment saying why `account` and `person` are absent. `AC-2`, `AC-2c`
- [x] **A1a** `readable_messages` resolves through `conversations.account_id` alone. A conversation is never another member's, including the one that filed into a thread they share. The join to `conversations` is an integrity guard on the denormalised `account_id`, not a permission. `AC-2d`
- [ ] **A1b** The search read filters `state in ('seen','answered')` and both soft deletes at the call site, not in the view: `queued` is internal and must never reach an answer. Lifecycle belongs to the caller, which is what keeps `restore` working. `AC-2d`
- [x] **A2** Move `threads/access.ts` and `threads/memories.ts` onto the views, keeping their exported function names. No behaviour change and the existing tests stay green, which is the evidence the view matches what shipped. `AC-2`
- [x] **A3** Tests: an accepted member sees another member's content; a **pending** member sees nothing; author-only filtering would fail this. `AC-2a`, `AC-2b`
- [x] **A4** Test: a thread memory with `account_id is null` is readable by every accepted member and by nobody else. `AC-2c`

## B. The index

- [ ] **B1** Migration `0027`: `create extension vector`, `content_chunks`, `memory_chunks`, `message_chunks`, the `search_text` generated columns, the HNSW and GIN indexes. `message_chunks` carries `role`. `AC-12`
- [ ] **B1a** `content_thread_due_idx` on `(thread_id, due_at)`. The only index the agenda read is missing: `occurs` already has `content_thread_dated_idx` from `0016` and `created` has `content_thread_idx` from `0011`, both thread-leading. `001`'s `(account_id, occurs_at)` was a plan and was never built. `AC-15`
- [ ] **B2** Boot check: the extension exists, and the process refuses to start if not. A missing extension fails on deploy, not on somebody's first question.
- [ ] **B3** `hnsw.iterative_scan` and `hnsw.max_scan_tuples` set on the searching connection. `AC-13`
- [ ] **B4** Test: with an account holding a small share of a populated table, a membership-scoped vector query returns the number of rows the limit asked for. This is the test that fails without B3, and it is the reason B3 is not a comment. `AC-13`

## C. Embedding

- [ ] **C1** `embed.py`: chunking at `CHUNK_TOKENS`, the breadcrumb prefix in one function used by both the first embed and any re-embed, batching, and the model id pinned in one constant read off Voyage's API reference. `AC-12`
- [ ] **C2** `VOYAGE_API_KEY` in the agent config, refused when missing in production the way the vault key is.
- [ ] **C3** `embed.content` and `embed.memory` job kinds, enqueued by the Core API on create and on edit, drained by the Python worker. Off the turn. `AC-12`
- [ ] **C4** A failed embed leaves the row filed and findable by text. `embedded_at is null` is a backlog, not an error state. `AC-12`
- [ ] **C5** Backfill script: one job per existing row, idempotent, safe to run twice.
- [ ] **C6** **A test that embeds a real string against the real Voyage API.** Skipped without a key so CI stays green for everyone, and run before this ships. The credential, the request shape and the response shape are the three things no local mock can prove, and this repository has shipped two production failures of exactly that kind. `AC-14`

## D. Retrieval

- [ ] **D1** `search(conn, viewer, query, *, kinds)`: the vector arm, the text arm, RRF fusion, dedup by source row, then `created_at` as the tiebreak. Reads the views from A. `AC-2`, `AC-9`, `AC-5d`
- [ ] **D1a** `list_content(thread_id, type?, done?, matching?, order?)`, widening 006's `list_thread_content`. Returned whole and unranked, reporting `truncated` by the existing `LIST_PAGE + 1` idiom rather than a `COUNT(*)`. This is what makes a two-row answer two rows. `AC-5`, `AC-5d`
- [ ] **D1b** `matching` narrows within the thread over the same `search_text` index, so an existence check reads the rows that mention the word rather than a truncated page of the whole thread. `AC-4b`
- [ ] **D1c** `list_agenda(from_iso, to_iso, when, type?, done?)` with `when` in `due`, `occurs`, `created`. Cross-thread, no thread id, read through `readable_content`. `AC-15`
- [ ] **D1d** Test: an agenda range over a shared thread returns what another member timed. Author scoping would silently pass every single-account test. `AC-15`, `AC-2b`
- [ ] **D1e** Conversations join the corpus: `search` covers `readable_messages`, and a message and the content it became dedup to the content row. `AC-2d`
- [ ] **D2** `SHORTLIST`, `ANSWER_RESULTS`, `ANSWER_ROW_CHARS`, `ANSWER_SETS`, `CHUNK_TOKENS` as named constants in one place. `AC-8`
- [ ] **D2a** Test: a filtered read matching two rows returns two, and nothing pads it. `AC-5`
- [ ] **D3** Test: the prompt built for a 20,000 row account is the same size as the one built for a 20 row account. The OFF-8 test, and the one that fails if a cap is ever made dynamic. `AC-8`
- [ ] **D4** Test: retrieval returns candidates and never a verdict. Nothing in the path picks an answer by distance. `AC-9`
- [ ] **D5** Voyage unreachable: the query cannot be embedded and the text arm answers alone. Worse, not broken, and no failure line, because there is nothing for the person to do.

## E. The model

- [ ] **E1** The classifier: `sort` tier, structured `{asking, confident}`, on the message text before any retrieval runs. Only `asking and confident` routes to answering. `AC-3`, `AC-3a`
- [ ] **E2** Test: the same sentence classifies the same way against an empty corpus and a full one. This is what "before retrieval" means and it is not observable any other way. `AC-3`
- [ ] **E3** `plan_answer()` on the `reason` tier, with `list_content`, `search`, `account_facts` and the two calendar reads. The prompt says `list_content` first and `search` for when the thread or the shape is unknown. `AC-1`, `AC-5`
- [ ] **E3a** A question naming two subjects runs as two reads and returns two results, bounded by `ANSWER_SETS`. Never one blended list. `AC-5b`
- [ ] **E3b** The answering context carries the thread list, id and name and default, as the dump context does. A question names a thread the way a person does and every tool addresses one by id. `AC-1`
- [ ] **E3c** The prompt separates the two negatives: a definite "no" when the read was complete, and what it saw with no claim about the rest when it was not. `AC-4`, `AC-4a`, `AC-4b`
- [ ] **E3d** **Test: a wrong no.** A thread longer than a page, the asked-about row outside the first page, and the answer must not be "no". This is the failure that costs somebody something, and it is invisible without a thread big enough to truncate. `AC-4b`
- [ ] **E3e** An existence check is decided by the model reading candidates, never by a distance threshold. `AC-4c`, `AC-9`
- [ ] **E3f** An existence check finds a ticked row and reports it as done rather than answering no. `AC-4d`
- [ ] **E4** **Test the toolset, not the transcript**: assert `ANSWER_TOOLS` contains no tool that writes. `AC-11`
- [ ] **E5** `account_facts`: a typed lookup, no query, returning name, default thread, connected calendars and where each files, and the thread's preferences. Never a device preference. `AC-7`
- [ ] **E6** Retrieved rows reach the model as labelled user-turn content carrying their author, never in the system prompt. `AC-11a`
- [ ] **E6a** A retrieved message carries its `role`, and the prompt says offload's own earlier reply is evidence of what was said and of nothing else. Without it one wrong answer becomes a source for the next. `AC-2e`
- [ ] **E7** The prompt: a fact is a sentence, a set is the set, no answer is one short clause, no apology and no rephrasing suggestion, and theme is not knowable. `AC-4`, `AC-7`
- [ ] **E8** Answering files nothing, asserted by a test that runs a question turn and checks the content table is untouched. `AC-1`
- [ ] **E9** A turn that both asks and dumps is a dump. `AC-3a`

## F. The reply and the clients

- [ ] **F1** `message_content` join table in `0027`, and `found` on `messageResponse` and on `currentConversation`, resolved from it at read time through `readable_content`. `AC-5a`, `AC-6`
- [ ] **F1a** `foundFor(messageIds)` resolves the whole conversation tail in one query, as `waitingFor` already does at `dumps.ts:603`. Per message it is 50 queries on every open. `AC-5a`
- [ ] **F2** Test: a row ticked elsewhere reads as ticked in an old reply; a row deleted elsewhere does not render. `AC-5a`
- [ ] **F3** `found` is a list of **results**, each `{threadId, threadName, truncated, rows}`. One read is one result, so grouping is carried rather than reconstructed from `threadId` on a flat array. `AC-5b`, `AC-6`
- [ ] **F3a** Rows are whole `ContentRow` values, the type both clients already export. A six-field projection renders visibly thinner than the same row on the thread page. `AC-5`
- [ ] **F4** Both clients render `found` in its own block **below** the reply bubble, grouped by thread under the existing thread chip. Not inside the bubble: a pane row's fill bleeds by exactly the bubble's horizontal padding and would run under its 18px corner. `AC-5`, `AC-6`
- [ ] **F4a** Web uses `ContentRowView` and the phones use `ContentRow`, the shipping components. Not `WRow`, which has never been wired to state. `AC-5`
- [ ] **F4b** `ROWS_SHOWN = 8` per result. Under it a result draws whole; over it, eight draw with a **Show more** that expands what arrived, and a `truncated` read ends with the thread chip. A client number, bounding nothing on the server. `AC-5c`
- [ ] **F4c** A `readOnly` row: no swipe to delete, no long press sheet, no row tools. Removes the destructive affordances **and** the pan gesture nested inside the conversation's own drag sheet. Verified on a real device on both platforms, because the kits cannot show a gesture. `AC-6a`
- [ ] **F4d** The done state is the real one, moss fill and tertiary ink and a strikethrough, never the kits' opacity, which both components already reject in a written comment. `AC-5`
- [ ] **F4e** Accessibility: an `accessibilityLabel` on the phones' checkbox, which is missing today on the thread page and is fixed rather than reused; `role="checkbox"`, `aria-checked` and space to toggle on web; and a tap target sized independently of the mark, 44px minimum. `AC-5`
- [ ] **F5** Ticking from a reply calls the existing endpoint, re-checks permission server-side at the tap, and undoes by the ordinary per-row Undo. Not `undoTurn`. `AC-5`
- [ ] **F5a** A tick from a reply fires the same invalidation a dump does, so a thread pane open beside the conversation on web does not keep showing the row unticked. `AC-5a`
- [ ] **F6** Empty `found` renders nothing. The sentence is the answer.
- [ ] **F7** `dead-classes.mjs` and `dead-css.mjs` run with the rest. A class that does not exist is invisible to every other gate.

## G. The record

- [ ] **G1** Tick `001`'s T16, and update its query table so the search row names the chunk table it actually uses. DEV-2.
- [ ] **G2** Design log entry covering **two** divergences, with **Design system impact** filled in: a checkbox that does something, and a done state the kits draw as opacity and both shipping components reject. The impact field says what the ticked fill and border are, since that is what the kits have to catch up on.
- [ ] **G3** Confirm, without editing, that the privacy policy's Voyage line still covers what is now embedded, which after this includes memories **and conversations, offload's own replies among them**. It says "the text being indexed", which reads as already true; the check is the point, since a widening of what gets embedded is how a true line goes false from a distance.
- [ ] **G4** No query text and no row text in any log, event or trace. Counts, latencies and outcomes only, and `assertNoContent` does not catch a short phrase on its own. `AC-10`

## What is needed from the product owner

- A Voyage API key, on the agent service. Free tier covers the alpha many times over.
