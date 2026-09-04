# 008 Thread memories, tasks

Every task cites the AC it serves. A track is closed when its tests pass, not when its code exists.

## A. Schema, and the specs it changes

- [ ] **A0** Privacy policy: the account-deletion exception visibly covers memories, not uploads alone *(**AC-22**)*. **Blocks everything below.** The paragraph lists "your memories" flat and then excepts "what you put into a thread you shared", which a memory is.
  *Test:* the exception names memories; the flat list no longer reads as unconditional.
- [ ] **A0b** Privacy policy, same pass: the "what offload makes from it" bullet describes memories as offload's generalisations. Half of them are now a person's own words verbatim, so it names both authors *(**AC-1**, **AC-4**)*.
- [ ] **A1** `0017_thread_memories.sql`: `memories` as the subset in the impl-spec, four indexes, no `standing` unique index, no `embedding`. `account_id` nullable, `on delete set null`, **never a cascade** *(**AC-15**, OFF-3)*.
  *Test:* migration up on a fresh database; each index is used by the query it exists for; a second insert of the same text on one thread is refused by the index rather than by code *(**AC-5**)*.
- [ ] **A2** `memories` joins the purge sweep in `jobs/handlers.ts`, both conditions, inside the existing transaction *(**AC-13**, DATA-1).*
  *Test:* a soft-deleted memory past `purge_after` is gone; one inside the window is not; one that was never deleted is never touched.
- [ ] **A3** `schema.ts` and `001-data-model/impl-spec.md` amended: `account_id` present and nullable on thread scope, decides delete and never a read, no `standing` index, `derived_from_message_id` instead of `memory_sources`, `embedding` deferred.
  *Test:* `schema-drift.test.ts` passes.
- [ ] **A4** `004-the-planner/feature-spec.md` amended twice: `edit_content` returns and why the objection that cut it no longer holds *(**AC-19**)*; and the "consequences, not decisions" list at line 41 loses memory writes, narrowed to work that must happen every turn *(**AC-3**)*.
- [ ] **A4b** `005-the-thread-page/impl-spec.md:85` amended: the bundle is five queries, not four. That line reserves the fifth for a standing summary, which this feature does not build, so leaving it makes two specs disagree about a number one of them enforces.
- [ ] **A5** `docs/tech/decisions.md:84`: editing a memory joins the OFF-6 reversible allowlist, and "write **or forget** a memory" loses the forget, which no tool implements and none will *(**AC-7**, **AC-13**)*. **Before B4 or C2 ship.**

## B. The module and the routes

- [ ] **B1** `threads/memories.ts`: `readableMemories` by thread, and `readableMemory` by id as a single join *(**AC-9**, **AC-11**, **AC-12**)*.
  *Test:* a member reads a memory another member wrote; a non-member gets the same failure whether the thread exists or not; **a nonexistent memory id and an unreachable one take the same number of queries**; the account id appears in no `where` clause that decides a read.
- [ ] **B2** `addMemory` under the cap, with `select ... for update` on the thread row *(**AC-1**, **AC-2**)*.
  *Test:* two concurrent adds at nine leave ten, not eleven; the eleventh is refused; a soft-deleted row does not count *(**AC-14**)*; text is trimmed before the length check, so 200 spaces is empty; a duplicate takes the `on conflict do nothing` path and no Postgres unique violation is ever caught, so no error carries memory text *(**AC-5**, **AC-21**)*.
- [ ] **B3** `editMemory`: any member, full text, never moves `account_id`, refuses a model overwriting a person *(**AC-6**, **AC-8**, **AC-9**, **AC-10**)*.
  *Test:* a person's edit flips `origin` to `stated` and leaves `account_id` on the creator; another member can edit; offload editing that memory afterwards is refused; offload editing its own untouched one succeeds.
- [ ] **B4** `deleteMemory`: **`requireAuthor`**, soft delete, `purge_after`, idempotent *(**AC-9a**, **AC-13**)*.
  *Test:* a non-author member is refused with the same failure a non-member gets; a second delete by the author returns `deleted: false` rather than raising.
- [ ] **B4b** `setMuted`: any member, thread-wide, reversible, still counted against the cap *(**AC-9b**)*.
  *Test:* a member mutes another member's memory; it stays on the thread with its author; it is absent from the tool result; a thread with ten of which three are muted still refuses an eleventh.
- [ ] **B4a** Restore re-checks the cap under the same lock and refuses at ten *(**AC-14a**)*.
  *Test:* at the cap, delete one, add one, then undo the delete: the thread holds ten and the restore is refused, not eleven.
