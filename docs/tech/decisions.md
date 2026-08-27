# Planning decisions

> Per-area decisions made during planning. Deliberately not exhaustive. The overall shape lives in `stack.md` and `architecture.md`.
>
> Status: ✅ decided · 🔶 recommended default, open to revisit · ⚠️ open, needs a call before it is built.
>
> Design decisions live in a different log, `.claude/skills/offload-design/decisions.md`, which is the design system's own file. Anything with a visual result goes there. Anything technical goes here.

## Provenance

offload starts from superparent's stack rather than from nothing, because most of those decisions were good and none of them were free. What follows is what carried over, what changed, and why. Where a decision is inherited unchanged it says so, so nobody re-derives it.

## Clients

- ✅ **Expo (React Native) for both phones, with a deliberate native escape hatch.** Inherited from superparent. The escape hatch is new and it is the reason for three rules that are not negotiable: the API contract is platform-agnostic and OpenAPI-described; business logic lives behind the API or in plain TypeScript with no React imports; design tokens ship as generated JSON, never as `StyleSheet` objects. The likely future is native iOS with Android staying on Expo, not a full rewrite of both.
- ✅ **The two mobile kits are genuinely different and the code should admit it.** The design system ships an iOS kit and a Material 3 kit with different navigation motion and different component chrome. Use `.ios.tsx` / `.android.tsx` where a component really differs and `Platform.select` for a constant. Do not build one component with a pile of conditionals.
- ✅ **One Next.js app, three route groups** (`(marketing)`, `(app)`, `(admin)`). Inherited from superparent. The admin group gets its own layout with the moss navigation, so it is never mistaken for the app.
- ✅ **Online-first with a durable outbox.** Changed from superparent, which was online-first with nothing local. A dump must never fail, because dumping happens on a train. Writes queue locally (SQLite on mobile, IndexedDB on web) and sync when there is signal, showing as pending. Reads still need a connection. *Rejected: full local-first sync (Legend-State, PowerSync). It solves a problem we do not have yet, and shared threads plus per-account encryption make the conflict story worse, not better.*
- ✅ **TanStack Query v5 for server state, Zustand for ephemeral UI only.** Inherited. The boundary stays strict.
- ✅ **Push via Expo Push.** Inherited. *Gotcha, also inherited: tickets report accepted, not delivered. Instrument an app-side receipt callback or notification health is invisible.*
- ✅ **Undo is a flag flip.** Nothing is destroyed while the toast is up, and the purge happens after the eight-second window. The design system's prototype does exactly this and the reason it gave is the right one: it is what makes undo cheap.

## Backend

- ✅ **Two planes: TypeScript Core API plus Python agent plane.** Inherited from superparent, and it held up there.
- ✅ **Fastify, not NestJS.** Changed. Nest's structure was genuinely useful for agentic implementation, but it is a lot of ceremony for one developer, and `zod` plus `fastify-type-provider-zod` gives us the parts we wanted: validated DTOs, generated OpenAPI, clear module boundaries.
- ✅ **Single writer.** The Core API owns the canonical schema, the migrations and every canonical write. The Python plane reads through SQLAlchemy read-models and writes derived artifacts through a Core API internal endpoint. Inherited, and it is the decision that keeps validation and encryption in one place.
- ✅ **Kysely plus hand-written SQL migrations.** Inherited. The model is unstructured-first, so migrations copy data, which is where a declarative-diff ORM stops paying for itself. *Prisma and TypeORM rejected, same reasoning as superparent.*
- ✅ **UUIDv7 primary keys.** Inherited. Time-ordered, non-enumerable.
- ⚠️ **Data model is not designed yet** and it should be its own spec before any table exists. What is already fixed by the product: `thread` holds `thing`, a `memory` is separate and polymorphic, a `connection` is a person you can share with, a `grant` is thread-level and one-permission. Name them exactly that in table, field, route, type and prop, from the first migration. The design system's fixture calls a thread a `space` in places; that is prototype residue and it is not a schema.

## Ownership, sharing and tenancy

- ✅ **Ownership plus grants, not tenancy.** Changed from superparent entirely. superparent had a household tenant and a `household_id` on every row. offload has personal accounts and per-thread sharing, so the boundary is an owning `account_id` on every content row plus an explicit `grant` row per shared thread. There is no tenant.
- ✅ **One permission, enforced per row by author.** A grant means they can add to a thread and can never delete what is yours. That is a per-row check on the author of the thing, not a per-thread role. No viewer and editor, no roles, no public links.
- ✅ **Sharing never lets anyone new into offload.** A share targets an existing account, matched by email or username. Someone without an account goes through the waitlist. Carried straight from the design system's closed decisions.

## Privacy and encryption

