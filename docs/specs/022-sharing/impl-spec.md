# 022 Sharing, implementation

**Feature spec:** `feature-spec.md` in this folder. **Grounded in:** `docs/tech/decisions.md` (authorship plus membership, threads have members not an owner, a thread dies with its last member, sharing never lets anyone new in, the four key layers and why the thread layer, account deletion resolved, one authorizer, the reversible allowlist), `docs/tech/architecture.md`, `docs/specs/001-data-model/impl-spec.md` (`thread_members`, `thread_keys`, and the `person` it modelled as an address book, which this spec sets aside), `docs/specs/002-encryption/impl-spec.md`, `docs/specs/019-calendars/impl-spec.md` (the proposal on the reply, `connector_pending_writes`, `confirmPending`), `docs/specs/020-photos/impl-spec.md` (fetch and cache on the phones), `apps/core-api/src/threads/access.ts` (`memberOf`, `authorOf`, `unowned`), `apps/core-api/src/blobs/keys.ts` (`threadKey`, `wrapForMembersWithout`), and the design system's `components/core/Avatar.jsx`, whose arithmetic the server reimplements exactly.

## The shape in one paragraph

Three small tables, `connections`, `connection_requests` and `blocks`, one view, `visible_people`, that every reader of "who may see whom" goes through, and four columns on rows that already exist: a `preview` and a `removed_by_account_id` on `thread_members`, `avatar_png` on `accounts`, `kind` on the proposal the reply already carries. A share is `thread_members` in `pending`, as 001 built it, with the sharer's two titles snapshotted onto the row; accepting is the row flipping to `accepted` inside one transaction that re-checks everything and calls `threadKey`, which already wraps the key for an accepted member without one. Taking somebody out is leaving done to them: membership, key and calendar picks gone in one transaction that locks both rows. A said share is a `pending_shares` row the tool creates and the reply draws, answered by the same route shape as a calendar proposal. The mark is 176 by 176 pixels of arithmetic, drawn once with `pngjs` on first read, stored on the account, and drawn by every surface as the picture with the initials over it.

## Data flow

### Finding and requesting

1. `GET /v1/people/lookup?email=` lowercases and trims, refuses anything that is not one address (`z.string().email()`), records the attempt in `people_lookups`, and refuses with 429 `rate_limited` once the account has 30 rows there in the last hour. Then one query: the active account whose `lower(email)` matches, `deleted_at is null`, `state = 'active'`, not blocked in either direction. The response is padded to a floor of 250 ms whether it found anything or not, so timing says nothing.
2. Found: `{ found: { accountId, displayName, initials, email, relation, mark } }`, relation one of `none | you | connected | you_asked | asked_you`, with `requestId` and `since` for the two request states, and `mark`, the picture inline as base64 PNG: a person you have not connected to may not fetch it by id, and the found row draws it. Both clients remember it under the id so `Avatar` draws it without a fetch. Not found is `{ found: null }`, the same 200.
3. `POST /v1/people/requests { accountId }` inside one transaction: the target is visible-or-none under the same predicate (blocked in either direction reads as not found, 404); not yourself (400); not already connected (409 `connected`); no open request in either direction (409 `pending`, or `asked_you` with the id, since the client then offers Accept); no request from you to them created in the last seven days, open or not (409 `too_soon`); fewer than 50 open from you (409 `too_many`). Then the insert. **If the target has blocked the requester the row is inserted with `delivered = false`** and the response is the ordinary 200: the requester's Pending row, its date and every refusal above behave exactly as for a delivered request, and nothing reads an undelivered row on the target's side.
4. The dot is a count: `requestsWaiting` on `/api/me`, open delivered requests to this account with `dismissed_at is null`, off the partial index below. Every screen that draws the gear already reads `/api/me`.

### Answering