- [ ] **B5** The four routes, and memories on `GET /v1/threads/:id`.
  *Test:* `PATCH` returns the value from before the write, not after *(**AC-8**)*; the 409 at the cap carries a count and no text *(**AC-21**)*.
- [ ] **B6** Thread deletion deletes the thread's memories in the same transaction *(**AC-16**)*.
  *Test:* deleting a thread leaves no memory rows behind. `subject_id` has no foreign key, so nothing does this without being told.
- [ ] **B7** Account deletion leaves memories on shared threads and nulls their author *(**AC-15**, OFF-3)*.
  *Test:* John deletes his account; his memory in the thread he shared with Ana is still there, still steering the model, carrying no name; his memory in his own thread goes with the thread.

## C. The model

- [ ] **C1** `add_memory` on the tool endpoint: membership-checked against the job's account, capped, `learned`, records the message *(**AC-3**, **AC-11**)*.
  *Test:* a thread the account cannot reach gets the one generic failure; the eleventh is refused; a repeat of existing text creates nothing *(**AC-5**)*.
- [ ] **C2** `add_content` and `create_thread` results carry the thread's **unmuted** memories; `create_thread` carries `[]` *(**AC-17**, **AC-18**)*.
  *Test:* a muted memory never appears in a tool result.
- [ ] **C3** `edit_content`, scoped by all three predicates in the impl-spec *(**AC-19**)*.
  *Test:* content from an earlier turn is refused with the generic failure; content this turn created is editable; the account and soft-delete predicates are present even though the message predicate alone passes today.
- [ ] **C4** The prompt bound asserted *(**AC-17**)*.
  *Test:* an account with 200 threads and an account with two produce the same worst-case character count; no code path puts a thread's memories in a prompt without the turn touching that thread.
- [ ] **C5** Prompt: what a memory is, what it is not, and when to write one. The distinction that decides the feature is content versus standing fact, so it is the part to eval.
- [ ] **C6** Eval cases: a dump containing a rule writes a memory; a dump containing a task does not; a thread with a three-word rule gets three-word titles, via `edit_content` when the first title was longer; a refusal at the cap is never explained to the person *(**AC-2**)*.

## D. The screen

- [ ] **D1** Memories section in `Thread.tsx`, **after To do and before "Everything in here"**: governed `SectionHeader` with a plain count, governed `Chip` at default solid. No `variant`, no `WSection`, no toned count *(**AC-4**)*.
  *Test:* `pnpm lint` passes, which it does not for the kits' own `variant="soft"`.
- [ ] **D2** `onClick` opens the `Sheet` editor on the full text; `onRemove` renders for the author only and deletes with the eight-second Undo; every other member gets Unmute in the editor *(**AC-8**, **AC-9a**, **AC-9b**, **AC-13**)*.
- [ ] **D3** Add control reading `Add` with `icon="plus"`, `TextField` hint counting to 200. At the cap the add control is replaced by the cap line, since `Chip` has no disabled state *(**AC-1**, **AC-2**)*.
- [ ] **D4** Author on the chip in a shared thread; nothing when the author's account is gone *(**AC-10**, **AC-15**)*.
- [ ] **D5** `MEMORY_CHIP_CHARS` truncation on a word boundary, with its own `max-width` and ellipsis, because `Chip` has neither. **Check on a device with the larger text size on**, where nothing wraps.
- [ ] **D5a** The inferred marker carries a text alternative in `children`, not `sparkles` alone *(**AC-4**)*.
- [ ] **D5b** Delete toast is `Memory deleted` with Undo, never the memory's text *(**AC-21**)*.
- [ ] **D6** New memory appears without a reload *(**AC-1**)*.
- [ ] **D7** A thread with no memories renders the section with the add control alone.

## E. The record

- [ ] **E1** `.claude/skills/offload-design/decisions.md`: the memories section, built with no mock, **against the component contracts rather than the kits, because the kits are stale here** (`variant="soft"` on `Chip` was retired in `readme.md:352`, and `WSection` is scaffolding rather than `SectionHeader`). **Design system impact**, and it is not none: the kits' own chip rows need the retired prop removed; a memories section is needed on the thread screen across web, mobile and android; authorship on a chip has no precedent anywhere and needs a real pass; and `Chip` has no disabled state, which this screen worked around by removing the control instead.
- [ ] **E2** `docs/tech/decisions.md`: `account_id` is authorship and never authorization; `kind='preference'` and why not `standing`; `memory_sources` and `embedding` deferred with their triggers; **and the OFF-3 departures, in the entry OFF-3's own content rules already live in**, so a future reader finds the exception where they look for the rule.
- [ ] **E3** `docs/specs/README.md` index updated.
