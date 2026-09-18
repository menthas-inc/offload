# Tech stack

> Grounds implementation and tech specs. Keep current.
> Posture: a real consumer product, starting as an invite-only beta. Design for hundreds now and thousands within a year, and do not paint ourselves into a corner. Nothing here is built for 100k DAU on day one.

## Surfaces

The design system at `.claude/skills/offload-design/` specifies five, all at high fidelity:

| Surface | Kit | Client |
| --- | --- | --- |
| iOS app | `ui_kits/mobile_app/` | Expo (React Native) |
| Android app, Material 3 | `ui_kits/android_app/` | Expo (React Native) |
| Web app | `ui_kits/web_app/` | Next.js |
| Admin panel | `ui_kits/admin_web/` | Next.js, same app, own route group |
| Marketing site and invite email | `ui_kits/marketing_site/` | Next.js, same app, own route group |

## Client

- **Mobile: Expo (React Native).** One codebase for both phones, with platform splits exactly where the two kits diverge: navigation motion (iOS push 350ms on `cubic-bezier(.32,.72,0,1)`, Android shared axis X 300ms on emphasized decelerate), and Material 3 component chrome. Use `.ios.tsx` / `.android.tsx` files for a genuinely different component and `Platform.select` for a differing constant. EAS for build and submit. A custom dev build from day one, so no Expo Go.
- **Native escape hatch, kept open deliberately.** We may rewrite one client natively later (SwiftUI is the likely one; Android is likely to stay on Expo). Three rules keep that cheap and they are not optional: the API contract is platform-agnostic and fully described by OpenAPI; business logic lives behind the API or in plain TypeScript modules with no React imports; design tokens ship as data (JSON generated from `tokens/`), never as React Native `StyleSheet` objects.
- **Web: Next.js (App Router).** One app, three route groups: `(marketing)`, `(app)`, `(admin)`. They share tokens, primitives and the generated API client; the admin group is a separate layout with the moss navigation.
- **Styling:** NativeWind on mobile, Tailwind on web, both driven by one generated token theme. Share **design tokens and TypeScript types only**, never components. The two platforms draw the same thing; they do not draw it the same way.
- **Data and state:** TanStack Query v5 for server state, online-first with optimistic mutations. Zustand for ephemeral UI state only, and the boundary stays strict.
- **Dumping never fails.** A dump goes into a durable local outbox (SQLite on mobile via `expo-sqlite`, IndexedDB on web) and syncs when there is signal, showing as pending until it lands. This is the one offline guarantee we make. Reads still need a connection.
- **Navigation:** Expo Router on mobile, App Router on web.
- **Push:** Expo Push, routing to APNs and FCM from one server call.

## Backend, two planes

- **Core API: TypeScript on Fastify.** User-facing data, threads, content, memories, people and thread membership, auth sessions, the blob path, the outbox drain. Owns the canonical schema and the migrations. Stateless. Chosen over NestJS deliberately: less ceremony for one developer plus agents, and everything we actually wanted from Nest (dependency injection boundaries, validated DTOs, OpenAPI generation) is available on Fastify with `zod` and `fastify-type-provider-zod`.
- **Agent plane: Python on FastAPI.** The only thing that talks to Claude. Owns prompts, the harness, structured output schemas, retrieval over pgvector, transcription, and the ingestion jobs for connected apps. Scales and fails independently of the request path.
- **The split earns its keep** for the same reason it did in superparent: the slow, expensive, bursty plane should not share a process with the one serving list views, and the Python ecosystem is where embeddings, audio and eval tooling live. If it stops earning it, collapsing into the Core API is a smaller job than splitting later.

## Datastores