- ✅ **Content is durable, egress is not (OFF-1).** Changed from superparent, and it is the deepest change. superparent's identity was never persisting content. offload's identity is persisting it. The hard line moved from storage to egress.
- ✅ **Per-account envelope encryption at rest (OFF-2).** New. Content columns and blobs are sealed with a per-account data key, wrapped by a root key held outside the database. *Cost accepted knowingly: key rotation, backup of wrapped keys, a decryption path on every read, and no meaningful defence against a compromised running service, since the planes need plaintext to work. It defends against a database dump, a leaked backup and a stolen bucket. Say that and nothing more to a user.*
- ✅ **Encryption is scoped to cold storage only (2026-08-26).** Blobs in R2 are encrypted with a key R2 does not hold. Database content, including titles, notes, transcripts, memories and retrieval vectors, is plaintext in Postgres, protected by Neon's disk encryption and by access control. *This supersedes the earlier decision to encrypt content columns. That version encrypted the database while keeping the unwrapping key in the same database and the vectors in the clear, which was real complexity on every read for almost no defence. A narrow claim that is true beats a broad one that is not, and OFF-2 now states the narrow one.*
- ✅ **The honest consequence, written down so nobody rediscovers it in an incident.** A database dump exposes all text content. Encrypting a blob protects the media, not what the media says: a voice note's audio is encrypted while its transcript is a plaintext column, and the same holds for screenshot text and image descriptions. Anyone reasoning about the privacy posture should start from those two sentences.
- ✅ **Retrieval stays ordinary.** pgvector with an HNSW index, plaintext vectors, normal Postgres full-text search alongside. No per-account decrypted cache, no dimensional constraint, and any embedding model is available. *The alternative was benchmarked on 2026-08-26 before it was dropped: decrypting a 10,000-thing account took 21ms and a similarity query 1.4ms, so it was viable on compute, but the corpus could not be fetched per query (41MB at 1024-dim float32) and so it required a warm per-account cache plus embeddings truncatable to 256 or 512 dims. Those numbers are kept because they are what a reversal would need.*
- ✅ **Root key lives in the database through alpha and beta (2026-08-26).** No separate KMS provider and no extra vendor while the only content at risk is our own. Since the key now protects blobs rather than the database, the two sit in different providers, Neon and Cloudflare, so a compromise of either one alone is not sufficient. That is a genuine, if modest, separation, and it is more than the previous configuration had.
- ✅ **The key schema is migration-ready from the first migration.** Three separated things: the object, `account_keys` (one wrapped data key per account plus a `wrapped_by` column naming the root that wrapped it, for example `db:v1` and later `aws-kms:<arn>`), and the root behind a `RootKeyProvider` interface with one implementation per custody choice. Moving custody later is one rewrap job over `account_keys`, proportional to accounts, with no object ever re-encrypted or re-uploaded. *Without the `wrapped_by` column and the interface this stops being cheap, which is why both exist before there is any code.*
- ✅ **Per-account keys, not per-thread.** Sharing is per thread, so per-thread keys look like the matching granularity, but a thing can move between threads, which would mean re-keying an object on every move. Per-account keys plus a server-side authorization check on read avoid that entirely: a grantee reads a shared blob because the server checked the grant, not because they hold a key.
- ⚠️ **How the blob actually gets encrypted is the one open piece.** R2 supports SSE-C, a 32-byte customer key supplied per request that Cloudflare does not store and cannot recover. The tension is with pre-signed direct upload: with a pre-signed URL the client makes the request, so the client must send the SSE-C key header, which puts key material on devices. Three ways out, to settle in the encryption spec: put the key on the client and accept it, since it is that person's own data; route bytes through a Cloudflare Worker bound to R2 that holds the key, keeping it off clients without putting bytes through our API; or route bytes through the Core API, which is simplest and abandons the pre-signed benefit. *Leaning towards the Worker.* Whichever is chosen, losing the key means the objects are unrecoverable by anyone including Cloudflare, so key backup is an operational requirement, not a nicety.

- ✅ **Connected-app content is process-and-forget (OFF-4).** Inherited from superparent's SP-1, scoped down to connected apps only. Derive and discard, keep a source reference for on-demand re-fetch. *If batching ever forces a buffer, it inherits superparent's full control set: volatile store only, per-account key, hard TTL, no disk persistence, atomic purge after processing, size ceiling at ingest, privacy-policy disclosure.*
- ✅ **60-day conversation retention, hard purge.** The product states it in Settings, so it is a promise. Implement as a scheduled purge; partition-drop once the table is big enough to warrant partitions.
- ✅ **No content in Langfuse.** Metadata-only tracing: ids, model, tokens, latency, tool names, outcomes. This is what makes Langfuse Cloud acceptable rather than self-hosted.

## Agent and LLM

