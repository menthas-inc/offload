# 028 Not in a thread: implementation

Reads with `feature-spec.md`. Grounded in the code at `e30feee` and in `docs/tech/` (stack, decisions, context-and-memory). No open decision at the bottom of `docs/tech/decisions.md` blocks this; the one it touches, the tool definition budget (`decisions.md`, 2026-09-11, 2026-09-17, 2026-09-27), is decided here by the product owner (2026-10-01): raised to 1,900 and logged.

## What is already true, and what that settles

- **Only the default thread has `always_on = true`** (`admin/promote.ts:35`; `create_thread` writes false, `routes/tools.ts:1633`). Retiring *Always on* is taking the default thread out of `/v1/threads`.
- **A dumped sentence is a `notes` row**, `scope = 'thread'`, `origin = 'learned'` (`routes/tools.ts:1101-1135`), not content. Notes have no move path. `notes_thread_text` is unique on `(subject_id, lower(text))` for learned notes (`0033`), so a move can collide.
- **Move is author-only today**: `moveContentIn` (`routes/threads.ts:744`) runs `requireAuthor` (which admits an author who has left, 008) and `requireMember` on the destination, adjusts both counts, rewraps blobs and touches both threads. It refuses neither shared threads nor the default thread, which is what lets Undo move a row back into it.
- **There is no person-facing thread creation.** Only the model's `create_thread` (`routes/tools.ts:1616`), which writes no `thread_keys` row; `threadKey` (`blobs/keys.ts:50`) back-fills one lazily.
- **Labels are filtered by thread on read** (`contentLabelsFor`, `noteLabelsFor`: `l.thread_id = row's thread`). A moved row or note keeps its joins and shows none in the new thread; moved back, they show again. Nothing to write for AC-32.
- **Database text is plaintext** (OFF-2). The handoff's `name_enc` and "encrypted under the default thread's key" are wrong and are not built: `thread_proposals.name` is `text`, like `threads.name`.
- **A filing turn says nothing**; the footer is Done plus pills from `threadsFor` (`routes/dumps.ts:577`). *Saved to X.* exists only in the worker's `_partial_reply` (`worker.py:1700`).
- **A turn is marked untrusted** by `sawApps` (calendar reads, `routes/tools.ts:1188-1193`) and `sawMail` (`message.source = 'mail'`). A web read (016's `look_up`, run by the worker's reader) marks nothing on the server; the worker knows.
- **Content pages** are `GET /v1/threads/:id/content`, cursor = the last id, `PAGE = 30`.
- **The daily run** is `account.daily.run` (`jobs/handlers.ts:592`), which enqueues per-thread `notes.compact`. The Python worker's scheduled model jobs read with direct SQL as `offload_agent`, call the model with a forced tool, and post the result to an internal route that writes and records `llm_usage` with `category = 'scheduled'` (`compact.py`, `internal.ts:420`).

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Loose content rows: 40 typical, 2,000 heavy (20 dumps a day, a third loose, a year, nothing leaving by hand). Loose current notes: 20 typical, 150 heavy (compaction holds a thread near its 100-note prompt budget; superseded ones are not read here). Suggestions: at most one per loose thing; 5 live typical, 50 heavy. Proposals: at most 3 written a day; 5 live typical, 30 heavy. |
| Fan-out | Things per proposal: 2 to 10. Faces per suggestion: at most 2 drawn plus a count. |
| Growth | Loose things: about 7 a day for an active account, about 5,000 in two years in the worst case. Suggestions grow with filings that had a candidate, perhaps one in four loose filings. Proposals: up to 3 a day, removed when spent or below two. |
| Read pattern | **My threads**, on every focus and every `filed` (phones), every shell load (web): the loose summary, count, chip counts and newest three with suggestions. **The full list**, on open and on scroll: pages of 30, optionally by type. **A chip tap on My threads**: the first page by type, three drawn. |
| Write pattern | A suggestion per loose filing with a candidate, at turn time, bursty with dumps. Accept and dismiss, one per tap. Proposals, one batch per account per day, background priority. |
| Sort and filter | Loose content: `thread_id = default`, live (not deleted, not archived), task not done, optional `type in (...)`, by `(created_at desc, id desc)`. Loose notes: `subject_id = default`, `scope = 'thread'`, not deleted, not superseded, by `(created_at desc, id desc)`. Counts by type over the same predicates. Suggestions by target id. Proposal candidates: the newest 50 loose things with no suggestion and never dismissed. |