- `POST /v1/people/requests/:id/accept`: the row is to this account, open, delivered; in one transaction insert the `connections` row (ordered pair, `on conflict do nothing`), set `accepted_at`, and withdraw any open request the other way, since it is now moot.
- `POST /v1/people/requests/:id/dismiss`: sets `dismissed_at`. The requester sees nothing.
- `DELETE /v1/people/requests/:id`: the requester's Withdraw, sets `withdrawn_at`.
- Expiry is lazy everywhere, `expires_at > now()` in every read, and `people.daily` also sets `withdrawn_at = expires_at` on rows past it, so a row is never half-alive, and deletes any row with `accepted_at`, `withdrawn_at` or `expires_at` more than seven days old, which is exactly the window the seven-day rule reads. Expired, accepted and withdrawn rows are the record of "asked recently" and nothing else, and that is why they go.

### People

- `GET /v1/people` is one response: `requestsForYou` (open, delivered, undismissed, each `{ id, accountId, displayName, initials, since }`), `connections` (each with `threads: [{ id, name }]` of the threads both are accepted members of, most recently active first, and `threadCount`), `pending` (your open requests), `blocked`, and `count`. Four queries in one handler; the connection list is one query with a lateral join for the two thread names and a count.
- `GET /v1/people/:accountId`: `visible_people` decides, then the page: `{ accountId, displayName, initials, relation, shared: [{ id, name, count, lastActivityAt }], requestId }`. `relation` is the view's, `connected | you_asked | asked_you | thread | blocked`.
- `DELETE /v1/people/connections/:accountId`: one transaction: delete the pair; set `withdrawn_at` on open requests either way; set `state = 'expired'` (the schema's word for a share that ended without an answer) on pending `thread_members` rows in either direction where `invited_by` is the other, so a waiting share between them goes. Memberships untouched. 200 `{ removed: true }`; not connected is 404.
- `POST /v1/people/blocks { accountId }`: everything Remove does, then the `blocks` row. `DELETE /v1/people/blocks/:accountId` removes the row and nothing else.

### Sharing a thread

- `GET /v1/threads/:id/share` for the sheet, member only: `members` (accepted, with `since`, and for each other member `added: { count, titles: [two] }` from `content` rows they authored in this thread, one grouped query with a lateral for the titles, which is what the Take out sheet lists), `waiting` (pending rows, with `memberId`), `connections` (your accepted connections not in either list, through `visible_people` and the blocks filter). The default thread answers 404, as does a non-member, one answer.
- `POST /v1/threads/:id/share { accountIds }`: per person, in one transaction: caller is an accepted member; the thread is not the caller's default; the target is an accepted connection of the caller and not blocked either way; there is no accepted or pending row for them; fewer than three pending rows exist with `invited_by = caller` and `account_id = target` across all threads, wait, per pair means across threads, so that is the count of pending rows anywhere with that pair. Then upsert on `(thread_id, account_id)`: insert, or on conflict where the existing state is `expired`, `declined` or `removed`, update it back to `pending` with a fresh `created_at`, `expires_at = now() + 30 days`, `invited_by`, `responded_at = null`, `removed_by_account_id = null`, `removed_at = null`. `preview` is written at the same moment: `{ count, titles }`, the thread's active row count and the two most recently written active rows whose `author_account_id` is the caller, titles only, 120 characters each. No key is written. The response says which succeeded and why each failure did (`not_connected | already_in | waiting | too_many | default_thread`); the sheet draws the one line.
- `DELETE /v1/threads/:id/members/:accountId`: the caller is an accepted member and not the target. If the target row is `pending`, set `state = 'expired'`, which is Withdraw. If `accepted`, Take out: `select ... for update` on both membership rows in `(thread_id, account_id)` order so two callers serialise; re-check the caller is still accepted after the lock; set the target's `state = 'removed'`, `removed_by_account_id`, `removed_at`; delete their `thread_keys` row; `dropPicksOf(target, thread)`; set `state = 'expired'` on any pending row on this thread with `invited_by = target`. Then count accepted members; at zero the thread dies as `deleteThread` kills it, the same soft delete and purge. Nothing else: their `content` rows stay and `unowned` already makes them the thread's, because `authorIsMember` reads accepted membership.
- **Leave** gains the key delete: `deleteThread` deletes the leaver's `thread_keys` row when other accepted members remain, since `restoreThread` inside the Undo window puts the membership back and the next read's `threadKey` wraps a fresh copy from another member's. When the leaver was the last member the key row stays for the eight seconds, as today, and the purge job takes it with the thread. Leaving also expires the shares the leaver had waiting on the thread, as being taken out does. `unowned` and the privacy policy's `Leaving` bullet are unchanged.
- **The pair cap counts live waiting shares only**: pending, unexpired, on a thread that exists. A row a deleted thread or the daily sweep has not reached is not a strip.

### Receiving

- `GET /v1/threads` gains `invitations`: pending rows for this account, unexpired, whose thread is live, whose `invited_by` is still an accepted member of it and still a connection, each `{ memberId, threadId, threadName, from: { accountId, displayName, initials }, preview, members: [displayName] }`. The `members` list is names of accepted members, which the invitation shows so the policy's "you can see who is in it before you add anything" is true. Nothing here reads `content`; `preview` is the snapshot.
- `POST /v1/invitations/:memberId/accept`: one transaction: the row is this account's, pending, unexpired; the thread is live; `invited_by` is an accepted member; the pair is in `connections`. Then `state = 'accepted'`, `responded_at = now()`, `preview = null`, and `threadKey(trx, threadId)`, which wraps for the new member from any holder. 404 for any failed check, one answer.
- Not now is a client action: it closes the screen. The strip's disappearance in the listed cases falls out of the `invitations` query's predicate.

### Saying it

1. The dump body gains `mentions: [{ accountId, name }]`, at most ten. `createDump` keeps only those whose `accountId` is an accepted connection of the sender, in one query, and writes the survivors to `messages.attrs.mentions` with the account's own display name in place of the client's, so the prompt line repeats a name the database holds. The words in the message are untouched.
2. `DumpContext` gains `mentions: list[Mention]`, read from `attrs`, drawn in the prompt as one line per mention, "@Sam Ibekwe is a connection, id <uuid>", inside the user turn's content blocks and never the system prompt. Bounded by the ten.
3. The tool, `share_thread(threadId, person)`, `person` a free string, name or id. The prompt says when to use it and that offload will ask the person to confirm. The server side of it, `proposeShare` in `threads/proposals.ts`, called from `routes/tools.ts`: the thread is one the account is an accepted member of and not its default, else `unknown_thread` or `default_thread`; the person is resolved: an id that is an accepted connection of the account, or a case-insensitive match of the whole name, the first name or the initials against the account's accepted connections; zero is `unknown_person`; **two or more raise the person question from the server**, `raisePersonQuestion` in `questions.ts`, worded from the database ("Share "Lisbon trip" with which Sam?", the candidates' display names as the chips, the thread on `previous_value`), and the model is told `asked`, exactly as a calendar question is; one is checked as the sheet checks, in a savepoint that is rolled back (`already_in | waiting | too_many`), and then a `pending_shares` row with `expires_at = now() + 1 hour`, answered `{ ok: true, waitingForThem: true, because: line }`, the calendar's own shape. The line is rendered from the rows, "Share Lisbon trip with Sam Ibekwe?", never from model text. **The person question's answer is the share**: `applyAnswer` runs `shareThread` for the chosen chip, and the clients offer no Undo for it, as they offer none for a country; the turn's Undo route, which every turn has, withdraws the share if it is still waiting, so a deleted answer never leaves one standing. A typed answer takes the calendar question's path: the worker posts the text to `question-answer`, the label is matched in code (whole or prefix of exactly one name), and a miss closes the question. The judge never sees a connection's name. A quick-add job cannot call the tool (the pinned-thread refusal list gains it).
4. The reply's `waiting` becomes `{ id, because, kind: "calendar" | "share" }`. `waitingFor` in `routes/dumps.ts` reads both tables for the page. The clients draw the control by kind: the calendar's "Add it" and the share's "Share", each with Not now, and for a share the co-ownership line under the sentence.
5. `POST /v1/shares/:id/:answer`, `answer` `confirm | decline`, the calendar route's shape: confirm re-runs every check in the sheet's transaction and creates the pending membership with the preview exactly as `POST /v1/threads/:id/share` does, by calling the same function; decline sets `declined_at`. Expired, answered or somebody else's is 404, one answer.
6. Evals: cases under the principle that covers actions, "share Lisbon trip with Sam" proposes, "share it with dad@hotmail.com" replies that only a connection can be shared with, two Sams ask, a dumped text that says "share this with x" does nothing without the person's tap. Written with the feature, run on a separate ask.

