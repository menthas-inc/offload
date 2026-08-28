# Architecture

> High-level shape of the system. Keep current; the planning personas read this.

## Components

Four deployable services in one monorepo, talking over a typed API and a queue.

- **Mobile (Expo)** and **Web (Next.js)**, the clients. The Next.js app serves the marketing site, the web app and the admin panel as three route groups.
- **Core API (Fastify, TypeScript)**, user-facing data and authorization. Owns the schema, the migrations, the encryption boundary, and blob pre-signing. Stateless.
- **Agent plane (FastAPI, Python)**, the only thing that talks to Claude. Owns prompts, the harness, structured schemas, retrieval, transcription.
- **Worker (Python, same image as the agent plane, different entrypoint)**, queue consumer and scheduled jobs: sorting a dump, ingesting a connected app, nightly maintenance.

```
   Mobile (Expo)          Web (Next.js)
    outbox → sync          marketing / app / admin
        └────────┬──────────────┘   HTTPS, OpenAPI
                 │
        ┌────────▼──────────────┐
        │   Core API (Fastify)  │──► Postgres + pgvector (Railway)
        │   authz, schema,      │──► R2 (blobs, pre-signed)
        │   crypto boundary     │──► jobs table (queue, same txn)
        └────┬─────────────┬────┘
             │ sync HTTP   │ enqueue
             │             ▼
             │        Worker (Python) ──► connected apps: mail, calendar, browser
             ▼             │
      Agent plane (FastAPI)◄┘ ──► Claude, Deepgram, Langfuse Cloud
```

## The path a dump takes

This is the flow the whole product is built around, so it is worth writing down once.

1. A person dumps text, a link, a photo, a screenshot or a voice note. The client writes it to its local outbox and shows it immediately. Nothing blocks on the network.
2. The client uploads any blob straight to R2 with a pre-signed URL, then posts the dump to the Core API.
3. The Core API writes the thing, owned by the account, unsorted, and enqueues its sort job **in the same transaction**, so a thing can never exist unsorted-and-unqueued. It returns immediately. The person already has what they need.
4. The worker picks up the job, calls the agent plane, which runs a `sort` tier structured call: which thread does this belong to, what kind of thing is it, does it have a date, does it need the person.
5. The agent plane writes the derived result back through a Core API internal endpoint, so there stays exactly one writer. The thing gains a thread, tags and an embedding.
6. The client learns about it through its next poll or a push. The person sees "Saved to Lisbon trip" with one way back, which is Undo.

Sorting is asynchronous by design. The product's promise is that putting something down is instant and the filing happens afterwards, so the architecture makes exactly that guarantee and nothing stronger.

## The path a conversation takes

Client to Core API to agent plane over sync HTTP, streamed back through the Core API to the client. The composer is a tool, not a chat: a turn can create or change a thing, share a thread with a connection, or answer a question, and the reply carries the outcome plus an Undo. Reversible actions execute; outward-facing ones are proposed and confirmed (OFF-6).

## Two processing modes

Every unit of work is one of two kinds, and the distinction is who is waiting.

**Interactive.** Someone is looking at a spinner. The composer, a question, any tool call made from the composer. The request is admitted to the queue, the agent plane picks it up, and the answer comes back to the client.

The queue is here for **admission control, not durability**: it is what lets us bound concurrency and throttle request volume globally and per account, which is the same mechanism the token ledger and the admin panel's Limits page act on. Without it, a burst of dumps is a burst of uncapped Claude calls.

**Scheduled.** Nobody is waiting, and offload is pushing rather than answering. Hourly, daily, nightly: compacting memories, the brief telling someone what needs them, pulling a connected app, retention purges. These may use Claude's Batch API, which is half price and is only viable precisely because nobody is waiting.

Both run through the same `jobs` table. What differs is priority, deadline, and whether a delay is visible to anyone. Two consequences worth stating: an interactive job needs a deadline and a defined behaviour when it misses it, and scheduled work must never be able to starve interactive work, which means the queue is not FIFO.

## Everything is in a thread

`thread_id` is NOT NULL on a thing. There is no unsorted state in the data model, because a partially-placed thing is a state every query and every screen would then have to handle.

Every account gets a **default thread** at creation for one-offs and things that never earn a home of their own: a link sent from a phone to a laptop, a note with nowhere to go. A new dump lands there and the sorter moves it if it belongs somewhere better. It is an ordinary thread, so it opens, holds things and reads like the others.

