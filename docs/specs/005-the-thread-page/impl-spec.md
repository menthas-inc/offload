# 005 The thread page, implementation spec

> How. The what and the why are in `feature-spec.md`.

**Amended 2026-10-17 (the owner):** the as-built is in `feature-spec.md`'s note of the same date and in the code it names.

## Shape

```
apps/web
  (app)/layout.tsx          the shell: sidebar + pane stack, new
  (app)/threads/page.tsx    My threads
  (app)/threads/[id]        a thread, as a pane
  (app)/content/[id]        a piece of content, as a pane beside it

core-api
  GET    /v1/threads                    My threads, grouped
  GET    /v1/threads/:id                the bundle: thread, members, counts
  GET    /v1/threads/:id/content        one page, cursor
  GET    /v1/content/:id                one piece, with provenance
  PATCH  /v1/content/:id                title, body
  POST   /v1/content/:id/move           author only
  POST   /v1/content/:id/archive        and /restore
  DELETE /v1/content/:id                author only, soft
  PATCH  /v1/threads/:id                rename
```

No new services, no new dependencies, and the agent plane is untouched. This is the first feature since 002 that is mostly a client.

## Data model

**One column.** That is the whole schema delta, and it is the point of having cut the feature down.

```sql
alter table content add column archived_at timestamptz;
```

Everything else this feature needs already exists: `threads.name`, `always_on`, `content_count`, `last_activity_at`, `thread_members.state`, `content.account_id` for authorship, `content.derived_from_message_id` for provenance, and `deleted_at` plus `purge_after` for delete.

**`content_count` is what is live in the thread**, neither archived nor deleted, since 2026-09-16 and `0047`, which put every existing thread on that footing once. Archive and restore maintain it in the same transaction as the write, as delete and move already did, and the agent's `archive_content` tool the same way; a move of an archived row moves neither count. It is the number on the thread row and it equals the bundle's `counts.active`. *Until then archiving left it alone on the grounds that the row was still there, and My threads said 9 about a thread whose own page said 7.*

### Why `archived_at` is not `deleted_at`

They look alike and they are opposites. `deleted_at` starts an eight second clock ending in destruction and is author-only. `archived_at` is a permanent, reversible, everybody-can-do-it state that means "not in the active list any more". A shared grocery list is unusable without it and dangerous with only the other one.

A row can be archived and later deleted. It cannot be deleted and later archived, because after eight seconds it is not there.

### Indexes

```sql
-- The active list, which is what the page reads on every open.
create index content_thread_active_idx
  on content (thread_id, created_at desc)
  where deleted_at is null and archived_at is null;

-- Archived, read on demand and never on the hot path.
create index content_thread_archived_idx
  on content (thread_id, archived_at desc)
  where deleted_at is null and archived_at is not null;
```

`content_thread_idx` from `0011` stays: it covers both states and serves the count.

**No GIN on tags.** There are no tags until 006 and no cross-thread tag query until search. 001's heavy case is 500 rows in one thread, so a widget or a group filters an already-fetched page in memory. A composite `(thread_id, tags)` GIN would need the `btree_gin` extension, which is not installed, and buying an extension for a query nothing runs is the opposite of DEV-1.

## Volume and access

Required section, and the numbers come from 001 rather than from optimism.

| | Typical | Heavy | Growth |
| --- | --- | --- | --- |
| threads per account | 40 | 300 | 1 to 3 a week |
| content per thread | 15 | 500 | 5 to 20 a day across all threads |
| members per thread | 1 | 8 | slow |
| archived per thread | 0 at first | most of a perpetual list | grows with use |

| Read | Query | Index |
| --- | --- | --- |
| My threads | member's threads, newest activity first | `thread_members(account_id, state, thread_id)` joined to `threads(last_activity_at desc)` |
| The bundle | one thread by id | primary key |
| Its members | members plus display names | `thread_members(thread_id, account_id)` unique |
| Its counts | active and archived, one query | `content_thread_idx`, which covers both states, with a `filter` per count |
| Its content | one page, newest first | `content_thread_active_idx` |
| One piece | by id | primary key |
| Its provenance | the message it came from | `messages` primary key |

*The counts come from one query over `content_thread_idx`, which covers both states, rather than from two partial index scans. Postgres will not scan two partial indexes in one statement; it picks one and filters. Said precisely because "one pass over the two partial indexes" was written first and is not how the planner works.*