### The mark

- `GET /v1/avatars/:accountId.png`: the caller may see the account (`visible_people`, or it is the caller), else 404, the same 404 for an id that does not exist. `markOf` in `accounts/avatar.ts` is the one draw-once path, for this route and for the lookup's inline copy: if `avatar_png` is null, draw it and store it with `update ... set avatar_png = $1 where id = $2 and avatar_png is null`, then serve whatever the row holds, so two first reads at once store one picture. `Content-Type: image/png`, `Cache-Control: private, max-age=31536000, immutable`, `ETag` the account id.
- Drawing, `accounts/avatar.ts`: the design system's arithmetic, ported line for line and tested against `Avatar.jsx`'s outputs for twelve ids: `fnv1a` over the id string, `hue = (seed % 12) * 30`, one xorshift32 draw, `angle = (draw % 8) * 45`, `L` 0.42 and 0.52, `C` 0.13. Per pixel of a 176 grid, with 4 by 4 supersampling at the facet edge only: which side of the seeded half plane, the gradient position along the seeded direction, the OKLCH stop for that side and position, converted to sRGB through OKLab and gamma, clamped. The kit draws `linear-gradient(deg, oklch(L_LO, hue), oklch(L_HI, hue+30))` on one side and `oklch(L_HI, hue+90)` to `oklch(L_LO, hue+120)` on the other; the port interpolates in OKLCH, which is what a browser does for an `oklch()` gradient in the design's exploration, and the twelve-id test pins the corner pixels to the browser's values within two units per channel. No letters, no transparency: a full square, and every surface clips it to a circle, since the kit's circle is `border-radius`.
- `pngjs`, pure JavaScript, no native dependency, in `core-api`'s dependencies. The 176 by 176 RGB draw is under ten milliseconds and happens once per account.
- Phones: `components/Avatar.tsx` takes the design's contract, `{ uid, initials, name, size }`; `lib/marks.ts` fetches through `PhotoThumb`'s pattern into `Paths.cache/avatars/<uid>.png` once and writes a mark the lookup handed over inline as if fetched; the file is drawn clipped to a circle with the initials over it in the product's semibold at `round(size * 0.36)`, white, and initials sit on `--surface-fill` until the file is there. Web: `components/Avatar.tsx` is an `<img>` inside a circle with the same overlay, the cookie carries the session, and a remembered inline mark is the `src` when there is one. The gear on the phones' Today reads `/v1/people` on focus for its dot, since `useMe` reads once per mount.