- ✅ **Structured outputs as a hard contract (OFF-5).** Inherited. Pydantic schema via `output_config.format`, one repair-and-revalidate retry on failure, then raise, and log every failure.
- ✅ **Task tiers, not per-call-site model choice.** `sort` = Claude Haiku 4.5 (`claude-haiku-4-5`), `converse` = Claude Sonnet 5 (`claude-sonnet-5`), `reason` = Claude Opus 5 (`claude-opus-5`). Every dump hits `sort`, so `sort` stays a plain structured call with no thinking and it is the tier to optimise.
- ✅ **Adaptive thinking plus effort on the two upper tiers.** `thinking: {type: "adaptive"}` with `output_config.effort` as the depth control. `budget_tokens` is removed on these models and returns a 400: do not carry that pattern in from older code.
- ✅ **Thin harness over the Anthropic SDK, no LangChain.** Inherited. Prompts as code in git, mirrored to Langfuse for inspection, eval-gated in CI.
- ✅ **Prompt-injection boundary (SEC-1).** Dumped content and connected-app content are untrusted data. They travel in user-turn content blocks and never in a system prompt. The system prompt states the rule.
- ✅ **Per-account token ledger in Postgres**, categorised by job, with a soft alert and a hard reject before the call. This is exactly what the admin panel's Costs and Limits pages read, including its rule that a cap can slow down, drop to the cheaper tier, or stop, and that dumps are always still saved.
- ✅ **Prompt caching on the frozen system prompt and stable per-account context**, verified with `usage.cache_read_input_tokens`. Batch API for anything off the request path.
- 🔶 **Retrieval on pgvector**, roughly 400-token chunks with breadcrumb prefixes, HNSW index. Embedding provider is open and gated on the encrypted-search question above. *Gotcha, inherited: store raw chunks separately from vectors so a provider or model change is a re-embed, not a data loss.*
- ✅ **Reversible by default, confirmed when outward facing (OFF-6).** Changed from superparent's propose-don't-execute. offload acts and offers Undo. The reversible allowlist starts as: create, update, soft-delete a thing; create or rename a thread; move a thing between threads; write or forget a memory. Everything else is outward facing until listed here, which explicitly includes sharing a thread with a person, since that is a message to someone.

## Multimodal

- ✅ **Images to Claude as image blocks**, no separate OCR step.
- 🔶 **Voice notes to a hosted transcription API**, Deepgram Nova as the working choice on latency, price and accent handling. *Rejected: on-device transcription, which is free and private but noticeably worse with accents and noise and has no web equivalent. Revisit if audio egress becomes a stated user concern.*
- ✅ **Audio blob and transcript are both retained.** The waveform is part of the product and the transcript is what makes it findable.
- 🔶 **Server-side link unfurl** for title, description and canonical URL. No headless browser until something needs one.

## Auth and identity

- ✅ **Better Auth, self-hosted**, sessions in our Postgres. Changed from superparent's Auth0. offload has two social providers and an invite gate we own anyway, so a hosted identity platform is machinery and per-user cost we do not need. *Accepted cost: more of our own code to get right, and no hosted admin console. The admin panel we are building covers the part we care about.*
- ✅ **Apple and Google only.** No password, no email OTP. Order flips by platform, per the design: Apple leads on iOS, Google on Android, Apple first on web.
- ✅ **Invite only, waitlist is the gate.** A valid provider login for an un-promoted identity gets the no-invite screen. Never auto-provision. Waitlist and auth endpoints are enumeration-safe: uniform response and timing whether or not the account exists.
- ✅ **One account, many provider identities**, linked on verified email, so Apple and Google reach the same account. Inherited from superparent, and the same limitation applies: Apple Hide My Email relay addresses cannot be matched and those logins will not link. Document it in the product.
- ✅ **Account lifecycle `waitlist → invited → active → disabled`.** Promotion creates the account before first login so authorization always has a scope. `invited → active` flips when the authenticated person finishes first run, never on an admin action alone. `disabled` blocks new sessions and kills live ones.
- ✅ **Admin is a seeded verified-email allowlist**, app-layer, with two roles: support gets waitlist and people, owner also gets costs, limits and staff. Always at least one owner, and nobody can edit themselves out. Inherited from superparent and matched to the design system's admin spec.
- ✅ **Connected-app OAuth tokens live in a separate vault from login**, encrypted at rest, read only by the service that needs them. Inherited.

## Infrastructure

