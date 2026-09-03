# 004 The planner, tasks

> Ordered. The rename lands first, before anything is built on the old name.
> Each task is one thing (QUAL-2) and names the criteria it is done against.

## A. The rename

- [x] **A1** `things` → `content` across `docs/specs/001-data-model/` (three files, 138 occurrences), `docs/tech/` (four files, 88), `docs/constitution/principles.md` (7) and `CLAUDE.md`'s vocabulary line. Identifier families: `things`, `thing_id`, `thing_type`, `thing_blobs`, `thing_people`, `thing_count`, `readable_things`. Not the design system's kits or explorations, per the impl-spec.
  *Test:* a grep for the seven identifiers over `docs/`, `CLAUDE.md` and `apps/` returns nothing.
- [x] **A2** One entry in `.claude/skills/offload-design/decisions.md` recording the vocabulary change, with **Design system impact** filled in.

## B. Schema

- [x] **B1** `0011_the_planner.sql`: `alter table threads rename column thing_count to content_count`.
  *Test:* migration up on a fresh database, then `select content_count from threads limit 1`.
- [x] **B2** `0011`: `create table content` with the columns and four indexes from the impl-spec.
  *Test:* insert two rows with the same `(derived_from_message_id, tool_call_id)` and assert the second is rejected — **AC-17**.
- [x] **B3** `0011`: `messages.state` CHECK gains `partial`.
  *Test:* update a message to `partial` succeeds; to `nonsense` is rejected.
- [x] **B4** `0011`: `grant select on content to offload_agent`, and assert the role holds no insert, update or delete on `content` or `messages` — **AC-12**.
  *Test:* extend the existing `agent-role` test.
- [x] **B5** `schema.ts`: the `Content` interface, `threads.content_count`, `messages.state` widened.

## C. The tool endpoint

- [x] **C1** `POST /internal/v1/tool-call`, bearer auth reusing `tokenMatches`, discriminated union on `tool`.
  *Test:* no token 401; wrong token 401; unknown job 404.
- [x] **C2** The account comes from the job row, scoped `kind = 'dump.answer'` — **AC-7**.
  *Test:* a body cannot name an account (no field); a job of another kind 404s.
- [x] **C3** `add_content` validates `threadId` against `thread_members` with `state = 'accepted'` — **AC-5**.
  *Test:* another account's thread returns `ok: false`; a `pending` membership returns `ok: false`; an accepted one succeeds.
- [x] **C4** One failure reason — **AC-4**.
  *Test:* a nonexistent thread id and another account's thread id return byte-identical bodies.
- [x] **C5** `add_content` writes the row, bumps `threads.content_count` and `last_activity_at` in the same transaction — **AC-1**.
  *Test:* count and timestamp both move; a rolled-back insert moves neither.
- [x] **C6** `create_thread` inserts the thread and an `accepted` `thread_members` row together.
  *Test:* the new thread is returned by the same membership query `add_content` uses.
- [x] **C7** Idempotent on `(derived_from_message_id, tool_call_id)`, returning the same `contentId` — **AC-17**.
  *Test:* the same call twice yields one row and one id.
- [x] **C8** The per-turn bound, enforced here — **AC-18**.
  *Test:* the ninth `add_content` for one message returns `limit_reached` with no row written, with the loop's own counter bypassed.
- [x] **C9** Failures are 200 with `ok: false`, never 4xx — **AC-14**.
  *Test:* every refusal path asserts status 200.
- [x] **C10** `default_thread_id` null returns `unknown_thread` rather than creating a thread — **AC-2**.

## D. Turn result

- [x] **D1** `outcome: "partial"` writes the reply and sets the message to `partial`; the idempotency guard accepts `seen` or `partial` — **AC-15**.
  *Test:* a partial then a resume then an answered leaves one person message, two offload messages and no lost content.
- [x] **D2** `usage` becomes an array, one `llm_usage` row per model call, with the single-object shape still accepted — **AC-20**.
  *Test:* a three-call turn writes three rows; a legacy single-object body writes one.

## E. Undo, resume, purge

- [x] **E1** `POST /v1/turns/:turnId/undo`: message, reply and derived content soft-deleted in one transaction under one `purge_after` — **AC-9**.
  *Test:* all three carry the same `deleted_at` and the same `purge_after`; another account's turn id 404s.
- [x] **E2** Idempotent — **AC-11**.
  *Test:* twice returns `undone: true` then `undone: false`, and row counts are unchanged by the second.
- [x] **E3** Nothing is hard-deleted by undo — **AC-10**.
  *Test:* immediately after, every row is still selectable with the `deleted_at` filter dropped.
- [x] **E4** `content.purge` handler: both predicates, one transaction, ceiling halt — **AC-12**.
  *Test:* a row inside its window survives; past it, it goes; a run over `PURGE_CEILING` deletes nothing and logs the count; a row with `purge_after` in the past and `deleted_at` null survives.
- [x] **E5** The purge job is enqueued by the undo transaction, not a timer — **AC-10**.
  *Test:* undo enqueues exactly one `content.purge` with `run_after` ten seconds out.