## Data model

### Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Connections: 3 typical, 50 heavy. Open requests: 1 typical, 50 cap (the three caps, lookups, requests and shares per pair, count under a transaction-level advisory lock on the asker or the pair, so requests fired together cannot each pass). Blocks: 0 typical, 10 heavy. Waiting shares to an account: 1 typical, 30 heavy (three per pair, ten sharers). Proposals: 0 or 1 open, gone in an hour. Lookups: 5 a day typical, 30 an hour cap. One mark per account, 4 to 8 KB. |
| Fan-out | Members per thread: 1 typical, 3 shared typical, 10 heavy. Threads per connection pair: 1 typical, 20 heavy. |
| Growth | Human paced: a request a week, a share a week for an active account. Two years is under 200 rows per account across the three tables. `people_lookups` is the only row that accumulates without a person, and the daily job deletes rows older than a day. |
| Read pattern | `/api/me` reads the dot count on every launch and every Settings open. My people reads all four lists on open. The share sheet reads members, waiting and connections on open. My threads reads invitations on every open. The person page reads one row plus the shared threads. The mark is read once per account per device and cached forever. The tool reads connections once per said share. |
| Write pattern | Rare and human paced; a burst is somebody sharing one thread with five people, five rows. |
| Sort and filter | Connections of an account (either column). Open delivered undismissed requests to an account. Open requests from an account, and requests from an account to another created in the last seven days. Blocks by blocker and by blocked. Pending memberships of an account, unexpired, and pending rows per `(invited_by, account_id)` pair. Open proposals per message. Lookups per account in the last hour. |