**The bundle is five queries and does not grow with anything.** Thread, members, counts, first page, and the thread's memories. *It was four, and this line reserved the fifth for a standing summary. 008 spent it on memories instead, which are capped at ten per thread, so the count is still fixed. A standing summary, when it exists, reads from the same table and takes no sixth.* What is forbidden is a query per widget, which is how this read would grow with a thread's shape rather than with its size.

*The same shape serves the agent plane when 006 gives it `list_thread_content`: the same predicate, the same index, a smaller page. It is not a read that happens on every model turn, and nothing here should be built as though it were.*

## Authorization

Two helpers, used by every write, and nothing calls the tables directly.

```
memberOf(accountId, threadId)   -> thread_members.state = 'accepted', per call
authorOf(accountId, contentId)  -> content.account_id = accountId, per row
```

| Action | Check |
| --- | --- |
| read a thread or its content | `memberOf(viewer, thread)` |
| edit, archive, restore | `memberOf(actor, thread)` |
| delete | `memberOf(actor, thread)` **and** `authorOf(actor, content)` |
| move | `memberOf(actor, source)` and `memberOf(actor, destination)` **and** `authorOf(actor, content)` |
| rename a thread | `memberOf(actor, thread)` |

### Move is author-only, and it is worth saying why

```
move(actor, content, destination):
  require authorOf(actor, content)
  require memberOf(actor, content.thread)
  require memberOf(actor, destination)
```

An earlier draft allowed any member to move any content anywhere they themselves could reach, which is a delete performed by a non-author: the content leaves a thread its author is in and lands in one they are not, with no notice and no way back. Precisely what OFF-3 forbids, arrived at by a route OFF-3 does not mention.

The fix could have been narrow, letting a non-author move only within the author's reach. The product owner chose the broad one. **Move sits with delete**, because both change who can see something, and the result is a permission model that fits in one sentence rather than two.

**One refusal reason** for every failure above, exactly as `004`'s tool endpoint does. A thread that does not exist, a thread you are not in, and a thread the author is not in are one answer, or the endpoint is a membership oracle for other people's threads.

## Interfaces

### `GET /v1/threads`

```
{ groups: [
    { key: "now",    threads: [{ id, name, icon, count, meta }] },
    { key: "always", threads: [...] },
    { key: "older",  threads: [...] } ] }
```

`now` is `always_on = false` and active, `always` is `always_on = true`, `older` is anything whose `last_activity_at` is more than **30 days** old, whichever flag it carries. Derived, never stored, because it is a function of time rather than a property of the thread, which is 001's own reasoning.

`meta` is composed server-side from the count and the member names, because it is one string in three clients and composing it three times is how they drift.

### `GET /v1/threads/:id`

```
{ id, name, icon, alwaysOn, counts: { active, archived },
  members: [{ accountId, displayName, initials, isYou }],
  standing: null }
```

`standing` is always `null` today. The field is in the shape so that when something writes summaries it fills and no client changes. **Null renders nothing at all**, not an empty state: a line saying offload has not summarised a thread is an apology in the most prominent space on the screen.

### `GET /v1/threads/:id/content?cursor=&archived=`

Cursor is `(created_at, id)`, which UUIDv7 makes monotonic, exactly as 001 specifies. Page size 30. `archived=true` reads the other index.

Each row carries `id, type, title, body, createdAt, author: { accountId, displayName, isYou }, canDelete`. **`canDelete` is computed server-side** and is the same predicate the DELETE endpoint enforces, so the client cannot draw a control the server will refuse and cannot hide one it would allow.

### `GET /v1/content/:id`

Adds provenance: the message it was derived from, its text, and when. **Never the source thread's name**, because content that moved carries a name the viewer may have no right to (AC-17). Provenance is the dump and the author, not the history of where it has been.

### The writes

All five return the row as it now is, plus what it was, so the client can offer Undo without a second round trip and without holding state across a reload.

```
PATCH  /v1/content/:id          { title?, body? }        -> { content, previous }
POST   /v1/content/:id/move     { threadId }             -> { content, previous }
POST   /v1/content/:id/archive                           -> { content, previous }
POST   /v1/content/:id/restore                           -> { content, previous }
DELETE /v1/content/:id                                   -> { undone: false }
PATCH  /v1/threads/:id          { name }                 -> { thread, previous }
```

Undo for the first four and the last is calling the same endpoint with `previous`. Undo for delete is `POST /v1/content/:id/restore`, which is the same endpoint archive uses and clears `deleted_at` and `purge_after` together.

