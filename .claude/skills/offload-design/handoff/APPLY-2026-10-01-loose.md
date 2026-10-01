# Apply: Things without a thread, and Always on retired

Drawn in `explorations/loose-items.html` with the product owner on 1 October 2026, against `main`
read at `e30feeea473c` (027 Today and 026 Mail in built). All three surfaces, both themes.
Standalone copy: `handoff/loose-items-standalone.html`, with the iOS, Android and web switch.

**Ready to build. Nothing is open.** The readme's **Not in a thread** section is the lasting
statement; this file is the build order. Decisions log: *2026-10-01 · Things without a thread, and
Always on retired*.

**No migration for storage.** Loose things stay in the account's default thread
(`accounts.default_thread_id`), under its thread key. What changes is how that thread is drawn,
plus one optional suggestion per item.

---

## 1. Always on goes

- `/v1/threads` returns two groups, `now` and `older`. `always` is gone from `ThreadGroup.key` on
  both clients (`apps/mobile/lib/threads.ts`, `apps/web/src/lib/threads.ts`).
- `threads.always_on` stays in the schema, read by nothing. Promotion stops setting it
  (`apps/core-api/src/admin/promote.ts`, `DEFAULT_THREAD`).
- **Older is time only.** A thread formerly always on ages like any other and comes back up when
  something lands in it.
- `MyThreads.tsx` (mobile) and `panes/MyThreads.tsx` (web) lose the *Always on* heading and its
  `HEADINGS` entry.

## 2. The default thread is never drawn as a thread

- Not in My threads' groups. The server leaves it out of `now` and `older`.
- Not a thread pill: Today, the turn footer and Activity draw nothing in its place. A content row
  whose thread is the default thread has no thread slot.
- Not in the move sheet's list (`MoveSheet.tsx`, the web's move menu).
- Its swipe refusal toast (*This thread can't be deleted...*) goes with it from `ThreadRow`.
- `ThreadBundle` for it is still served (search and answering read it), but no client routes to
  `/threads/[default]`.

## 3. The group on My threads

- **Where:** after the last `now` thread, before *Older threads*. Not drawn when the default thread
  holds nothing live.
- **Heading:** *Not in a thread* with the count, in `MyThreads`' own `Section` (21px semibold, count
  in a `--surface-fill` pill). Not the accent tone.
- **Chips:** one per type present, *All N* first, only when two or more types are present. 34px
  pill on iOS and web, 32px 8-radius outlined on Android; on is `--surface-inverse` (iOS, web) or
  `--surface-accent-soft` with `--moss-700` (Android). Types: To-dos, Links, Photos (photos and
  screenshots together), Notes, Events, Places, Voice notes, Files. Counts beside each in 70% ink.
- **Filter in place.** A chip narrows the group; still three rows, then *All 5 links*. The pick is
  not kept across visits.
- **Rows:** `ContentRow` with its type tile, title, and the meta *Photo · Monday* (kind, then
  created). No thread slot, no tools, no handle. A tap opens the row's sheet, as everywhere.
  A swipe deletes, with the usual Undo. Move is the row sheet's.
- **Three rows,** then *All 14* (or *All 5 links*), 14px medium `--text-secondary` with a chevron,
  44px target.
- Server: `/v1/threads` gains `loose: { count, byType: {task: 3, link: 5, ...}, rows: ContentRow[3] }`.
  Rows newest first. The filtered three come from the screen in item 4 with `?type=`.

## 4. The full list

- A pushed screen, route `/loose` on the phones and a pane on the web (`/threads/loose`).
- Large title *Not in a thread*, line *Put down without a thread, newest first.*, the same chips
  (here they filter the whole list), then every row with its suggestion. Paged as thread content is.
- Server: `GET /v1/loose?type=&cursor=` returns `ContentPage`.

## 5. Suggestions

**Model.** One optional suggestion per content row:

```sql
create table content_suggestions (
  content_id   uuid primary key references content(id) on delete cascade,
  kind         text not null check (kind in ('move','create')),
  thread_id    uuid references threads(id) on delete cascade,  -- move
  proposal_id  uuid references thread_proposals(id) on delete cascade,  -- create
  created_at   timestamptz not null default now(),
  dismissed_at timestamptz
);
create table thread_proposals (
  id uuid primary key, account_id uuid not null, name_enc bytea not null,
  created_at timestamptz not null default now()
);
```

The proposal's name is encrypted under the default thread's key, as its items are.