- ✅ **Railway for compute**, four services in one project. Changed from superparent's GCP plus Pulumi, which is the right answer at 10k DAU and the wrong one at ten. Everything is a plain container, so leaving is a deploy-pipeline rebuild and nothing else.
- ✅ **Neon for Postgres.** The per-PR database branch is the specific reason: an ephemeral database per pull request makes migrations reviewable and costs nothing.
- ✅ **Cloudflare R2 for blobs**, pre-signed upload and download so bytes never transit the API. Zero egress fees, which matters when the content is images.
- ✅ **Upstash for Redis and the queue.** No separate broker until something needs one.
- ✅ **Environments: `main` is production, plus one on-demand staging.** Changed from superparent's dev/staging/prod. `staging.offload.club` is a permanent hostname on a service that sleeps when idle and wakes on request, so mobile builds always have a stable URL without an always-on second stack. Pull requests get a Neon branch and run against staging.
- ✅ **No IaC at first, on purpose (DEV-3).** Railway config per service in `railway.json`, the rest documented in `docs/local-dev.md`. Revisit when the resource set stops changing weekly. *This is a decision to re-examine, not a permanent stance.*

## Design adherence and tooling

- ✅ **The design system's adherence config runs under ESLint, not oxlint, and is read at run time.** `.claude/skills/offload-design/_adherence.oxlintrc.json` is the machine-readable version of the token rules and its handoff asks for it to be wired into the lint step. It is wired into `eslint.config.mjs` at the repo root, which `require`s the generated file and maps its two rules rather than copying anything out of it, so regenerating it on a design sync propagates with no edit and the generated file is never hand-edited.
- ⚠️ **Two things about that file are worth reporting back to the design system**, and neither is fixable on our side because the file is generated. First, despite the filename it does not run under oxlint: oxlint 1.80 rejects the non-schema `x-omelette` key outright, and it does not implement `no-restricted-syntax`, which is the rule carrying every token check and every component prop contract. ESLint core implements both, so nothing is lost, but the filename is misleading. Second, the rule messages inside it contain em dashes, which the design system's own non-negotiables forbid.
- ✅ **Wired before the first component, on purpose.** Retyped hex values are the one failure mode that is annoying to unwind after the fact, so the config is live in an otherwise empty repo. Verified against a probe file: restricted imports, raw hex, raw px and the component prop contracts all fire, and a clean file passes.
- ✅ **The generated token module is the one exemption.** `packages/tokens/generated/**` is ignored by the hex and px rules, because it is the file that holds those values so nothing else has to.
- ✅ **The full ESLint pass runs at the pre-commit gate, not after every edit.** `design-guard.sh` covers the fast checks on the file just written. `PROJECT_LINT_CMD` is left unset so the post-edit hook stays quiet, and can be exported to turn it on for a session.

## Analytics

- ✅ **Event envelope now, warehouse later.** Inherited. Object-verb names (`thing_dumped`, `thing_sorted`, `thread_shared`), a flat typed envelope with `event_id`, `event_name`, `event_version`, `timestamp`, `anonymous_id`, nullable `account_id`, `source`, `platform`, and typed `properties`.
- ✅ **No content in properties, ever (OFF-1).** Structured references only: `thread_id`, `thing_id`, `thing_kind`. Never a title, never a transcript, never a URL a person dumped. Enforced by a JSON Schema check plus a deny-list scan in CI.
- 🔶 **Versioned JSON Schema files in `schemas/events/`, validated in CI.** No registry until there are more than about ten event types or a second consumer. *Gotcha, inherited: no catch-all `metadata` blob, it becomes unqueryable the moment a warehouse exists.*

## Billing

- ✅ **Not now, and not blocked.** No payment provider and no plans table. The account carries a tier field and the token ledger exists from day one, so the admin panel's caps work and adding a provider later is additive. The Settings "Current plan" row shows the beta tier.

## Deferred hardening, to revisit before GA

Shortcuts taken deliberately for alpha and beta. Each says why it is affordable now and what changes later. None may ship to a general audience without a decision, and OFF-2 forbids describing the product as though they were already resolved.

1. **Move the root key out of the database.** Target: a managed KMS, AWS or GCP. Effort: one rewrap job over `account_keys`, proportional to accounts, no object touched. Affordable now because the only content at risk is ours, and because the key and the objects it protects already live with different providers.
2. **Revisit whether database content should be encrypted at all.** Currently a deliberate no. If offload ever holds enough of enough people's private lives that a Neon compromise is a serious event, the earlier benchmark and the warm-cache design are the starting point. This is a review item rather than a blocker: shipping unencrypted database content is a normal choice, shipping it while claiming otherwise is not.
3. **Audit every privacy claim against OFF-2.** Product copy, marketing, the privacy policy, and the Settings pages that talk about data. Whatever is true then is what the copy says. This is the item that keeps the other two visible.

## Open, needing a call before the thing they touch is built

1. ⚠️ The data model itself. Before any migration. Its own spec.
2. ⚠️ How a blob gets encrypted on the way into R2: key on the client, a Cloudflare Worker holding it, or bytes through the Core API. Before the first upload path. See the encryption entries above.
3. ⚠️ Embedding provider. No longer gated on the encryption scheme, since vectors are plaintext and any model works. Now an ordinary quality, cost and content-egress choice.