- **Primary: Postgres on Railway**, with **pgvector** for retrieval over content and memories, plus ordinary Postgres full-text search. pgvector is an extension rather than a service, so embeddings sit in the same table as the row they describe and one query does ownership filter, grant scope and similarity together. *Provision from a pgvector-enabled template: the extension binary must already be on the server.* In the same project and region as the services, reached over private networking. PITR enabled from day one, and a nightly logical dump to R2 so a restorable copy exists with a different company. Database content is not encrypted by us, so retrieval is ordinary: HNSW index and any embedding model, bounded only by pgvector's indexable dimension ceiling of 2,000 as `vector` and 4,000 as `halfvec`. See OFF-2 for what that does and does not claim. *Neon is the named destination if migration behaviour on real data starts to matter more than one-vendor convenience; the trigger and the portability rules are in `decisions.md`.*
- **Blobs: Cloudflare R2.** Photos, screenshots, voice notes, each encrypted with its own object key under the thread and account keys (OFF-2). Bytes go through the Core API, which encrypts with AES-GCM and streams ciphertext to R2, so R2 never receives a key and no client ever holds one. No SSE-C. *This pays Railway egress at $0.05/GB, about a dollar a month at alpha; the trigger for moving to direct-to-R2, and the `encryption_scheme` column that makes it painless, are in `decisions.md`.*
- **Queue: a Postgres table**, drained with `SELECT ... FOR UPDATE SKIP LOCKED`. Hand-rolled, because the producer is TypeScript and the consumer is Python and it must need no extension. Enqueueing a sort job is in the same transaction as inserting the content row, which is the point. No Redis: sessions are in Postgres via Better Auth, rate limits go in Postgres, and there is no caching problem yet. *Railway Redis is the destination if throughput, pub/sub or a real cache ever justify it. See `decisions.md`.*
- **Schema posture:** UUIDv7 primary keys (time-ordered, non-enumerable). Every content-bearing row carries `account_id`. Hot append tables (`messages`, `job_runs`, `analytics_events`) get monthly range partitions once they are large enough to care, not before.
- **Warehouse:** deferred. Emit events against a versioned schema from day one; build the warehouse when there is something to ask of it.

## LLM