- **Pagination:** none. Every list is bounded by the caps above; the heaviest, fifty connections with two thread names each, is one response.
- **Indexes:** `connections (account_a, account_b)` primary and `(account_b)`; `connection_requests (to_account_id) where accepted_at is null and withdrawn_at is null and delivered`, `(from_account_id, to_account_id, created_at)`; `blocks (blocker_account_id, blocked_account_id)` primary and `(blocked_account_id)`; `thread_members (invited_by, account_id) where state = 'pending'` for the pair cap, and the existing `(account_id, state, thread_id)` serves the invitation list; `pending_shares (message_id) where confirmed_at is null and declined_at is null`; `people_lookups (account_id, looked_up_at)`.
- **Normalisation:** `connections` is one row per unordered pair, `account_a < account_b` by check, so mutual is structural and removal is one delete. `thread_members.preview` is a deliberate copy of two titles and a count at share time, so an invitation never reads `content`; it is nulled on accept and goes with the row. The connection count on the Settings row is `count(*)`, fifty rows at most, not a column.
- **Partitioning:** none.

### Schema

`0053_sharing.sql`:

```sql
create table connections (
  account_a  uuid not null references accounts (id) on delete cascade,
  account_b  uuid not null references accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_a, account_b),
  check (account_a < account_b)
);
create index connections_b_idx on connections (account_b);

create table connection_requests (
  id              uuid primary key default uuid_v7(),
  from_account_id uuid not null references accounts (id) on delete cascade,
  to_account_id   uuid not null references accounts (id) on delete cascade,
  -- False when the recipient had blocked the requester: the row exists so the
  -- requester's side is indistinguishable from a delivered one, and nothing on
  -- the recipient's side reads it.
  delivered       boolean not null default true,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '30 days',
  dismissed_at    timestamptz,
  withdrawn_at    timestamptz,
  accepted_at     timestamptz,
  check (from_account_id <> to_account_id)
);
create unique index connection_requests_open_key
  on connection_requests (from_account_id, to_account_id)
  where accepted_at is null and withdrawn_at is null;
create index connection_requests_waiting_idx
  on connection_requests (to_account_id)
  where accepted_at is null and withdrawn_at is null and dismissed_at is null and delivered;
create index connection_requests_recent_idx
  on connection_requests (from_account_id, to_account_id, created_at);

create table blocks (
  blocker_account_id uuid not null references accounts (id) on delete cascade,
  blocked_account_id uuid not null references accounts (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (blocker_account_id, blocked_account_id),
  check (blocker_account_id <> blocked_account_id)
);
create index blocks_blocked_idx on blocks (blocked_account_id);

-- A said share, proposed by the model and waiting for the person's tap. The
-- calendar's `connector_pending_writes` is the same idea for a different
-- destination, and the two stay apart because their checks share nothing.
create table pending_shares (
  id                uuid primary key default uuid_v7(),
  account_id        uuid not null references accounts (id) on delete cascade,
  message_id        uuid not null references messages (id) on delete cascade,
  thread_id         uuid not null references threads (id) on delete cascade,
  target_account_id uuid not null references accounts (id) on delete cascade,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '1 hour',
  confirmed_at      timestamptz,
  declined_at       timestamptz
);
create index pending_shares_message_idx on pending_shares (message_id)
  where confirmed_at is null and declined_at is null;

-- Who looked somebody up, for the hourly cap. Never the address.
create table people_lookups (
  account_id   uuid not null references accounts (id) on delete cascade,
  looked_up_at timestamptz not null default now()
);
create index people_lookups_idx on people_lookups (account_id, looked_up_at);

alter table thread_members
  drop constraint thread_members_state_check,
  add constraint thread_members_state_check
    check (state in ('pending', 'accepted', 'declined', 'expired', 'removed')),
  -- The invitation's whole view of the thread: the count and two of the
  -- sharer's own titles, taken when the share was made. Null once accepted.
  add column preview               jsonb,
  add column removed_by_account_id uuid references accounts (id) on delete set null,
  add column removed_at            timestamptz;
create index thread_members_pair_pending_idx
  on thread_members (invited_by, account_id) where state = 'pending';

-- The prism, drawn once from the id, never rewritten. Not content.
alter table accounts add column avatar_png bytea;

-- Who may see whom. One definition, read by the lookup, the sheet, the @
-- list, My people, the person page, the mark and the tool. Rows are
-- (viewer, account, relation); the reader still filters the account's state
-- and the blocks the other way, in `visibleTo`, so that one test covers both.
create view visible_people as
  select account_a as viewer_account_id, account_b as account_id, 'connected' as relation from connections
  union all
  select account_b, account_a, 'connected' from connections
  union all
  select to_account_id, from_account_id, 'asked_you' from connection_requests
    where accepted_at is null and withdrawn_at is null and expires_at > now() and delivered
  union all
  select from_account_id, to_account_id, 'you_asked' from connection_requests
    where accepted_at is null and withdrawn_at is null and expires_at > now()
  union all
  select a.account_id, b.account_id, 'thread'
    from thread_members a
    join thread_members b on b.thread_id = a.thread_id and b.account_id <> a.account_id
    join threads t on t.id = a.thread_id and t.deleted_at is null
    where a.state = 'accepted' and b.state = 'accepted'
  union all
  -- one way: the member sees who the thread is waiting on, the one waiting sees nobody until they accept
  select a.account_id, b.account_id, 'waiting'
    from thread_members a
    join thread_members b on b.thread_id = a.thread_id and b.account_id <> a.account_id
    join threads t on t.id = a.thread_id and t.deleted_at is null
    where a.state = 'accepted' and b.state = 'pending' and (b.expires_at is null or b.expires_at > now())
  union all
  select blocker_account_id, blocked_account_id, 'blocked' from blocks;
```

