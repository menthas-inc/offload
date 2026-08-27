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

- **Core API: TypeScript on Fastify.** User-facing data, threads, things, memories, connections and grants, auth sessions, blob upload and download, the outbox drain. Owns the canonical schema and the migrations. Stateless. Chosen over NestJS deliberately: less ceremony for one developer plus agents, and everything we actually wanted from Nest (dependency injection boundaries, validated DTOs, OpenAPI generation) is available on Fastify with `zod` and `fastify-type-provider-zod`.
- **Agent plane: Python on FastAPI.** The only thing that talks to Claude. Owns prompts, the harness, structured output schemas, retrieval over pgvector, transcription, and the ingestion jobs for connected apps. Scales and fails independently of the request path.
- **The split earns its keep** for the same reason it did in superparent: the slow, expensive, bursty plane should not share a process with the one serving list views, and the Python ecosystem is where embeddings, audio and eval tooling live. If it stops earning it, collapsing into the Core API is a smaller job than splitting later.

## Datastores

- **Primary: Postgres on Neon**, with **pgvector** for retrieval over things and memories, plus ordinary Postgres full-text search. Database content is not encrypted by us, so retrieval is ordinary: HNSW index, no dimensional constraint, any embedding model. See OFF-2 for what that does and does not claim. Branching per pull request is the reason for Neon specifically: an ephemeral database per PR costs nothing and makes migrations reviewable.
- **Blobs: Cloudflare R2.** Photos, screenshots, voice notes, encrypted per account (OFF-2). Zero egress fees, which matters for an app whose content is images. *The upload path is not settled: pre-signed direct upload and server-held keys are in tension, because R2's SSE-C requires whoever makes the request to send the key. Options and a leaning are in `decisions.md`.*
- **Cache and queue: Upstash Redis.** Session cache, rate limits, and the job queue. No separate broker until there is a reason for one.
- **Schema posture:** UUIDv7 primary keys (time-ordered, non-enumerable). Every content-bearing row carries `account_id`. Hot append tables (`messages`, `job_runs`, `analytics_events`) get monthly range partitions once they are large enough to care, not before.
- **Warehouse:** deferred. Emit events against a versioned schema from day one; build the warehouse when there is something to ask of it.

## LLM

- **Provider:** Claude, through the Anthropic Python SDK (`AsyncAnthropic`).
- **Routing by task tier, not by call site.** The harness takes a tier and maps it to a model:

  | Tier | Model | ID | Cost per 1M in / out | Used for |
  | --- | --- | --- | --- | --- |
  | `sort` | Claude Haiku 4.5 | `claude-haiku-4-5` | $1 / $5 | Filing a dump into a thread, tagging, extracting a date, deciding whether something needs you |
  | `converse` | Claude Sonnet 5 | `claude-sonnet-5` | $3 / $15 | The composer conversation, thread standing blurbs, memory writes |
  | `reason` | Claude Opus 5 | `claude-opus-5` | $5 / $25 | Hard retrieval and cross-thread reasoning, anything the cheaper tiers failed at |

  Every dump hits `sort`, which is why `sort` is the cheapest tier and why it must stay a plain structured call.
- **Thinking and effort:** adaptive thinking (`thinking: {type: "adaptive"}`) on `converse` and `reason`, with `output_config.effort` as the depth control. `budget_tokens` does not exist on these models and returns a 400. `sort` is a plain structured call with no thinking.
- **Structured outputs are the contract.** Pydantic schemas via `output_config.format`. No free-text parsing at a boundary (OFF-5).
- **Harness:** thin orchestration over the SDK, no LangChain. Prompts as code, versioned in git, eval-gated in CI.
- **Cost levers:** prompt caching on the frozen system prompt and stable per-account context, verified with `usage.cache_read_input_tokens`. Batch API (50% off) for anything not on the request path. A per-account token ledger in Postgres, which is exactly what the admin panel's Costs and Limits pages read.
- **LLMOps:** Langfuse Cloud. Metadata only by rule: ids, model, tokens, latency, tool names, outcomes. No prompt content, no completions, no tool inputs (OFF-1).

## Multimodal

- **Images:** screenshots and photos go to Claude as image blocks. No separate OCR step.
- **Audio:** voice notes go to a hosted transcription API (Deepgram Nova as the working choice, on latency, price and accent handling). Only the transcript is retained alongside the audio blob.
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
- **Postgres: Neon. Blobs: Cloudflare R2. Redis and queue: Upstash.** All three are provider-portable: Postgres is Postgres, R2 speaks S3, Upstash speaks Redis.
- **Encryption:** cold storage only (OFF-2). Blobs in R2 are encrypted with a per-account data key that R2 does not hold; database content is plaintext. Through alpha and beta the root key that wraps the account keys lives in the database, a deliberate shortcut recorded in `decisions.md` with a GA item against it. Because the key protects blobs rather than the database, the key and the objects live with different providers. The schema separates object, wrapped key and root key from the first migration, so changing custody is one rewrap job.
- **Environments:** `main` is production. `staging.offload.club` is a permanent hostname on a service that sleeps when idle and wakes on request, so mobile builds always have a stable URL to point at without paying for an always-on second stack. Pull requests get a Neon database branch and run against staging.
- **IaC:** none at first, on purpose. Railway configuration lives in `railway.json` per service and the rest is documented in `docs/local-dev.md`. Revisit when the resource set stops changing weekly.

## Repo and tooling

- **Monorepo.** TypeScript via pnpm workspaces plus Turborepo; Python via uv. Path-filtered CI per component.
- **Database access:** Kysely (typed query builder) plus hand-written SQL migrations in the Core API. No heavy ORM: the model is unstructured-first, with JSONB promoted to columns by backfill-heavy migrations, which is where a declarative-diff ORM stops helping. Python reads through SQLAlchemy 2.0 async and writes derived artifacts through a Core API internal endpoint, so there is one writer.
- **Test runners:** Vitest (TypeScript), pytest (Python). <!-- referenced by the pre-commit gate -->
- **Lint and format:** ESLint plus Prettier (TypeScript), Ruff (Python). The design system's `_adherence.oxlintrc.json` is wired into the ESLint flat config at the repo root, read at run time rather than copied, so a design sync propagates with no edit. It enforces the token and component-prop rules. See the entry in `decisions.md`. <!-- referenced by the lint-warn hook -->
- **Type checking:** `tsc` and pyright.
- **CI:** GitHub Actions, path-filtered per component.
