# 002 Getting in, tasks

Ordered so each phase is verifiable before the next begins. Phases A to D are web and API only, which is the fastest loop; mobile lands in E once the server is proven.

**Blocked on you** is marked 🔴. Everything else I do.

## Phase A, foundation

- [ ] **A1** 🔴 Infrastructure prerequisites: Railway login, domain, Google OAuth, Apple Sign in, Resend. Batched into one list rather than asked for one at a time.
- [ ] **A2** Monorepo skeleton: pnpm workspaces, Turborepo, shared tsconfig, ESLint already wired. `apps/web`, `apps/core-api`, `packages/api`, `packages/tokens`, `schemas/events`.
- [ ] **A3** `packages/tokens`: generate design tokens as JSON from `.claude/skills/offload-design/tokens/`, plus a Tailwind theme built from it. *Generated, never hand-copied, so a design sync propagates (OFF-7).*
- [ ] **A4** Core API skeleton: Fastify, `zod` and `fastify-type-provider-zod`, `/healthz`, structured logging that carries ids and outcomes only (OFF-1).
- [ ] **A5** Migration runner and the spec 001 subset: `accounts`, `account_identities`, `staff`, `threads`, `thread_members`, `account_keys`, `thread_keys`, `jobs`, `analytics_events`. Kysely codegen so types come from the schema.
- [ ] **A6** `seed` script producing realistic shape and volume, since there is no database branching and this is what stands in for it.
- [ ] **A7** Railway project: Postgres from a **pgvector-enabled template**, PITR on from day one, services in one region on private networking. Automated via the Railway CLI where it allows.
- [ ] **A8** GitHub Actions: lint, typecheck, test, and migrations against an ephemeral Postgres seeded by A6.

## Phase B, the waitlist

- [ ] **B1** `POST /v1/waitlist`: honeypot, per-IP and per-email rate limiting, enumeration-safe in body, status and timing.
- [ ] **B2** `jobs` runner in the Core API with `FOR UPDATE SKIP LOCKED`, visibility timeout, attempts with backoff, dead state.
- [ ] **B3** `Mailer` interface, Resend implementation, and the design's 600px template with four slots plus a plain-text alternative.
- [ ] **B4** `email.waitlist_joined` job.
- [ ] **B5** Landing page in `(marketing)`: one field, success line in place, `Sign in` top right, responsive to 375.
- [ ] **B6** `waitlist_joined` event, and the `schemas/events` entry plus its CI validation.

## Phase C, the admin panel

- [ ] **C1** `staff` table seeded by `seed:admins` from `ADMIN_EMAILS`, which is then discarded. No runtime env check on the request path.
- [ ] **C2** Admin authorization middleware: staff if and only if the token's **verified** email has a row. Support and owner resolve to different page sets.
- [ ] **C3** `(admin)` route group: moss navigation, the `admin` tag by the wordmark, its own layout.
- [ ] **C4** Waitlist page: waiting, invited-not-signed-in, cursor-paginated, select one or many.
- [ ] **C5** `POST /v1/admin/waitlist/:id/invite` and the batch variant. One transaction: state, `account_keys`, Miscellaneous thread, `thread_members`, `thread_keys`, enqueue email, emit `invite_sent`. Idempotent.
- [ ] **C6** `email.invited` job.

## Phase D, auth on web

- [ ] **D1** Better Auth with Google and Apple, sessions in Postgres, httpOnly cookie on web.
- [ ] **D2** The invite gate as specified: identity lookup, then verified-email link, then refuse. Never auto-provision.
- [ ] **D3** Identity linking, and the Apple relay-address limitation surfaced to the person by name.
- [ ] **D4** Session refresh checks `accounts.state`, so disabling stops live sessions.
- [ ] **D5** Sign-in screen, Apple first on web, with the refusal as one line above the buttons.
- [ ] **D6** No-invite screen: names the address it checked, joins the waitlist in one tap reusing it, "Use a different account" as the quiet secondary.
- [ ] **D7** First run, three screens, server-side completion flipping `invited` to `active`.
- [ ] **D8** Today's day-one empty state, in the serif voice, with the composer present but inert.
- [ ] **D9** `first_sign_in` and `onboarding_completed` events.

## Phase E, mobile

- [ ] **E1** Expo app with a custom dev build, Expo Router, NativeWind driven by `packages/tokens`.
- [ ] **E2** 🔴 EAS project and credentials, which needs your Apple and Google accounts.
- [ ] **E3** Native Apple and Google sign-in, session in `expo-secure-store`, provider order per platform.
- [ ] **E4** Gate, no-invite, first run and Today empty on both phones, with Material 3 chrome on Android.
- [ ] **E5** `email.download_app` job, sent from the invite email's footer link rather than automatically.

## Phase F, closing

- [ ] **F1** Tests for every acceptance criterion, named by AC.
- [ ] **F2** `/review` over the whole diff, then fix what it finds.
- [ ] **F3** `docs/local-dev.md` filled in for real: the one command, ports, environment variables, the seed.
- [ ] **F4** Deploy to Railway, `staging.offload.club` awake on request, and a smoke test of the full path.

## Tests, by acceptance criterion

- [ ] **T-AC1** Waitlist join is enumeration-safe: identical body, status and indistinguishable timing for new, waiting and existing addresses.
- [ ] **T-AC2** Promotion is one transaction. Forcing a failure at each step leaves no half-promoted account.
- [ ] **T-AC3** A non-staff account gets 403 on every admin route. Support gets 404, not 403, on owner-only pages.
- [ ] **T-AC5** A valid provider login for an uninvited identity provisions nothing and returns the no-invite state.
- [ ] **T-AC6** Apple then Google with the same verified email is one account. An unverified email never links.
- [ ] **T-AC7** First run completes once per person; a second device resumes rather than restarts.
- [ ] **T-AC9** Disabling an account stops an existing session at its next refresh, not at token expiry.
- [ ] **T-AC10** Every emitted event validates against its schema and contains no email address and no real account id.
- [ ] **T-AC11** Every email has a plain-text alternative and no image references.