**What follows.**
- **Pagination:** server-side, keyset, page 30, over a merge of two tables. The cursor is opaque: base64url of `created_at` (microseconds) and `id` of the last row, validated on decode, and every page re-scopes to the caller's default thread, so a forged cursor can only move within the caller's own rows. Both branches take `(created_at, id) < cursor` and `limit 31`; the merge keeps 31 and returns 30. Ordering on `created_at`, which nothing updates, so an edit never moves a row (AC-13). `id` breaks ties; both are UUIDv7.
- **Indexes:** content already has `content_thread_active_idx (thread_id, created_at desc) where deleted_at is null and archived_at is null` (0013), which serves the content branch and the count; its `id` tie-break is resolved from the heap at these sizes. Notes get `notes_thread_current_idx on notes (subject_id, created_at desc, id desc) where scope = 'thread' and deleted_at is null and superseded_at is null`. Suggestions are keyed by target (unique, below), so the per-page join is an index lookup per row.
- **Counts:** computed per load, not denormalised. The heavy case is a `group by type` over 2,000 index entries plus a `count` over 150 notes, about a millisecond each, on a screen that already runs a grouped query per load (`openKinds`). `threads.content_count` is not used, because it counts ticked to-dos. Revisit if a loose thread passes 10,000.
- **Normalisation:** the dismissal is a timestamp on the thing itself (`content.suggest_dismissed_at`, `notes.suggest_dismissed_at`), so it goes when the thing goes and carries no words; the suggestion and proposal tables can then be deleted freely.
- **Partitioning:** none.

## Data model

Migration `0066_loose.sql` (renumbered before merge if `main` takes it).

```sql
-- A dismissed suggestion, as a fact about the thing: no words, gone with it.
alter table content add column suggest_dismissed_at timestamptz;
alter table notes   add column suggest_dismissed_at timestamptz;

-- offload's proposal of a new thread for two to ten loose things. Plain text,
-- as threads.name is (OFF-2).
create table thread_proposals (
  id          uuid primary key default uuid_v7(),
  account_id  uuid not null references accounts(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]'),
  created_at  timestamptz not null default now(),
  spent_at    timestamptz,
  spent_thread_id uuid references threads(id) on delete set null
);
create index thread_proposals_account_idx on thread_proposals (account_id) where spent_at is null;

-- One suggestion per loose thing.
create table suggestions (
  id          uuid primary key default uuid_v7(),
  account_id  uuid not null references accounts(id) on delete cascade,
  content_id  uuid references content(id) on delete cascade,
  note_id     uuid references notes(id) on delete cascade,
  kind        text not null check (kind in ('move', 'create')),
  thread_id   uuid references threads(id) on delete cascade,
  proposal_id uuid references thread_proposals(id) on delete cascade,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(content_id, note_id) = 1),
  check ((kind = 'move' and thread_id is not null and proposal_id is null)
      or (kind = 'create' and proposal_id is not null and thread_id is null))
);
create unique index suggestions_content_idx on suggestions (content_id) where content_id is not null;
create unique index suggestions_note_idx    on suggestions (note_id)    where note_id is not null;
create index suggestions_proposal_idx on suggestions (proposal_id) where proposal_id is not null;

create index notes_thread_current_idx on notes (subject_id, created_at desc, id desc)
  where scope = 'thread' and deleted_at is null and superseded_at is null;

-- The daily pass runs only when its candidate set changed.
alter table accounts add column loose_pass_key text;

-- Grants: the worker reads candidates and writes nothing.
grant select (suggest_dismissed_at) on content to offload_agent;
grant select (suggest_dismissed_at) on notes   to offload_agent;
grant select on suggestions to offload_agent;
```