`visibleTo(viewer, account, trx)` in `people/access.ts` is the one function: exists in `visible_people` for the pair, the account is `active` and not deleted, and a `blocks` row with the account as blocker and the viewer as blocked hides only `connected` and `asked_you`, the relations the block ended; `thread`, `you_asked` and `blocked` stand, since hiding them would blank a mark on a row the screen draws (found in the security review: a co-member who blocked you was a 404 on the pane head). Relation precedence when several rows match: `blocked`, `connected`, `asked_you`, `you_asked`, `thread`, `waiting`. The person page says "Waiting on a share" for the last.

**Away from 001's model.** 001's impl-spec kept a connection as `people.linked_account_id` in an address book. Nothing built the address book, and a connection is a mutual fact between two accounts rather than a row in one person's book that another person's book has to agree with, so it is its own table. Logged in `docs/tech/decisions.md`.

`schema.ts` gains the five tables, the view, and the columns. The schema drift test covers them.

## Interfaces

### Client

| Route | Does |
| --- | --- |
| `GET /v1/people/lookup?email=` | The one row or null. 429 past thirty an hour. |
| `POST /v1/people/requests` | Request. 404, 400, 409 `connected \| pending \| asked_you \| too_soon \| too_many`. |
| `POST /v1/people/requests/:id/accept`, `/dismiss` | Accept, Not now. 404 for anything not open and yours. |
| `DELETE /v1/people/requests/:id` | Withdraw. |
| `GET /v1/people` | Cards, Connected, Pending, Blocked, count. |
| `GET /v1/people/:accountId` | The page. 404 under the one predicate. |
| `DELETE /v1/people/connections/:accountId` | Remove. |
| `POST /v1/people/blocks`, `DELETE /v1/people/blocks/:accountId` | Block, Unblock. |
| `GET /v1/avatars/:accountId.png` | The mark. 404 under the one predicate. |
| `GET /v1/threads/:id/share` | The sheet. |
| `POST /v1/threads/:id/share` | Share with each of `accountIds`; per-person outcome. |
| `DELETE /v1/threads/:id/members/:accountId` | Withdraw a waiting share or Take out. |
| `GET /v1/threads` | Gains `invitations`. |
| `POST /v1/invitations/:memberId/accept` | Add it to my threads. |
| `POST /v1/shares/:id/confirm`, `/decline` | The said share's tap. |
| `POST /v1/dumps` | Gains `mentions`. Reply's `waiting` gains `kind`. |
| `/api/me` | Gains `requestsWaiting`. |
| `DELETE /v1/threads/:id` | Unchanged; Leave on More calls it. |

