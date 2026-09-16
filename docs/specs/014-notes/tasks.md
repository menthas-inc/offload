# 014 Notes, tasks

> Ordered. Each cites the acceptance criteria and principles it satisfies. Tracks run in parallel once **Foundation** is done; the feature is closed only when API, Web and Mobile all pass.

## Claim surface, before any code

- [x] **C1** Rewrite the privacy policy's account-deletion exception and its "what offload makes from your content" bullet for notes, and check the whole page for the word memory. The page already says notes about content, so this is a rewrite rather than a find and replace. (AC-4, AC-24, AC-24a)
- [x] **C2** ~~Send the section 17 email.~~ **Not sent, and not an oversight.** The policy promises account holders an email before a change that affects what happens to their content, and on 2026-09-10 the product owner is the only account holder, knew before it shipped because they decided it, and said so. The obligation is met by the fact rather than by the mail. *It comes back the first time somebody else has an account, which is the next invite: a script to send it was written and deleted rather than kept, because a one-off that nobody runs is a one-off that goes stale.* (AC-24)

- [x] **C3** Marketing site: the word, wherever it appears. (AC-4)

*C1 runs before F1, per `CLAUDE.md`. The retention section and OFF-1 were already amended during planning.*

## Foundation

- [x] **F1** One migration: rename `memories` to `notes`; add `body`, `occurs_at`, `occurs_end_at`, `due_at`, `place_id`; rename `readable_memories`, `memory_chunks`, its grants and the four indexes; narrow the unique index to `origin = 'learned'`; add the three new indexes; delete `content` rows of type `note` with their chunks and drop `note` from the type constraint. One transaction. (AC-1, AC-2, AC-3, AC-3b, OFF-1's dated exception)
- [x] **F2** `apps/agent/src/offload_agent/embed_jobs.py:72` and the `embed.memory` job kind follow the table name, or the sweep stops finding anything to embed and says nothing. (AC-9)
- [x] **F3** Amend the documents this contradicts, in the same change: `decisions.md`'s prompt ceiling and its new allowlist entry for compaction; 008's cap, scope and out-of-scope compaction; `CLAUDE.md`'s vocabulary list; the design system readme's four uses of the word. (DEV-2, OFF-6, OFF-7)

## API

- [x] **A1** `memories.ts` becomes `notes.ts`. `NOTE_PROMPT_BUDGET`, `NOTE_TEXT_CHARS`, `NOTE_BODY_CHARS`. **Delete the cap, the 409 and the row lock together**: a lock that serialises nothing is worse than no lock. (AC-5, DEV-1)
- [x] **A2** `notesForPrompt` returns three lists, each entry carrying the date it was written, oldest first, budgeted by `updated_at desc`. (AC-6, AC-7a, AC-14, AC-15, SEC-1's containment)
- [x] **A3** The turn ceiling and the per-turn dedupe in the tool layer: a thread's notes once per turn, at most `NOTE_TURN_BUDGET` entries across a turn. Test with a fixture account at 200 threads. (AC-6, AC-7, OFF-8)
- [x] **A4** `add_memory` becomes `add_note`, gains the body, the dates and the place, loses its cap failure, and calls `noteThread(..., true, trx)`. (AC-2, AC-5, AC-7c)
- [x] **A5** `add_note` joins `FILING_TOOLS` in the agent harness and the comment above it saying a memory is not filing is rewritten, because it stops being true here. (AC-7c)
- [x] **A6** Routes renamed, old paths answering identically for one release, plus `GET /v1/threads/:id/notes/folded`, cursor-paginated on `superseded_at desc`. (AC-4a, AC-4b, AC-11)
- [x] **A7** The long-dump path: body keeps every word, offload writes the text, `origin = 'learned'`. (AC-1)
- [x] **A8** The daily job. `account.daily` fans out `account.daily.run` per account with activity; the run's only step here is note compaction per thread. Chain the next day's job before doing the work. (AC-8, AC-10a)
- [x] **A9** Compaction's model call: closed schema, one repair retry, then raise; unknown ids dropped rather than retried; supersede anything, delete only unedited `learned` rows, insert from the day's conversations, never touch `derived_from_untrusted`, never fold across authors. (AC-8, AC-9, AC-10, AC-13, AC-14a, OFF-5)
- [x] **A10** Compaction's failure path and trace carry ids and counts only. Assert it, the way the `jobs.last_error` scrub is asserted. (AC-22, OFF-1)
- [x] **A11** Purge: offload's own superseded rows go 30 days after they were superseded, on the existing sweep. A person's notes are never purged by us. (OFF-1 as amended)
- [~] **A12** *Prompt written, not yet measured.* The three lists, the precedence rule and "a note is what is true" are in `plan_v2.md`; `/test-llm` has not run against them. Prompt changes in `plan_v2.md` through `/test-llm`: three lists, the precedence rule, and a note being what is true rather than always an order. Held-out cases for the newer note winning, a rule still followed, a fact not obeyed as an order, and a members-list note not changing a tool call. (AC-7b, AC-14, AC-15)

## Web

- [x] **W1** The Notes section: renamed, with the date, the place, the body marker and the inferred mark on the row. (AC-2, AC-4)
- [x] **W2** Open a note to read its body; the editor edits text and body. (AC-1)
- [x] **W3** The folded count and the history view, newest first, each row naming what it was folded into. (AC-11)
- [x] **W4** The over-budget line, beside the control that resolves it, and the not-instructing rows visibly not instructing. (AC-12, AC-12a)
- [x] **W5** The section heading moves to `SectionHeader`; `MemoryRow` is extended and renamed. Both logged in the design system's `decisions.md` with **Design system impact** filled in. (OFF-7)

## Mobile

- [x] **M1** W1 to W4 on both platforms, from the same shared lib. (AC-2, AC-4, AC-11, AC-12)
- [x] **M2** The Notes tab keeps its empty screen on both platforms, with the word changed and its glyph reconsidered rather than inherited. (AC-4)
- [ ] **M3** *Not done: needs a device and a build from before the migration.* The old routes are what shipped builds call, so verify a build from before F1 still works before A6's aliases are removed in the next release. (AC-4b)

## Tests

- [x] **T1** Nothing refuses a note: a thread at 400 accepts the 401st, from a person and from offload. (AC-5)
- [x] **T2** The prompt bound at 200 threads, and the per-turn dedupe. (AC-6, AC-7, OFF-8)
- [x] **T3** Compaction's four behaviours, one test each. (AC-10a)
- [x] **T4** Compaction cannot delete or rewrite a person's note, through any path including a model returning its id. (AC-10, AC-13)
- [x] **T5** A folded note carries the author of what it folded, and a set spanning two authors folds into two notes rather than one. (AC-14a, OFF-3)
- [x] **T6** A turn whose only output is a note names the thread it landed in. (AC-7c)
- [x] **T7** No note text in any log, trace, analytics event or job error, compaction included. **This was false when it was first ticked**: the failure path used `log.exception`, which renders the traceback whatever fields are passed. Fixed in the worker and in the embed path beside it. (AC-22, OFF-1)
- [~] **T8** A note offload wrote reaches the model in the trusted list; one from a connected app does not. The server half is tested. *The adversarial held-out set is not run: it belongs with A12, which needs `/test-llm`.* (AC-14)

## Moving a note, 2026-09-16

- [x] **N1** `0045`: `notes.priority smallint default 50`, `readable_notes` recreated; `readableNotes` orders by it then `created_at asc`; `reprioritiseNote` writes it and nothing else. (AC-2, AC-2a)
  *Test:* `notes.test.ts`: the section reads back in the dragged order, Undo is the same call with the old number, `updated_at` and the prompt's order are untouched, any member may and a stranger may not.
- [x] **N2** `POST /v1/notes/:id/priority`, and `setNotePriority` on web and the phones. (AC-2a)
- [x] **N3** The handle on the note row on all three surfaces, through the shared `reorderPlan`. On web the row is a div holding the text button and the handle. (AC-2a)
- [ ] **N4** *Not done from this session: needs a device.* Hold a note's handle on each phone and check the row lifts and lands, and that the tap to open still opens.