**Delete reuses 004 exactly**: soft, `purge_after = deleted_at + 8 seconds`, and it enqueues `content.purge` in the same transaction. No second mechanism.

**Move maintains both counts** in one transaction, along with both threads' `last_activity_at`.

## The screen

The kit is `web_app/WApp.jsx` for the shell and `WThing.jsx` for the thread. Read both before writing any of it; the readme is not a substitute and this repo has the scar to prove it.

- **The shell** is a sidebar plus two panes, and **every pane has a URL**. The stack is derived from the route rather than accumulated: `/today`, `/threads`, `/threads/:id` is My threads beside that thread, `/content/:id` is its thread beside that piece. Somebody opening a link cold gets the same two panes, browser back works, and there is no stack to fall out of step with the address bar. Under 1180px it drops to one pane and the crumb becomes a back button. *An earlier draft held the stack in client state; a thread that cannot be linked cannot be shared, and offload cannot answer a dump by pointing at where it filed things.*
- **The composer is in the shell, under every pane, on every tab.** The kit's own words: "one composer, under both panes, spanning the window. It never belongs to a pane." The readme has the reason: the composer is a tool rather than a chat, and any UI task in offload can be said instead of tapped, so a place you can say things cannot be one tab. Today keeps the invitation and the three examples, and an example reaches the composer through one custom event rather than a store, because one message is not a store's worth of machinery.
- **offload's reply links to the threads it wrote to.** `GET /v1/messages/:id` and the stream both carry `threads`, built from `content(derived_from_message_id)` joined to `threads`, deduplicated, in filing order. **From the rows, never from the reply**: a link that came from parsing a sentence could point at a thread the turn never touched, which is the failure 004's truthfulness criterion exists to prevent.
- **My threads** is `WThings`: three groups, a count on each row, "All N older threads" behind a ghost button.
- **The thread** is `WThing`: head with faces and share, the standing summary when there is one, "Everything in here", per-row tools.
- **An item** is `WTask`: its own pane, the thread as a chip, "Where this came from".
- **Undo** is the `Toast` component 004 already wired, unchanged.

**New surface, needing a `decisions.md` entry each:** the archived state, which no kit draws though every kit draws an `archive` control, and the conditional delete control.

## Dependencies

None. No new packages, no new services, no new environment.

## Edge cases

- **The last member leaves a thread while somebody is reading it.** Reads 404 rather than 403, on the same one-reason rule.
- **Content is moved out of the thread you are looking at.** The page is stale, not wrong. Refetch on focus; do not subscribe.
- **Two people edit the same title.** Last write wins, and `previous` in the response is what the loser's Undo would restore, which would silently revert the winner. Accepted for now and named: the alternative is a version column and a conflict UI for a two-person alpha.
- **Archive then delete inside eight seconds.** Both flags set, purge takes it. Undo restores both in one call.
- **A thread with 500 rows.** One page of 30, cursor for the rest. The count comes from the aggregate, so the header is honest even though the list is not complete.
- **A thread with no content.** Invitation, not a zero, and the composer is not on this screen so the invitation has to say where to go.
- **An account with no threads at all.** Only reachable before promotion, which cannot happen, but the empty state exists rather than a crash.

## Constitution check

| | |
| --- | --- |
| DEV-1 | One column. The widget system, tags, priority and grouping all moved out rather than being built ahead of their data. |
| DEV-2 | The three kit divergences are logged in the same change. |
| DEV-3 | No new dependency. |
| QUAL-1 | `tasks.md` maps each criterion to a test. |
| QUAL-2 | Authorization is two helpers used by every write, not a check repeated per endpoint. |
| SEC-1 | No model in this feature. Content is rendered as text, never as markup. |
| SEC-2 | Every read and write is membership-checked server-side, per call. `canDelete` is computed by the same predicate that enforces it. |
| DATA-1 | Schema, indexes, volumes and every access path are above, before the code. |
| OFF-1 | AC-18. Nothing here emits an event carrying a title or a thread name. |
| OFF-2 | No blobs. |
| OFF-3 | Author-only delete, per row. Move cannot put content beyond its author's reach. |
| OFF-4 | No connectors. |
| OFF-5 | No model output crosses a boundary here. |
| OFF-6 | Five reversible actions, eight seconds, nothing destroyed inside the window, delete on 004's purge. **`archive` is added to the allowlist in `decisions.md` in this change**, because OFF-6 says an action is reversible only once listed. |
| OFF-7 | Three divergences logged with **Design system impact** filled in. |
| OFF-8 | No prompt. |
