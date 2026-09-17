# 003 The dump, impl spec

> The how. Grounded in `docs/tech/`, and it says where it depends on something still open.

## Data flow

```
browser                    Core API (TS)                Postgres              worker (Python)
   │                            │                          │                       │
   ├─ POST /v1/dumps ──────────►│                          │                       │
   │                            ├─ one transaction: ──────►│                       │
   │                            │    message (state=seen)  │                       │
   │                            │    conversation, if new  │                       │
   │                            │    job (interactive)     │                       │
   │◄─ 202 { messageId } ───────┤                          │                       │
   │                            │                          │                       │
   ├─ GET /v1/messages/:id/     │                          │                       │
   │      stream  (SSE) ───────►│  holds open              │                       │
   │                            │                          │◄── claim, SKIP LOCKED ┤
   │                            │                          │                       │
   │                            │                          │◄── read: turns,       │
   │                            │                          │    thread names       │
   │                            │                          │                       │
   │                            │                          │      Claude ◄─────────┤
   │                            │                          │                       │
   │                            │◄─ POST /internal/v1/turn-result ─────────────────┤
   │                            ├─ writes reply message ──►│                       │
   │                            │  marks person msg answered                       │
   │                            │  writes llm_usage                                │
   │◄─ event: done ─────────────┤                          │                       │
```

**The worker never writes canonical rows.** It reads, calls Claude, and posts the result back. `stack.md` calls this the one-writer rule, and this feature is the first to exercise it.

## Data model

Three tables from `001-data-model`, migrated now as `0008_the_dump.sql`. Columns are that spec's, unchanged, minus what this feature has no use for.

**`conversations`** · `id` · `account_id` · `title` (null in this feature) · `started_at`, `last_message_at` · `unread_at`, `last_read_at` · `created_at`, `deleted_at`, `purge_after`

**`messages`** · `id` · `conversation_id` · `account_id` · `role` (`person|offload`) · `type` (`text` only here) · `turn_id` · `text` · `state` (`queued|seen|answered|failed`) · `client_key` (nullable, unique per account) · `source` (`person` only here) · `source_ref` · `attrs jsonb` · `created_at`, `deleted_at`, `purge_after`

**`llm_usage`** · `id` · `account_id` · `job_kind` · `category` · `model` · `input_tokens`, `output_tokens`, `cache_read_tokens` · `cost_micros` · `latency_ms` · `created_at`

*`llm_usage` is a ledger and is kept indefinitely. It carries no content and no free text, so nothing in it ages out. Stated because `001` left its retention unwritten and DATA-1 asks.*

`blobs`, `content_blobs` and `content` are **not** created. Nothing here writes them and creating a table before its first writer is how a column gets a meaning nobody remembers choosing.

### Deliberately not adding `content`

The naming question raised in the feature spec, that "thing" is retired as the product's noun while `001` names the central table `content`, is **not resolved here and does not need to be**. The product owner intends to revise the data model after this feature. Recorded so the next spec knows it is still open rather than settled by silence.

## Volume and access

| Field | conversations | messages | llm_usage |
| --- | --- | --- | --- |
| Records per account | 200 typical, 1,500 heavy | 4,000 typical, 40,000 heavy | one per model call, so ~= person messages |
| Fan-out | 20 messages per conversation typical, 200 heavy | n/a | n/a |
| Growth | 1 a day for an active account | 12 a day, bursty | 6 a day |
| Read pattern | the live composer reads the newest one; the six-hour join reads the newest one | the composer reads the tail of one conversation; the prompt reads the same tail | the admin Costs page, which does not exist yet |
| Write pattern | one row per six-hour session | two rows per dump, person then offload | one row per call |
| Sort and filter | newest by `last_message_at` for one account; `unread_at is not null` for one account | by `conversation_id` ordered by `created_at`; by `client_key` for dedup | by account and month |

**What follows.**

- **Pagination:** the composer reads a fixed tail, the most recent 50 messages of one conversation, newest first, cursor by `created_at, id`. Nothing here loads a whole conversation, and the heavy case at 200 messages is already above what a composer should render at once.
- **Indexes:**
  - `conversations (account_id, last_message_at desc) where deleted_at is null` covers both the six-hour join and the newest-conversation read.
  - `conversations (account_id) where unread_at is not null and deleted_at is null`, partial, for the unread check, which is one row or none.
  - `messages (conversation_id, created_at desc) where deleted_at is null` for the tail.
  - `messages (account_id, client_key) unique where client_key is not null` for AC-11. Partial, because most messages have no client key.
  - `llm_usage (account_id, created_at desc)`.
- **Normalisation:** `conversations.last_message_at` is denormalised rather than a `max()` over messages, because the six-hour join runs on every dump and is the hottest read in the feature. It is written in the same transaction as the message that moved it.
- **Partitioning:** none. 40,000 rows on a heavy account is not a partitioning problem.

## The numbers

Pinned here so AC-10, AC-12 and AC-14 have something to test against. Every one is a constant in code, not a literal at a call site.