**Sources.**
- *Move to*: the planner, at filing time. When it files to the default thread but has a candidate
  it was not confident enough to file into, it writes the suggestion with that thread id. A tool
  argument on `add_content` (`suggest_thread_id`), not a second call. Eval cases in
  `02-where-it-goes`.
- *Create*: a daily job per account over the default thread's live rows. Two or more rows that
  belong together get one proposal; each row points at it. Never a single row. Never re-proposes a
  set any of whose rows was dismissed.
- Only when confident. Most rows carry none.

**Drawing.** Under the row's meta, 8px down, **one button** with a 32px cross beside it:
- *Move to*: `--surface-accent-soft` ground, `sparkles` 13px in `--moss-600`, *Move to* in
  13px `--text-secondary`, then `lasso` 12px and the thread's name in `--moss-700` 500. Radius pill
  (8 on Android). Minimum 32 tall, 44 target with the row's padding.
- *Create*: `--surface-raised` ground, 1px dashed `--moss-600`, `sparkles`, *Create*, `plus` and
  the proposed name in `--moss-700` 500, then *new thread* in `--text-secondary`.
- The whole button accepts. The name inside is a label, never a link to the thread.
- The cross writes `dismissed_at`. A dismissed suggestion is never drawn again for that row.
- Name ellipsises; the button never wraps.

**Accepting.**
- *Move to*: immediate. `moveContent(id, threadId)`; the row leaves the group with the change mark;
  toast *Moved to* and the thread pill, Undo (moves it back and restores the suggestion).
- *Create*: a sheet (a second pane on the web). *Create a thread*, *These three look like one
  project.*, a field with the name (editable, 1 to 60 characters), *Moves into it* with each row
  ticked (untickable, at least one stays), Cancel and *Create thread*. On create: the thread, the
  moves, the proposal deleted, then the new thread opens. Undo from its toast deletes the thread and
  returns the rows.

## 6. offload's words

- A dump filed to the default thread replies *Saved.* No thread is named.
  `harness/plan.py` and `prompts/plan_v2.md`: the default thread is described to the model as
  "not in a thread", and the reply never names it. Update `17-the-answer-is-the-reply` and
  `15-injected-text-is-data` rubrics (*Says Miscellaneous.* becomes *Says Saved.*).
- A person saying "stop putting receipts in miscellaneous" still resolves to the default thread.
- The turn footer carries no thread chip for a row filed there.

## 7. Existing accounts

- The thread named *Miscellaneous* on every account stays the default thread. Its name is never
  shown again. A person who renamed it keeps their name in the database; it is unused.
- A person who shared their default thread cannot have (022 refuses `default_thread`), so nothing
  to migrate.

---

## Per surface

| Surface | Files | What |
| --- | --- | --- |
| Server | `routes/threads` (the `/v1/threads` read), `admin/promote.ts`, new `routes/loose.ts`, `jobs/handlers.ts`, migration `0065_loose.sql` | Two groups; `loose` summary; `/v1/loose`; the proposal job; the two tables |
| Agent | `harness/tools.py`, `harness/plan.py`, `prompts/plan_v2.md`, `context.py`, evals 02, 15, 17 | `suggest_thread_id`; *Saved.*; "not in a thread" |
| iOS / Android | `screens/MyThreads.tsx`, `shell/ThreadRow.tsx`, new `shell/LooseGroup.tsx`, `LooseRow.tsx`, `Suggestion.tsx`, `CreateThreadSheet.tsx`, route `app/loose.tsx`, `shell/MoveSheet.tsx`, `shell/ThreadPill.tsx` callers | Items 1 to 5 |
| Web | `panes/MyThreads.tsx`, new `panes/Loose.tsx`, `components/loose/*`, `shell/ThreadPill.tsx` callers, the move menu | Items 1 to 5 |
| Kits (reference) | `ui_kits/mobile_app/LooseParts.jsx` (shared), `ThreadsScreen.jsx`, `M3ThreadsScreen.jsx`, `WApp.jsx`, `data.js` `loose` | The drawing |

## Checks

- My threads shows no *Always on* and no *Miscellaneous*, on every surface.
- A dump with no home lands in the group, and offload says *Saved.*
- A chip filters the group in place; *All 5 links* opens the full list filtered.
- *Move to* moves at once with Undo; the name inside the button does not open the thread.
- *Create* opens the sheet; unticking leaves that row loose; the new thread opens after.
- A dismissed suggestion never returns for that row.
- No suggestion of *Create* for a single row.
- The move sheet does not list the default thread.
- The group is not drawn when empty.