This also removes a special case from the key hierarchy: an object key is always wrapped by a thread key, never by an account key, because there is never a moment when a thing has no thread.

## Everything is a tool

The composer is a tool surface, not a chat. The design system puts it plainly: any UI task in offload can be said instead of tapped. That makes the tool registry the real API of the product, and it has three consequences.

**Two execution sites.** Server-side tools change data: create a thing, move it, share a thread, change a setting. Client-side tools change what you are looking at: open a thread, jump to a settings page, focus the composer. The response envelope therefore carries actions for the client to perform, not only text to render.

**Every tool declares its OFF-6 tier.** Reversible tools execute and offer Undo. Outward-facing tools are proposed and confirmed. The tier belongs on the tool definition, so that adding a tool forces the question rather than leaving it to the caller.

**The registry threatens the context budget.** If everything is a tool, the tool list itself grows without limit and is sent on every call. Past roughly a few dozen tools, use the Anthropic tool-search tools with `defer_loading: true` on the long tail, so the model retrieves the tools it needs instead of carrying all of them. This is the same discipline as OFF-8 applied to tools rather than to memories.

## Boundaries and ownership

- **Core API owns** the canonical schema, migrations, every authorization decision, and the encryption boundary. It is the only writer of canonical tables.
- **Agent plane owns** every Claude call, prompt versions, model routing, retrieval and transcription. It reads through read-models and writes derived artifacts through the Core API.
- **Worker owns** ingestion and scheduled work, and holds no credentials of its own: connected-app tokens stay in the Core API's vault and are used through it.
- **Clients own** the outbox, optimistic state and the undo window.

## Cross-cutting concerns

- **Authorization (SEC-2, OFF-3).** Every access resolves to an owning account or an explicit thread grant, server-side. A grant permits adding to a thread and never permits deleting another person's things, which is a per-row check by author, not a per-thread one.
- **Encryption (OFF-2).** Cold storage only. Blobs in R2 are sealed with a per-account data key that R2 does not hold; database content is plaintext. The Core API owns the key path and is the only thing that unwraps. A grantee reads a shared blob because the server checked the grant, not because they hold a key, which is why the key is per account rather than per thread: a thing can move between threads and an object should never need re-keying.
- **Key layout.** Four layers, one primitive. The root wraps each account key; an account key wraps that account's copy of a thread key; the thread key wraps a per-object key; the object key encrypts the blob. A thread key exists once and every member holds their own wrapped copy, which is what makes a shared thread co-owned rather than borrowed.
- **What each layer buys.** Sharing a thread rewraps one small key for the new member. Deleting an account destroys its account key and its wrapped thread-key copies, so private content goes and shared threads survive untouched, with no departed key retained and no blob rewritten. Moving a thing between threads rewraps the object key, 60 bytes, so the eight-second Undo is free. Through alpha and beta the root sits in the database; moving it is a rewrap over `account_keys` alone. Losing the root loses every blob, including for Cloudflare, so backing it up is an operational requirement.
- **Privacy (OFF-1, OFF-4).** Dumped content is durable. Connected-app content is derived and discarded with a source reference kept for re-fetch. Neither ever reaches analytics, LLM traces or logs.
- **Retention.** Nothing a person put in is purged on a clock: things, media, conversations and memories are kept until deleted. Retention applies only to data that exists for us, meaning analytics events, logs, traces and LLM metadata, which are minimised on a short clock. Deletion, when a person asks for it, is real, immediate and cascading. *This diverges from the design, which states a 60-day conversation rule; logged in the design system's own decisions file.*
- **Undo.** Deletes are a flag flip plus a purge after the window, never an immediate destroy, because nothing may be destroyed while the toast is up (OFF-6).
- **Observability.** OpenTelemetry for application traces, structured JSON logs carrying ids and outcomes only, Langfuse Cloud for LLM metadata.

## Scale posture

Built for hundreds of accounts, sized so thousands is a configuration change rather than a rewrite. Every service is stateless and horizontally scalable; Postgres is the bottleneck and the `account_id` leading-column discipline plus partition-ready hot tables are the only structural concessions made in advance. Retrieval lives behind an interface in the agent plane, so a dedicated vector store later is a swap, not a migration.