`suggestions.account_id` is the owner of the loose thing (the default thread's only member). `uuid_v7()` is 0001's; `num_nonnulls` is Postgres's own; `schema.ts` gains both tables and the columns.

**Drawn when:** the target is live and in the account's default thread, `accepted_at is null`, the target's `suggest_dismissed_at is null`; for `move`, the caller is an accepted member of `thread_id` and it is not deleted; for `create`, the proposal is unspent and has at least two such targets.

**Removed when:** a `create` proposal falls below two drawable targets (checked after every dismiss, accept, move and delete that touches one of its targets, in the same transaction); a spent proposal and an accepted suggestion once `RESTORE_WINDOW` (15 seconds) has passed, swept by `account.daily.run`; everything on account deletion by cascade.

## Interfaces

### Core API

**`GET /v1/threads`** (`routes/threads.ts:1286`)
- Groups: `z.enum(["now", "older"])`; the default thread is skipped in the loop; `alwaysOn` leaves the select. `isDefault` stays on `threadRow` and is always false now (kept so a shipped build parses).
- Gains `loose: LooseSummary | null`, null when empty:

```ts
type ChipKey = "todo" | "link" | "photo" | "note" | "event" | "place" | "voice" | "file";
type LooseSummary = { count: number; byType: Partial<Record<ChipKey, number>>; rows: LooseItem[] /* ≤ 3 */ };
type LooseItem =
  | { kind: "content"; row: ContentRow; suggestion: Suggestion | null }
  | { kind: "note"; note: Note; suggestion: Suggestion | null };
type Suggestion =
  | { id: string; kind: "move"; thread: { id: string; name: string }; faces: { initials: string; seed: string }[]; more: number }
  | { id: string; kind: "create"; proposal: { id: string; name: string; count: number } };
```

`ContentRow` and `Note` are the thread page's own wire shapes, so both clients reuse their rows and sheets. The chip mapping (`task→todo`, `image|screenshot→photo`, `location→place`, notes→`note`) lives once, in `loose/read.ts`.

**`GET /v1/loose?type=&cursor=&archived=`** (new `routes/loose.ts`)
- `type` is a `ChipKey`; `cursor` is the opaque keyset; `archived=true` returns the default thread's archived content rows in the thread page's own archived shape and cursor, so the foot row reuses the thread page's archived list.
- Returns `{ rows: LooseItem[]; nextCursor: string | null; byType; count; archived: number }`.
- The thread is always `accounts.default_thread_id` of the session; no thread id is accepted.

**Suggestions** (new `routes/loose.ts`, writes in `loose/suggestions.ts`)
- `POST /v1/suggestions/:id/accept` (move only): in one transaction, re-reads the suggestion for the caller's account, refuses unless drawable; `moveContentIn` or `moveNoteIn` to `thread_id`; sets `accepted_at`. Returns `{ thread: { id, name } }`.
- `POST /v1/suggestions/:id/undo`: within `RESTORE_WINDOW` of `accepted_at`, moves the target back to the default thread through the same function and clears `accepted_at`.
- `DELETE /v1/suggestions/:id`: author check on the target, sets its `suggest_dismissed_at`, deletes the suggestion, re-checks the proposal's floor.
- `POST /v1/proposals/:id/create` `{ name, contentIds, noteIds }`: one transaction. Locks the proposal `for update` (the transaction is ours); refuses unless unspent and the caller's. Every id must have a `create` suggestion on this proposal, be drawable and pass the move's author check; any other id refuses the whole call with 404 and nothing moves. Name trimmed, 1 to 60, no control characters, else 400 `bad_name`. Inserts the thread (`created_by_account_id`, `always_on false`, `icon 'lasso'`) and an accepted membership; moves each through `moveContentIn` / `moveNoteIn`; sets `accepted_at` on the moved targets' suggestions; deletes the unticked targets' suggestions; sets `spent_at` and `spent_thread_id`. Returns `{ thread: { id, name } }`.
- `POST /v1/proposals/:id/undo`: one transaction, within `RESTORE_WINDOW` of `spent_at`. Refuses with 409 `changed` unless the thread is exactly as created: one member and no pending invitation, name unchanged, no content or note in it other than the moved set, nothing deleted from it. Then moves every moved target back to the default thread, clears their `accepted_at`, clears `spent_at`, and deletes the thread through the ordinary soft delete, which now holds nothing; its 8-second purge cascades nothing of the person's.

**Notes**
- `POST /v1/notes/:id/move` `{ threadId }`: `moveNoteIn(trx, accountId, noteId, destination)` in `threads/notes.ts`: `requireNoteAuthor` (admitting a left author as rows do), `requireMember` on the destination, refuses a note that is not `scope = 'thread'`; updates `subject_id` and `updated_at`; touches both threads. A learned note whose text already exists in the destination is refused with 409 `duplicate`, and the client says *That's already in Lisbon trip*. `origin`, `derived_from_untrusted`, `derived_from_message_id` and `created_at` are untouched. Returns `{ previous: { threadId } }`, the same as content.

**The default thread named nowhere.** One helper, `shownThreadName(threadId, name, defaultId): string | null` in `threads/default.ts`, applied where a payload names a row's thread for a person: `today/rows.ts`, `today/day.ts`, `today/needs.ts`, `search/found.ts`, `routes/dumps.ts` (`threadsFor` drops the default thread from `threads`), the content detail's `threadName` (`routes/threads.ts:1746`), and `mail-in/activity.ts` (no *in* clause; *Two from an email* when all landed loose). Those fields become `string | null` and the clients draw no pill or name on null. `ThreadBundle` gains `isDefault: boolean`, which the clients redirect on (AC-4).

**The default thread named nowhere to the model.** Model-facing payloads (`add_content` and `add_note` results, `account_facts`, search results read by the model, the context's thread list) carry `"not in a thread"` in place of its stored name, and `context.py` describes it: *not in a thread: where anything with no obvious home goes. A person may call it miscellaneous, unsorted or the inbox.* `plan.py:313` and `:1238` change to match.

**Labels.** `applyTurnLabels` skips rows in the default thread and returns them as unlabelled rather than refused, so the model is not told to retry; the nightly enqueue skips the default thread.

**Daily pass.**
- `accountDailyRun` enqueues `loose.propose` (background priority, key `loose.propose:{account}:{day}`, `maxAttempts 2`) when `LOOSE_PROPOSALS` is not `off` (default on) and the account's candidate set hashes differently from `accounts.loose_pass_key`. Candidates: the newest 50 loose things that carry no suggestion, were never dismissed, and, for notes, are not `derived_from_untrusted`. The sweep of spent proposals and accepted suggestions runs here too.
- `POST /internal/v1/loose-proposals` (internal token) `{ jobId, accountId, sent: string[], groups: { name, ids }[] , usage }`: re-reads the candidates; intersects every group's ids with `sent` and with the still-valid candidates; drops a group below two or above ten, or one whose name fails validation; writes at most three proposals and their `create` suggestions (`on conflict do nothing` on the target); records `llm_usage` `category: 'scheduled'`; sets `loose_pass_key`. Logs counts only.

### Agent

- **`add_content` and `add_note` gain `suggest_thread_id`** (optional, a thread id): *Only when you file into their default thread and one of their threads is a plausible home you were not sure enough to file into.* `TOOL_DEFINITION_BUDGET` goes to 1,900, with `test_labels.py`'s pinned constant, logged in `docs/tech/decisions.md` on `main`.
- **Server side of the argument** (`routes/tools.ts`, the two branches): written only when the row's thread is the default thread, the suggested thread is not, is live, and the caller is an accepted member; the turn is neither `sawApps` nor `sawMail`; the job is not a quick add. Otherwise the argument is ignored and the filing succeeds as if it were absent. Never a refusal: a filing never fails over a suggestion.
- **Web reads**: the worker strips `suggest_thread_id` from a call made after the turn ran `look_up`, since only the worker knows (`reader.py`). The server's gate is the second line.
- **018**: raising a `thread` question on a content row deletes any suggestion on it, in the same transaction (`questions.ts`, beside `threadQuestionAllowed`).
- **`_partial_reply`** (`worker.py:1700`): `landed` items carry `is_default`; names exclude the default thread; only default landed gives *Saved.*
- **`loose_propose.py`** (new, beside `compact.py`; registered in `worker.py` `KINDS`): reads the candidates as `offload_agent` (ids, type, title or note text, each cut to 200 characters; never a body, never a re-fetch of a source), numbers them `1..N` so the model echoes small integers, and calls the `sort` tier (`claude-haiku-4-5`) with a constant system prompt, the items in one user-turn block labelled as things to read and never instructions, and a forced `propose_threads` tool: `{ groups: [{ name: str(1..60), items: list[int](2..10) }] (≤ 3) }`. Pydantic validation; one repair turn on failure, then raise, logging the error type and never the value. Posts the mapped ids. Logs account id, counts, model, tokens, latency and outcome only. Prompt size is constant: at most 50 items of at most 200 characters, about 3,000 tokens with the system prompt, whatever the account's age (OFF-8).

### Mobile (`apps/mobile`)

- `lib/threads.ts`: `ThreadGroup.key` loses `always`; `ThreadBundle.isDefault`; `fetchThreads` returns `loose`; new `lib/loose.ts` with the types above, `fetchLoose`, `acceptSuggestion`, `undoSuggestion`, `dismissSuggestion`, `createFromProposal`, `undoProposal`, `moveNote`.
- `screens/MyThreads.tsx`: `HEADINGS` loses `always`; the always section and the three refusal toasts go; `total` counts `now + older`; `LooseGroup` between the two. The empty state is drawn only when there are no threads and no loose things.
- New `components/loose/`: `LooseGroup.tsx` (heading through `MyThreads`' `Section`, `labels/FilterBar` chips, three `LooseRow`s, the All link), `LooseRow.tsx` (a `ContentRowView` with `thread` unset and no tools, or the note row, plus `Suggestion`), `Suggestion.tsx`, `Faces.tsx` (the 20px initials mark), `CreateThreadSheet.tsx` (on `DragSheet` with `SheetFoot`, modelled on `labels/LabelList.tsx`; Android's 28px corners and predictive back come from `DragSheet`).
- New route `app/threads/loose.tsx` (static, wins over `[id]`), so `Shell` keeps the plate, tabs and the Threads tab highlighted; the push animation entry in `app/_layout.tsx` covers it. `screens/Loose.tsx` draws the bar, title, line, chips, a paged `FlatList`, the archived foot row and the states.
- `screens/Thread.tsx`: when the bundle says `isDefault`, `router.replace('/threads/loose')` from the loading state.
- Thread name nullable: `ThreadPill` callers in `ContentRow`, `today/*`, `Conversation.tsx`, `Widgets.tsx`, `AnswerResult.tsx` (header *Not in a thread*, no lasso, opens `/threads/loose`; foot *N more not in a thread.*).
- `MoveSheet` needs no change: the server already leaves the default thread out. The note sheet gains Move (`Notes.tsx`), toasting *Moved to X*; the reorder toast stays *Moved*.
- Toasts through `perform` with `did: "Moved to " + name`, `failed` per section 5.

### Web (`apps/web`)

- `lib/threads.ts` (`GroupKey`), `lib/loose.ts` as on mobile.
- `panes/MyThreads.tsx`: `HEADINGS` and `TONE` lose `always`; the disabled-delete branch goes; the subtitle counts threads only; `LooseGroup` between the groups; a neutral count tone in `shell.module.css`.
- `shell/Sidebar.tsx` reads groups that no longer hold the default thread: no change beyond the type.
- New `components/loose/` mirroring mobile, with the create sheet as a `people/Modal` `wide` modelled on `labels/LabelList.tsx`.
- New route `app/(shell)/threads/loose/page.tsx`, a pane in `Panes` with `MyThreads` beside it; `threads/[id]/page.tsx` redirects to it when the bundle says `isDefault`.
- `panes/EditModal.tsx` gains Move for a row that can move, opening `shell/MoveSheet`; the note edit gains the same.
- Nullable thread names in `ContentRowView`, `today/*`, `TurnFooter` (via `threads`), `AnswerResult.tsx`, the content crumb (*Not in a thread*, to the pane).

### Design system and docs (on `main`, as their own commits)

- Sync the zip into `.claude/skills/offload-design/` on `design/loose-sync`: readme, decisions, CLAUDE.md, the five kit files, `LooseParts.jsx`, `data.js`, the exploration and the two handoff files. **Not** `tokens/atmosphere.css` (the design project's copy drops the marketing washes seven web files read) and **not** the icons (the only differences are C2PA metadata). Keep the three handoff files the zip omits. Regenerate `_ds_bundle.js` and the manifest by the usual step.
- One `decisions.md` entry for the divergences the feature spec lists, Design system impact filled.
- `docs/tech/decisions.md`: the tool budget at 1,900; the reversible allowlist's conditional entry for a suggested move into a shared thread (one tap and Undo, decided by the product owner 2026-10-01 against the security review's recommendation to confirm), in 019's wording; the ⚠️ about what a row looks like before it is sorted, closed (there is no unsorted row: content is created by the planner and `fileUnfiled`, and the default thread is now a state).
- The privacy page, the three passages in the feature spec, before the code.

## Edge cases

- **The default thread missing** (`accounts.default_thread_id` null, an unpromoted account): `loose` is null, `/v1/loose` returns empty.
- **A suggestion's thread renamed**: the read joins the thread's current name.
- **A suggested thread shared after the suggestion was written**: faces are read at draw time; the button shows them.
- **A suggested thread the person left**: membership fails the drawable check; not drawn; swept with the proposals.
- **Accepting while the row was moved by hand on another device**: not drawable, 404; the client reloads.
- **Create with a name equal to an existing thread's**: allowed, as `create_thread` allows it.
- **A note move into a thread holding the same learned text**: 409 `duplicate`, nothing moves.
- **Blobs**: each content move rewraps through `moveContentIn`; a create or undo is one transaction, so a failure leaves nothing half moved.
- **The daily pass over a set that changed while it ran**: the internal route re-reads and intersects; a vanished id is dropped and a group below two is dropped.
- **The pass's switch off**: no proposals; existing ones still draw and can be accepted or dismissed.

## Constitution check

| Principle | How |
| --- | --- |
| DEV-1 | One table per new concept, reused row shapes and sheets, no new chip or sheet component. The faces mark is the one new component, forced by the owner's decision. |
| DEV-2 | Amendments listed in the feature spec's header; tasks update 004, 014 and 025's specs where they state otherwise. |
| QUAL-1 | Every task starts with its failing test (tasks.md). Evals: cases added to 02 (suggestions), 15 (an injected dump and an injected email steering `suggest_thread_id`; the daily pass), 17 (an answer about something loose names no thread). Running them is a separate ask. |
| SEC-1 | Dumped text reaches the daily pass only in a user-turn block under a constant system prompt; the proposed name is validated as one plain line and never rendered as markup or a link. |
| SEC-2 | Every read resolves the caller's default thread on the server; every write re-checks authorship per row and membership of the destination; ids from the model are intersected with the set it was sent; ids from the client are checked against the proposal. |
| DATA-1 | This document, before any code. |
| OFF-1 | The pass's logs, events and traces carry ids, counts, model, tokens, latency and outcome; validation errors log their type. No new product event carries content. A note offload wrote keeps its origin through a move, so compaction's rights over it do not change. |
| OFF-2 | `thread_proposals.name` is plaintext, like `threads.name`; no claim of encryption is made or added. |
| OFF-3 | Moves are per row, by author, with destination membership; Create makes a single-member thread; reads go through membership and the caller's own default thread; tables cascade on account deletion. |
| OFF-4 | The pass reads stored derived fields only and never re-fetches a source. |
| OFF-5 | `propose_threads` is a forced tool validated by Pydantic, one repair, then raise and log; the server validates again. |
| OFF-6 | Every accept is undoable for eight seconds with nothing destroyed: moves are moves, Create's Undo moves things back before the thread is deleted and is refused once the thread has changed. A suggested move into a shared thread is one tap and Undo by the owner's decision, logged as a conditional allowlist entry. Nothing is done without a tap. |
| OFF-7 | The kit is followed; each divergence is in one design decisions entry. Tokens consumed, 025's `Chip` reused, `min-height` throughout. |
| OFF-8 | The planner gains one optional argument and no new context. The daily pass is bounded to 50 items of 200 characters, constant in account age. |