### Internal

`POST /internal/v1/tool-call` gains `tool: "share_thread"` with `{ threadId, person }`, answering `{ ok: true, kind: "pending", pendingId, line }` or `{ ok: false, error: "unknown_thread" | "default_thread" | "unknown_person" | "ambiguous" | "already_in" | "waiting" | "too_many", candidates? }`. The pinned-thread refusal list in that route gains it.

### Agent

`harness/tools.py` gains `ShareThread(thread_id, person)` with its schema; `plan_v2.md` gains the paragraph: use it when the person asks to share or add somebody to a thread, name the person as they did or by the mention's id, and say that offload will share once they confirm; on `ambiguous`, ask with the candidates; on `unknown_person`, say that only a connection can be shared with and that My people is where connections are. `DumpContext.mentions`, and `fit` keeps it whole, as it keeps `answered`. The tool is sent on dump turns only, never quick add.

### Mobile

`app/settings/[page].tsx` gains `people` (the cards, Connected, Pending, Blocked) and `app/settings/blocked.tsx`; `app/people/[accountId].tsx` (PersonScreen, More with the three actions, the two confirmations as `RowActionSheet`s with a body); `app/people/add.tsx` (Add a connection, a pushed screen with the field, the four states); `app/invitations/[memberId].tsx` (InviteScreen); the share sheet in `components/shell/ShareSheet.tsx`, the `MoveSheet` pattern with the lifted rows, checkboxes, the eight-row field lifted by the keyboard, the empty state, and the two confirmations for the x; the strip in `MyThreads.tsx`; the request card in `settings/index.tsx` and on the people page; the dot on the gear in `Today.*.tsx` and on the My people row; `components/Avatar.tsx`; the @ list in `Composer.tsx` above the plate with the keyboard's lift, tracking the `@` token in the field and inserting the name; the proposal by kind in the conversation's turn; Leave in `Thread.tsx`'s More for a thread with more than one member, confirmed, calling `deleteThread` and the toast it already has.

### Web

`settings/people/page.tsx` and `settings/people/blocked/page.tsx`; `app/(shell)/people/[id]` as a pane (`WPerson`); `Add a connection` as a modal step inside the share modal, as `WShareModal` has it; the share modal and the invitation modal (`WInviteModal`) from `panes/Thread.tsx` and `panes/MyThreads.tsx`; the strip; the card on `settings/page.tsx`; the sidebar dot; `components/Avatar.tsx`; `WMentions` in the composer; the proposal by kind; faces on the pane head without you, each a door; Leave on the pane's More.

## Prompt budget, per OFF-8

Mentions add at most ten short lines to the user turn, per message, never per account age. The connection list never enters the prompt: the tool resolves names on the server, and an ambiguous name becomes a question the server words. `share_thread`'s definition is one more tool, **sent only to an account with a connection**, for the reason the calendar tools are sent only with a calendar: with nobody to share with it can only fail, and the base budget stays what it was. The worker reads `connections` for that one fact and nothing else of 022's tables.

## Found on the way

Two defects in shipped code, each with a test that was red before its fix: the answer route's `optionAsValue` carried its own switch over five fields and no `thread`, so a tapped thread chip from 020 closed the question and moved nothing; and the web composer dropped `waiting` from a settled turn, so a calendar proposal only ever appeared after a reload.

## Dependencies

- `pngjs` in `core-api`. Nothing native.
- Nothing new on the phones or the web: `expo-file-system` for the cache, `react-native-svg` unused.
- No new job kind beyond `people.daily`, started by `startDaily` beside `blob.daily`.

## Tests, and what stays a device check

The suite covers every API AC with two accounts: lookup, both directions of a request and every refusal, the seven-day rule against a withdrawn row, the fifty cap, the block that writes an undelivered row, the pair cap of three, the preview snapshot's author filter, accept re-checking each of its four facts, take-out's lock (two transactions racing), the key row's deletion, `unowned` after take-out, the said share's resolution outcomes and the tap's re-check, mention validation dropping a forged id, the view's relations and what a block the other way hides, the waiting relation one way, a typed answer to the person question hitting and missing, the turn's Undo withdrawing a share, the mention's name read back from the account, the mark's bytes pinned for twelve ids, the cascade on account row deletion, and that no event or log line carries an address, a name or a thread name. The agent's eval cases are written and not run. On devices: the 36px prism at 3x, the dot on the gear in both themes on both phones, the share sheet's field over the keyboard, the @ list above the keyboard, the sheets' bottom inset, and one real said share end to end.