- [x] **E6** `POST /v1/dumps/:messageId/resume` enqueues a `dump.answer` for an existing message and returns the `POST /v1/dumps` envelope — **AC-16**.
  *Test:* only on a `partial` or `failed` message; on an `answered` one it refuses.
- [x] **E7** `GET /v1/conversations/current` carries `turnId` and the `partial` state.

## F. The loop

- [x] **F1** `harness/tools.py`: the two pydantic models and the Anthropic schema generated from them, one definition each.
  *Test:* the generated schema's required fields match the model's.
- [x] **F2** `context.py` selects thread ids alongside names, and the trusted block carries `id  name` pairs with Miscellaneous flagged — **AC-6**, **AC-2**.
  *Test:* the block contains the default thread's id and marks it.
- [x] **F3** `context.py` loads what already landed for the message, empty on a first attempt — **AC-16**.
  *Test:* returns nothing before, and the filed titles after.
- [x] **F4** `harness/plan.py`: the loop, driven by `stop_reason`, bounded by `MAX_MODEL_CALLS` — **AC-18**.
  *Test:* a stub client that never stops calling tools terminates and returns `Partial`.
- [x] **F5** Tool names checked against a closed set with an explicit branch — **AC-8**.
  *Test:* an invented tool name is refused back to the model and dispatches nothing; asserted by there being no dynamic lookup in the file.
- [x] **F6** Arguments validated before execution, refused rather than coerced — **AC-13**.
  *Test:* a missing `thread_id`, a 300-character title and a non-string all refuse without posting.
- [x] **F7** Refusals carry the shape and never the argument values — **AC-22**.
  *Test:* a validation failure on a title containing a known sentinel string produces a refusal not containing it.
- [x] **F8** Tool results re-enter as `tool_result` blocks, never merged into trusted text — **AC-21**.
  *Test:* extend `test_isolation.py`: a tool result containing an instruction string appears only inside a `tool_result` block.
- [x] **F9** Every model call records usage — **AC-20**.
  *Test:* a three-call turn produces three usage entries in the posted body.
- [x] **F10** Running out of round trips returns `Partial` with `landed` intact — **AC-15**.
- [x] **F11** `prompts/plan_v1.md`, and `answer_v1.md` plus `harness/answer.py` deleted.
  *Test:* the prompt contains no account data and the isolation test still passes on the new file.
- [x] **F12** `worker.py` calls the loop, maps `Finished` to `answered` and `Partial` to `partial`, and keeps 003's retry and undeliverable paths.
  *Test:* the existing worker tests pass against the new outcomes.
- [x] **F13** The tool-definition budget is asserted — **AC-19**.
  *Test:* the serialised tool schemas are under 1,500 tokens, and the assertion names `defer_loading` as what happens when it is not.

## G. The screen

- [x] **G1** `Toast` with `Undo` above the composer for eight seconds after a reply, naming the threads from the same source the reply used — **AC-3**.
- [x] **G2** `partial` renders the reply plus an inline `Finish it`, reusing 003's `failed` treatment.
- [x] **G3** `lib/dump.ts`: `undoTurn`, `resumeDump`, and `turnId` carried through `fetchCurrent`.
- [x] **G4** One entry in the design system's `decisions.md` covering the Undo toast placement and the `partial` line, with **Design system impact** filled in.

## H. Truthfulness

- [x] **H1** The reply's thread names are compared against `landed` on a body of real dumps, including a turn that fails partway — **AC-3**, **AC-23**.
  *Test:* a fixture of ten dumps with a stubbed model, asserting in both directions: every thread named in the reply is in `landed`, and every entry in `landed` is named in the reply.
- [x] **H2** The isolation test covers tool arguments, tool results and job errors, not just the dump — **AC-22**.
- [x] **H3** `architecture.md` step 4 and `decisions.md`'s `sort` entry amended; the pretence entry closed; the privacy policy re-read against what now happens. **Two of its four automated-decisions claims are still false and the gap is with the product owner, not in code.** See the ⚠️ entry in `decisions.md`.

## I. Ship

- [x] **I1** Full suite green, both planes.
- [ ] **I2** Migrate and deploy; one real dump filed end to end, undone, and the purge confirmed.
- [ ] **I2a** Repoint all three Railway services from `003-composer` to `main` once this merges.
- [ ] **I2b** Remove the `mobile-flow-test@example.invalid` row from the production waitlist.
- [ ] **I3** Spec 002 `F6`: remove `signOutForTesting()` and `TempSignOut.tsx` from both mobile Today screens.

## Not done, and why

- **`OFFLOAD_EVAL=1`.** `tests/test_truthfulness.py` holds ten real dumps against a real model and is skipped by default because it costs money on every run. The comparison it uses is unit tested; the model-facing half is not, and no stub can make it so. Run it before the first real invite.
- **The privacy policy.** See H3. Filing is automatic and reversible now, which was the condition 003 set. It is still not visible, because there is no thread screen, and still not movable, because `move_content` was cut. One feature closes both.