- **Provider:** Claude, through the Anthropic Python SDK (`AsyncAnthropic`).
- **Routing by task tier, not by call site.** The harness takes a tier and maps it to a model:

  | Tier | Model | ID | Cost per 1M in / out | Used for |
  | --- | --- | --- | --- | --- |
  | `sort` | Claude Haiku 4.5 | `claude-haiku-4-5` | $1 / $5 | Filing a dump into a thread, tagging, extracting a date, deciding whether something needs you |
  | `converse` | Claude Sonnet 5 | `claude-sonnet-5` | $2 / $10 | The composer conversation, thread standing blurbs, memory writes |
  | `reason` | Claude Opus 5 | `claude-opus-5` | $5 / $25 | Hard retrieval and cross-thread reasoning, anything the cheaper tiers failed at. Measured for the filing turn on 2026-09-17 (255 of 274 eval cases to Sonnet's 242, and it asks back where Sonnet does not) and not adopted, on cost |

  Every dump hits `sort`, which is why `sort` is the cheapest tier and why it must stay a plain structured call.
- **Thinking and effort:** adaptive thinking (`thinking: {type: "adaptive"}`) on `converse` and `reason`, with `output_config.effort` as the depth control. `budget_tokens` does not exist on these models and returns a 400. `sort` is a plain structured call with no thinking.
- **Structured outputs are the contract.** Pydantic schemas via `output_config.format`. No free-text parsing at a boundary (OFF-5).
- **Harness:** thin orchestration over the SDK, no LangChain. Prompts as code, versioned in git, eval-gated in CI.
- **Cost levers:** prompt caching on the frozen system prompt and stable per-account context, verified with `usage.cache_read_input_tokens`. Batch API (50% off) for anything not on the request path. A per-account token ledger in Postgres, which is exactly what the admin panel's Costs and Limits pages read.
- **Embeddings:** Voyage 4, stored as `halfvec(1024)`. Chosen on quality rather than cost, which is negligible at our volume, and it ships a reranker for when retrieval precision matters. *Dense embeddings do not handle negation, which is structural and not a vendor choice; the mitigations we already have and the rule that follows are in `decisions.md`.*
- **LLMOps:** Langfuse Cloud. Metadata only by rule: ids, model, tokens, latency, tool names, outcomes. No prompt content, no completions, no tool inputs (OFF-1).

## Multimodal

- **Images:** screenshots and photos go to Claude as image blocks. No separate OCR step.
- **Audio:** voice notes go to **AssemblyAI** for transcription. Both the audio blob and the transcript are kept: the waveform is part of the product and the transcript is what makes it findable. *Requires a no-training term and short provider-side retention, and it is the one place a second company receives a person's voice. Self-hosting Whisper is the named alternative and gets cheaper as we grow; see `decisions.md`.*
- **Links:** server-side unfurl for title, description and canonical URL. No headless browser until something needs one.

## Auth

- **Better Auth, self-hosted**, sessions in our own Postgres. Apple and Google social providers only, matching the design: no password, no email OTP, no account type to choose.
- **Invite only.** A valid provider login for an account that is not promoted from the waitlist gets the no-invite screen, never an auto-provisioned account.
- **Identity follows the person, not the provider.** One account links many provider identities, matched on verified email, so Apple and Google reach the same account. Apple Hide My Email relay addresses cannot be matched this way: a known and documented limitation.
- **Mobile:** native Apple and Google sign-in, tokens in `expo-secure-store`.
- **Web:** httpOnly cookie session, never a token in JavaScript.
- **Connected-app OAuth tokens are a separate vault** from login, encrypted at rest, read only by the service account that needs them.

## Cloud and infra

- **Compute: Railway.** Core API, agent plane, worker and the Next.js app as separate services in one project. Chosen for the deploy experience at this size; every service is a plain container, so leaving is a rebuild of the deploy pipeline and nothing else.
- **Postgres: Railway. Blobs: Cloudflare R2.** Two datastores, two vendors, and no third. Both provider-portable: Postgres is Postgres, R2 speaks S3. Portability is a rule, not a hope: plain `DATABASE_URL`, no provider-specific database feature in the data path.
- **Encryption:** cold storage only (OFF-2). Blobs in R2 are encrypted with a key R2 does not hold; database content is plaintext. Four key layers, root to account to thread to object, so sharing rewraps one key, account deletion leaves shared threads intact, and moving a thing between threads rewraps 60 bytes. Through alpha and beta the root key lives in the database, a deliberate shortcut recorded in `decisions.md` with a GA item against it. Because the keys protect blobs rather than the database, the keys and the objects live with different providers. The layers are separated from the first migration, so changing root custody is one rewrap over `account_keys`.
- **Environments:** `main` is production. `staging.offload.club` is a permanent hostname on a service that sleeps when idle and wakes on request, so mobile builds always have a stable URL to point at without paying for an always-on second stack. Pull requests run against an ephemeral Postgres container in CI, seeded to realistic shape and volume.
- **IaC:** none at first, on purpose. Railway configuration lives in `railway.json` per service and the rest is documented in `docs/local-dev.md`. Revisit when the resource set stops changing weekly.

## Repo and tooling

- **Monorepo.** TypeScript via pnpm workspaces plus Turborepo; Python via uv. Path-filtered CI per component.
- **Database access:** Kysely (typed query builder) plus hand-written SQL migrations in the Core API. No heavy ORM: the model is unstructured-first, with JSONB promoted to columns by backfill-heavy migrations, which is where a declarative-diff ORM stops helping. Python reads through SQLAlchemy 2.0 async and writes derived artifacts through a Core API internal endpoint, so there is one writer.
- **Test runners:** Vitest (TypeScript), pytest (Python). <!-- referenced by the pre-commit gate -->
- **Lint and format:** ESLint plus Prettier (TypeScript), Ruff (Python). The design system's `_adherence.oxlintrc.json` is wired into the ESLint flat config at the repo root, read at run time rather than copied, so a design sync propagates with no edit. It enforces the token and component-prop rules. See the entry in `decisions.md`. <!-- referenced by the lint-warn hook -->
- **Type checking:** `tsc` and pyright.
- **CI:** GitHub Actions, path-filtered per component.