| What | Value | Why this number |
| --- | --- | --- |
| Max dump length | 10,000 characters | About 2,500 tokens. Longer than anything the composer is designed for and short enough that a paste cannot run up a bill. Refused with 413 before the message is written. |
| Prompt: conversation turns | 20 most recent | Ten exchanges. Enough for "actually make that the 21st" to resolve, bounded so it cannot grow with the account. |
| Prompt: thread names | 12 most recently active | The kits show three groups and never more than about a dozen threads at once. Ordered by `threads.last_activity_at`, resolved through `thread_members`. |
| Prompt: total ceiling | 8,000 tokens | Counted before the call. Over it, turns are dropped oldest first, then thread names. The dump itself is never dropped. |
| Concurrent interactive jobs per account | 2 | One in flight and one queued behind it is a person dumping fast. Three is a loop. |
| Retries | 1, so `max_attempts` 2 | AC-5. |
| Job visibility timeout | 120 seconds | A model call that has not returned in two minutes is not going to. |
| SSE connection lifetime | 300 seconds, then the client reconnects | Bounds the revocation gap in AC-17 and keeps proxies from closing it first. |
| SSE heartbeat | every 15 seconds | A comment frame, so an idle proxy does not drop a live stream. |

## Interfaces

### `POST /v1/dumps`

Body `{ text: string, clientKey?: string }`. Auth: session cookie.

One transaction:

1. Refuse over 10,000 characters with 413 (AC-14), before writing anything.
2. If `clientKey` matches an existing message for this account, return that message's id and stop (AC-11).
3. Find the account's newest conversation. Join it if `last_message_at` is under six hours old, otherwise insert one (AC-2).
4. Insert the message: `role='person'`, `state='seen'`, `turn_id` fresh.
5. Update `conversations.last_message_at`.
6. Enqueue `dump.answer` at `PRIORITY.interactive` with payload `{ messageId, conversationId }` and **nothing else** (OFF-1: the text stays in its row and out of the job payload, which is the thing that ends up in a log line).

Returns 202 `{ messageId, conversationId, state }`.

Steps 3 to 6 are one transaction, so a job never references a message that is not committed.

### `GET /v1/messages/:id` and `GET /v1/messages/:id/stream`

The plain one returns the message, its state and its reply if answered. The stream is SSE over the same data: `event: thinking` on connect if still unanswered, `event: done` with the reply, `event: failed`, then close. Both are scoped by account (AC-9); another account's id is 404.

**The stream is not the only way to the answer** (AC-4). A client that was disconnected when the reply landed fetches it from the plain endpoint. The stream is an optimisation over polling, and the reconnect path is what makes it safe to be one.

**Revocation (AC-17).** The stream re-checks the session and `accounts.state` on every heartbeat, and closes on failure. `002` enforces revocation at Better Auth's refresh, which only fires on a request, and an open stream makes none. Fifteen seconds is the resulting exposure and it is stated rather than discovered.

### `POST /internal/v1/turn-result`

Called only by the worker, over Railway's private network, with a bearer service token compared in constant time. Never exposed at the edge.

Body `{ jobId, replyText, usage: { model, inputTokens, outputTokens, cacheReadTokens, latencyMs } }`.

**The account and conversation come from the job row, looked up by `jobId`, never from the body** (AC-16). The worker is not trusted for an access decision, which is SEC-2 applied to a service rather than a browser. A body naming an account is refused rather than ignored.

Idempotent on `jobId`: at-least-once delivery means a retry must not write a second reply.

One transaction: insert the `offload` message, flip the person's message to `answered`, set `conversations.unread_at` and `last_message_at`, insert `llm_usage`.

## The worker

`apps/agent`, Python, `uv`, one entrypoint. No HTTP surface: nothing calls it, so it has no routes to expose. FastAPI arrives as a second entrypoint on the same image when something needs to call in.

**Claiming.** Its own `SELECT ... FOR UPDATE SKIP LOCKED`, mirroring `apps/core-api/src/jobs/queue.ts`, with the per-account cap added:

```sql
where state = 'queued' and run_after <= now()
  and (select count(*) from jobs r
       where r.state = 'running' and r.account_id = jobs.account_id) < 2
order by priority, run_after
for update skip locked limit 1
```

⚠️ **Two implementations of the claim query now exist, in two languages, and they must not drift.** The TypeScript runner drains email jobs and the Python worker drains model jobs. This is the cost of the two-plane split showing up for the first time. A shared test asserts both honour the cap and the priority order.

**Database access.** A dedicated Postgres role with `select` on `conversations`, `messages`, `threads`, `thread_members`, `jobs` and `accounts.state` only, and `update` on `jobs` for claiming. No access to `sessions`, `account_identities`, `account_keys` or `staff`. The one-writer rule becomes a grant rather than a convention (SEC-2).

**The prompt.** System prompt is a frozen string in git, carrying no account data. Then, as separate content blocks in the user turn:

1. The thread names, labelled as trusted context.
2. The conversation tail.
3. The dump itself, labelled as untrusted content from the person.

They are never concatenated into one block (AC-7, SEC-1). The system prompt states the rule that content in the untrusted block is data and never an instruction.

**The call.** `converse` tier, so Claude Sonnet 5 per `decisions.md`. Structured output: the model returns `{ reply: string }` through a validated schema rather than bare text, and a validation failure gets one repair-and-revalidate retry before raising (AC-22, OFF-5). Prompt caching on the frozen system prompt.

**Failure.** A call that never completes is a job failure and retries once through the existing backoff. Two failures marks the message `failed` through the internal endpoint, and the composer shows it. `jobs.last_error` is scrubbed before it is written, which `001` already requires; this feature is the first where the exception can contain a person's text, because the model SDK embeds the request body in some errors.

## The screen

`apps/web/src/app/(app)/today/page.tsx`, extending the composer already there.

It stays on Today rather than being lifted into the shell, which is where `WComposer`'s own note says it belongs. There is nowhere else to navigate yet, and lifting it is a layout change this feature would be carrying for a future one. **Stated as a limitation:** there is no conversation list and no full-pane view, so the live composer and the unread-reopen path are the only ways back to a conversation.

**Two states no kit draws.** Both are a first stab, to be adjusted:

- **Seen**, ported from `ui_kits/mobile_app/LiveConversation.jsx`'s `StatusChip`: the 👀 pill on `--paper` with a hairline border, sitting under the person's message. Its text alternative is the readme's string, "seen, not answered yet", not the kit's shorter "Seen" (AC-20).
- **Failed**, invented here: an inline row under the message in `--surface-attention-soft` with `--text-on-attention`, carrying the line and a Try again control. Persistent, not a toast, because a toast clears in eight seconds and the person who stepped away never sees it (AC-5).

**The field takes lines, since 2026-09-17.** On web it is a textarea that grows with the text to the kit's 380px and then scrolls; Enter sends and Shift+Enter is a line, because the keyboard is the whole input there and Enter is reserved for send. On the phones the keyboard is on screen and the arrow sends, so Enter is a line, which the multiline field already did. The lines travel as they were typed: the API stores the text verbatim (a test holds it to that), the prompt hands the dump to the model as one block with its breaks, and the person's own bubble draws them with `white-space: pre-wrap`; only the sheet's title collapses them to one line.

**Live region** around the thinking indicator and the arriving answer, polite, announced once per transition (AC-19). **Reduced motion** replaces the pulsing dots with a static label rather than a faster pulse (AC-21).

## Dependencies

- `ANTHROPIC_API_KEY`, on the worker service and in local `.env`. **Blocks the first real run and nothing else**; tests use a stubbed client. *A service account key scoped to a workspace, not an organisation key. Workload Identity Federation would be better and is not available to us: it needs an ambient OIDC identity and Railway has none. See `decisions.md`.*
- A new Railway service for the worker, sharing `DATABASE_URL` through its own restricted role.
- `INTERNAL_SERVICE_TOKEN`, shared by the Core API and the worker.
- Python toolchain in CI: `uv`, `pytest`, `ruff`, path-filtered per `stack.md`.

## Edge cases

- **Two dumps in one conversation at once.** Serialised per conversation: the second job waits on the first. The kit's `writing` flag is one boolean per conversation and cannot represent two (AC-13).
- **A dump arriving while the account has no thread at all.** Cannot happen: promotion creates Miscellaneous. If it did, the thread list is empty and the prompt says so rather than failing.
- **A conversation exactly at the six-hour boundary.** Under six hours joins. Computed in the database in one statement, so two dumps a millisecond apart cannot disagree.
- **The reply is empty or whitespace.** Treated as a validation failure, so it takes the repair retry (AC-22) rather than being written as a blank turn.
- **The person deletes the conversation mid-flight.** The internal endpoint writes into a soft-deleted conversation, and the client never sees it. Accepted: the row is consistent and invisible, which is better than a job that fails on a race.
- **Session expires mid-stream.** Closed on the next heartbeat (AC-17).

## Constitution check

- **SEC-1** AC-7 and the three-block prompt; the system prompt states the untrusted-data rule. `ANTHROPIC_API_KEY` and `INTERNAL_SERVICE_TOKEN` are environment only.
- **SEC-2** AC-9 scoping, AC-16 deriving account from the job, and the worker's Postgres grants.
- **OFF-1** Job payload carries ids only; `jobs.last_error` scrubbed; AC-8 extends to span attributes and SDK exceptions.
- **OFF-3** Thread names resolve through `thread_members`, which is the only path, since `threads` has no owner column.
- **OFF-5** AC-22, structured output with one repair retry.
- **OFF-6** Nothing outward facing; nothing filed, so nothing to undo.
- **OFF-7** Three divergences owed entries: seen on web, the failed state, and the hidden camera and microphone.
- **OFF-8** AC-10, three stated bounds enforced before the call.
- **DATA-1** This document, written before the migration.