## Edge cases

- **The same address, two accounts:** impossible by `accounts_email_key`. A deleted account's address freed and reused is a new id and a new mark.
- **A request to somebody who deletes their account:** the row cascades. The requester's Pending row goes; nothing says why.
- **Accept after the requester withdrew:** the row is withdrawn, 404, the card is already gone on the next read.
- **Share with somebody who removed you a second ago:** `not_connected` in the per-person outcome, one line in the sheet.
- **Add it after the sharer was taken out:** the invitation query no longer lists it and accept 404s; the client shows "Not here any more." and refreshes the list.
- **Take out while the target is mid-turn:** their next write through `requireMember` is refused; the tool-call route answers `unknown_thread` and the model says the thread is not there.
- **Take out the last other member:** the thread survives with one member. Take out where the actor is the only one left after: impossible, since nobody takes themselves out; a thread reaches zero only if two actors race, and the lock serialises them so the second finds the first gone and is refused; if the first took out the second and the second, already committed, took out the first, the second transaction sees the first's row as `removed`, its own actor check fails, and it rolls back. Zero-member death is defensive, not a path.
- **A pending share whose sharer's connection was removed:** the invitation query filters on the pair, so the strip goes; the row is set `expired` by Remove.
- **Re-sharing after take-out:** the upsert flips `removed` back to `pending`, which the person accepts or not.
- **A connection of a connection in the @ list:** absent; the list is accepted connections only.
- **A mention of somebody who is a member but not a connection:** dropped on receipt; the words stay.
- **Fifty-one connections:** the field appears in the sheet; nothing else changes.
- **A name that is a substring of another's** ("Sam" and "Samira"): whole-name, first-name and initials matches only, so "Sam" matches Sam Ibekwe and not Samira; "Samira" matches Samira alone.
- **The mark for an account with `avatar_png` set and a changed algorithm later:** the bytes stand; the twelve-id test is what stops the algorithm changing unnoticed.
- **Reduced motion, dark theme:** the mark is the same in both; nothing animates.

## Constitution check

- **DEV-1:** three tables, one view, four columns, one tool; the proposal reuses 019's wire shape with a `kind`; accept reuses `threadKey`.
- **DEV-3:** `pngjs`, a view, partial indexes.
- **QUAL-1:** the test list above, one per AC.
- **QUAL-2:** `visibleTo` is the one predicate; take-out and accept are one function each, called by the route and by the tool's confirm.
- **SEC-1:** the address is validated as one email and parameterised; mentions are filtered against the sender's connections on receipt; names from the model are matched, never interpolated; a dumped text asking to share yields at most a proposal a person must tap.
- **SEC-2:** every write re-checks membership, connection, block and cap server-side, at the sheet and again at the tap; the tool has no field that skips the proposal; the visibility view is read by the server alone.
- **DATA-1:** this document.
- **OFF-1:** events carry the actor's pseudonym and counts; no name, address or thread name in a log; `people_lookups` stores no address. The preview is a copy of two titles on a membership row, purged with the share, and it is stored so the thread is never read by a non-member.
- **OFF-2:** the mark is not content and is stored plain; titles were plaintext columns already.
- **OFF-3:** membership server-side throughout; sharing at thread level by connection only; no public link; author protection per row unchanged; take-out under the amendment in the same change, confirmed, never by the model, recorded.
- **OFF-5:** the tool's schema and answers are typed; `ambiguous` carries candidates the model must pass back through `ask`'s schema.
- **OFF-6:** request, share, accept, Add it, Withdraw, Take out, Remove, Block: each confirmed by its control, none undoable; Leave keeps its Undo; the said share is a proposal until the tap.
- **OFF-7:** the divergences are listed in the feature spec for one `decisions.md` entry.
- **OFF-8:** mentions are bounded per message; no connection list in the prompt.
