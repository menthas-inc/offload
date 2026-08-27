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
        │   Core API (Fastify)  │──► Postgres + pgvector (Neon)
        │   authz, schema,      │──► R2 (blobs, pre-signed)
        │   crypto boundary     │──► Upstash (cache, queue)
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
3. The Core API writes the thing, encrypted, owned by the account, unsorted. It returns immediately and enqueues a sort job. The person already has what they need.
4. The worker picks up the job, calls the agent plane, which runs a `sort` tier structured call: which thread does this belong to, what kind of thing is it, does it have a date, does it need the person.
5. The agent plane writes the derived result back through a Core API internal endpoint, so there stays exactly one writer. The thing gains a thread, tags and an embedding.
6. The client learns about it through its next poll or a push. The person sees "Saved to Lisbon trip" with one way back, which is Undo.

Sorting is asynchronous by design. The product's promise is that putting something down is instant and the filing happens afterwards, so the architecture makes exactly that guarantee and nothing stronger.

## The path a conversation takes

Client to Core API to agent plane over sync HTTP, streamed back through the Core API to the client. The composer is a tool, not a chat: a turn can create or change a thing, share a thread with a connection, or answer a question, and the reply carries the outcome plus an Undo. Reversible actions execute; outward-facing ones are proposed and confirmed (OFF-6).

## Boundaries and ownership

- **Core API owns** the canonical schema, migrations, every authorization decision, and the encryption boundary. It is the only writer of canonical tables.
- **Agent plane owns** every Claude call, prompt versions, model routing, retrieval and transcription. It reads through read-models and writes derived artifacts through the Core API.
- **Worker owns** ingestion and scheduled work, and holds no credentials of its own: connected-app tokens stay in the Core API's vault and are used through it.
- **Clients own** the outbox, optimistic state and the undo window.

## Cross-cutting concerns

- **Authorization (SEC-2, OFF-3).** Every access resolves to an owning account or an explicit thread grant, server-side. A grant permits adding to a thread and never permits deleting another person's things, which is a per-row check by author, not a per-thread one.
- **Encryption (OFF-2).** Content columns and blobs are sealed with a per-account data key wrapped by a root key. The Core API is the only place that unwraps, and the agent plane receives plaintext over an internal channel for the duration of a call and persists none of it. Two deliberate gaps, both GA blockers in `decisions.md` and both written into OFF-2 so nothing can overclaim: the root key sits in the database through alpha and beta, and retrieval vectors are stored in plaintext.
- **Key layout.** Three separated things, from the first migration: the ciphertext, `account_keys` (one wrapped data key per account plus a `wrapped_by` column naming its root), and the root itself behind a `RootKeyProvider` interface. Changing custody is then a rewrap over `account_keys`, proportional to accounts, with no content touched.
- **Privacy (OFF-1, OFF-4).** Dumped content is durable. Connected-app content is derived and discarded with a source reference kept for re-fetch. Neither ever reaches analytics, LLM traces or logs.
- **Retention.** Conversations are kept 60 days and hard-purged, as the product states in Settings. Things, threads and memories are kept until deleted. Deletion is real and cascades.
- **Undo.** Deletes are a flag flip plus a purge after the window, never an immediate destroy, because nothing may be destroyed while the toast is up (OFF-6).
- **Observability.** OpenTelemetry for application traces, structured JSON logs carrying ids and outcomes only, Langfuse Cloud for LLM metadata.

## Scale posture

Built for hundreds of accounts, sized so thousands is a configuration change rather than a rewrite. Every service is stateless and horizontally scalable; Postgres is the bottleneck and the `account_id` leading-column discipline plus partition-ready hot tables are the only structural concessions made in advance. Retrieval lives behind an interface in the agent plane, so a dedicated vector store later is a swap, not a migration.
