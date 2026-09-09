# 013 Answering, tasks

Every task cites the AC it serves. Ordered so each step is shippable: the index
is built and proven before anything asks it a question, and nothing is
user-visible until F.

## A. The predicate, first, because everything reads through it

- [ ] **A1** Migration `0026`: `readable_content` and `readable_memories` as views, thread scope only for memories, with the comment saying why `account` and `person` are absent. `AC-2`, `AC-2c`
- [ ] **A2** Move `threads/access.ts` and `threads/memories.ts` onto the views, keeping their exported function names. No behaviour change and the existing tests stay green, which is the evidence the view matches what shipped. `AC-2`
- [ ] **A3** Tests: an accepted member sees another member's content; a **pending** member sees nothing; author-only filtering would fail this. `AC-2a`, `AC-2b`
- [ ] **A4** Test: a thread memory with `account_id is null` is readable by every accepted member and by nobody else. `AC-2c`

## B. The index

- [ ] **B1** Migration `0027`: `create extension vector`, `content_chunks`, `memory_chunks`, the `search_text` generated columns, the HNSW and GIN indexes. `AC-12`
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

- [ ] **D1** `search(conn, viewer, query, *, kinds)`: the vector arm, the text arm, RRF fusion, dedup by source row. Reads the views from A. `AC-2`, `AC-9`
- [ ] **D2** `SHORTLIST`, `ANSWER_RESULTS`, `ANSWER_ROW_CHARS`, `CHUNK_TOKENS` as named constants in one place. `AC-8`
- [ ] **D3** Test: the prompt built for a 20,000 row account is the same size as the one built for a 20 row account. The OFF-8 test, and the one that fails if a cap is ever made dynamic. `AC-8`
- [ ] **D4** Test: retrieval returns candidates and never a verdict. Nothing in the path picks an answer by distance. `AC-9`
- [ ] **D5** Voyage unreachable: the query cannot be embedded and the text arm answers alone. Worse, not broken, and no failure line, because there is nothing for the person to do.

## E. The model

- [ ] **E1** The classifier: `sort` tier, structured `{asking, confident}`, on the message text before any retrieval runs. Only `asking and confident` routes to answering. `AC-3`, `AC-3a`
- [ ] **E2** Test: the same sentence classifies the same way against an empty corpus and a full one. This is what "before retrieval" means and it is not observable any other way. `AC-3`
- [ ] **E3** `plan_answer()` on the `reason` tier, with `search` and `account_facts` and the two calendar reads. `AC-1`
- [ ] **E4** **Test the toolset, not the transcript**: assert `ANSWER_TOOLS` contains no tool that writes. `AC-11`
- [ ] **E5** `account_facts`: a typed lookup, no query, returning name, default thread, connected calendars and where each files, and the thread's preferences. Never a device preference. `AC-7`
- [ ] **E6** Retrieved rows reach the model as labelled user-turn content carrying their author, never in the system prompt. `AC-11a`
- [ ] **E7** The prompt: a fact is a sentence, a set is the set, no answer is one short clause, no apology and no rephrasing suggestion, and theme is not knowable. `AC-4`, `AC-7`
- [ ] **E8** Answering files nothing, asserted by a test that runs a question turn and checks the content table is untouched. `AC-1`
- [ ] **E9** A turn that both asks and dumps is a dump. `AC-3a`

## F. The reply and the clients

- [ ] **F1** `message_content` join table in `0027`, and `found` on `messageResponse` and on `currentConversation`, resolved from it at read time through `readable_content`. `AC-5a`, `AC-6`
- [ ] **F1a** `foundFor(messageIds)` resolves the whole conversation tail in one query, as `waitingFor` already does at `dumps.ts:603`. Per message it is 50 queries on every open. `AC-5a`
- [ ] **F2** Test: a row ticked elsewhere reads as ticked in an old reply; a row deleted elsewhere does not render. `AC-5a`
- [ ] **F3** Web: `found` under the reply in `Conversation`, as `WRow` with `check` and the thread name in `meta`. `AC-5`, `AC-6`
- [ ] **F4** Phones: the same list, in the thread page's row shape. `AC-5`, `AC-6`
- [ ] **F5** Ticking from a reply calls the existing endpoint, re-checks permission server-side at the tap, and undoes by the ordinary per-row Undo. Not `undoTurn`. `AC-5`
- [ ] **F6** Empty `found` renders nothing. The sentence is the answer.
- [ ] **F7** `dead-classes.mjs` and `dead-css.mjs` run with the rest. A class that does not exist is invisible to every other gate.

## G. The record

- [ ] **G1** Tick `001`'s T16, and update its query table so the search row names the chunk table it actually uses. DEV-2.
- [ ] **G2** Design log entry for the tickable row in a reply, with **Design system impact** filled in: `WRow`'s `check` is presentational in the kits and is real here.
- [ ] **G3** Confirm, without editing, that the privacy policy's Voyage line still covers what is now embedded. It says "the text being indexed", which reads as already true; the check is the point, since a widening of what gets embedded is how a true line goes false from a distance.
- [ ] **G4** No query text and no row text in any log, event or trace. Counts, latencies and outcomes only, and `assertNoContent` does not catch a short phrase on its own. `AC-10`

## What is needed from the product owner

- A Voyage API key, on the agent service. Free tier covers the alpha many times over.
