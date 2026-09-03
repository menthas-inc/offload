# 003 The dump, tasks

Ordered so each phase is verifiable before the next. A to C are API and worker, which is where the risk is; D is the screen; E closes.

**Blocked on you** is marked 🔴. Everything else I do.

## Phase A, foundation

- [x] **A1** `ANTHROPIC_API_KEY` in the root `.env` and on the worker service. A real dump has been answered in both places. **A service account key scoped to a workspace**, not an organisation key, so spend and revocation are per workload. *Blocks the first real model call and nothing before it: everything through B4 is testable with a stubbed client. Workload Identity Federation would remove this secret entirely and cannot be used here, because it needs an ambient OIDC identity and Railway has none. See `decisions.md`.*
- [x] **A2** Migration `0008_the_dump.sql`: `conversations`, `messages`, `llm_usage`, with the five indexes named in the impl-spec. `things` and `blobs` deliberately not created. (DATA-1)
- [x] **A3** Kysely codegen so the new tables are typed from the schema, and the schema-drift test still passes.
- [x] **A4** A restricted Postgres role for the worker: `select` on `conversations`, `messages`, `threads`, `thread_members`, `jobs`, `accounts`; `update` on `jobs`; nothing on `sessions`, `account_identities`, `account_keys`, `staff`. (SEC-2)
- [x] **A5** `apps/agent` skeleton: `uv`, `ruff`, `pytest`, one worker entrypoint, no HTTP surface. Path-filtered CI job running lint and tests.
- [x] **A6** `INTERNAL_SERVICE_TOKEN` in both services' environments, compared in constant time.

## Phase B, the loop without a screen

- [x] **B1** `POST /v1/dumps`: length refusal, `clientKey` dedup, the six-hour conversation join, message insert and enqueue, all in one transaction. (AC-1, AC-2, AC-11, AC-14)
- [x] **B2** `GET /v1/messages/:id`, account-scoped, returning state and reply. (AC-3, AC-4, AC-9)
- [x] **B3** `POST /internal/v1/turn-result`: service token, account and conversation derived from the job row, idempotent on `jobId`, one transaction writing the reply, the state flip and `llm_usage`. (AC-6, AC-16)
- [x] **B4** The worker's claim loop with the per-account cap, and tests asserting the cap, the priority order and that neither runner takes the other's kinds. (AC-12) *Marked done once before the tests existed, which the review caught.*
- [x] **B5** The harness: frozen system prompt in git, three-block user turn, structured output with one repair-and-revalidate retry, prompt caching. (AC-7, AC-22, OFF-5)
- [x] **B6** Prompt assembly with all three bounds enforced before the call, and the thread list resolved through `thread_members`. (AC-10, AC-15, OFF-3, OFF-8)
- [x] **B7** Failure path: one retry, then the message marked failed through the internal endpoint, with `jobs.last_error` scrubbed. (AC-5, AC-8)
- [x] **B8** `dump_sent`, `dump_answered`, `dump_failed` events with their `schemas/events` entries and CI validation, carrying no content. (AC-18, OFF-1)

## Phase C, delivery

- [x] **C1** `GET /v1/messages/:id/stream`: SSE, heartbeat every 15 seconds, 300 second lifetime, `thinking` / `done` / `failed`. CORS to the web origin with credentials. (AC-4)
- [x] **C2** Session and account-state re-check on every heartbeat, closing the stream on failure. (AC-17)

## Phase D, the screen

- [x] **D1** The composer submits, optimistically renders the person's turn, and opens the stream, and rebuilds the conversation on load through `GET /v1/conversations/current`. Stays on Today; no conversation list and no full-pane view, which is the stated limitation.
- [x] **D2** The seen marker on web, ported from `ui_kits/mobile_app/LiveConversation.jsx`'s `StatusChip`, with the readme's fuller text alternative. **First stab, to be adjusted.** (AC-20)
- [x] **D3** The thinking state, and the answer rendering into the same composer. (AC-3)
- [x] **D4** The failed state: inline, persistent, with Try again. **Invented here, no kit draws it. First stab, to be adjusted.** (AC-5)
- [x] **D5** Live region around the thinking state and the answer, announced once per transition. Reduced motion replaces the pulse with a static label. (AC-19, AC-21)
- [x] **D6** Reconnect: on stream close before an answer, fetch the plain endpoint rather than assuming failure. (AC-4)

## Phase E, closing

- [x] **E1** Tests for every acceptance criterion, named by AC. 151 TypeScript and 22 Python.
- [x] **E2** Three `decisions.md` entries in the design system: the seen marker on web, the failed state, and the hidden camera and microphone. Each with **Design system impact** filled in. (OFF-7)
- [x] **E3** `/review` panel, then the constitution pass, then fixes. **One critical, six highs.** The worst: an SSE tick could write to an ended response and take the API process down with an unhandled rejection, which is the ordinary case of closing a tab mid-dump; dump jobs inherited the email default of five attempts, so a failing dump retried four times before anybody was told; the idempotency key was check-then-insert, so the concurrent retry it exists for raised a 500 on the unique index; and nothing rebuilt the conversation on load, so AC-1's promise was true of the database and false of the product.
- [x] **E4** Deployed. Migrations 0008 to 0010 applied on boot, the worker runs as its own Railway service with root directory `apps/agent`, and a real dump was answered in production: `claude-sonnet-5`, 478 input tokens, 2,380ms, job closed, usage recorded.
- [ ] **F1** 🔴 Look at the composer in a browser. The seen marker and the failed state are first stabs on surfaces no kit draws, and neither has been seen by a person. Unverifiable from here: Better Auth signs its session cookie, so the tests exercise the states through `streamStep` rather than the rendering.
- [ ] **F2** Merge to `main`, and point the agent service's branch at it. It tracks `003-composer` today.

## Tests, by acceptance criterion

- **T-AC1** A dump is stored before the job is enqueued, and survives a forced failure at every later step.
- **T-AC2** Under six hours joins, over six hours starts a new one, none starts the first. The boundary is computed in one statement.
- **T-AC3** State is `seen` until answered and `answered` after, in the API response. `queued` never reaches a client.
- **T-AC4** The reply is fetchable from the plain endpoint after the stream is closed, and a reconnect mid-flight still receives it.
- **T-AC5** Two consecutive model failures mark the message failed, leave the dump readable, and scrub the error.
- **T-AC6** Every call writes a usage row, including a failed one.
- **T-AC7** Against the assembled request body: the system prompt contains no account data, the dump is in a user turn, and thread names are their own block.
- **T-AC8** No dumped text in any event, log line, span attribute or `jobs.last_error`, including when the SDK raises with the request body attached.
- **T-AC9** Another account's message id returns 404 on both endpoints.
- **T-AC10** A conversation of 200 turns and an account of 300 threads produce a prompt inside all three bounds.
- **T-AC11** The same `clientKey` twice creates one message.
- **T-AC12** Above the cap for one account, another account's dump is still claimed. Asserted against both claim queries.
- **T-AC13** Two dumps in one conversation are answered in order.
- **T-AC14** 10,001 characters is refused with 413 and writes nothing.
- **T-AC15** With two accounts present, the prompt assembled for one contains no row belonging to the other.
- **T-AC16** A result body naming a different account than its job is refused.
- **T-AC17** A disabled account's open stream closes on the next heartbeat.
- **T-AC18** Each of the three events validates against its schema and carries no content.
- **T-AC22** A malformed model response takes one repair retry, then raises and is logged.

*AC-19, AC-20 and AC-21 are visual and assistive and have no server surface. Checked in a browser and against the design system, not asserted in the suite.*
