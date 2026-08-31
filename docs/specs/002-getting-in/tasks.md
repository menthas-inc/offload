# 002 Getting in, tasks

Ordered so each phase is verifiable before the next begins. Phases A to D are web and API only, which is the fastest loop; mobile lands in E once the server is proven.

**Blocked on you** is marked 🔴. Everything else I do.

## Phase A, foundation

- [x] **A0** ✅ **Domain settled: `offload.club`** (2026-08-31). Host plan, used by everything below:

  | Host | What |
  | --- | --- |
  | `offload.club` | Web: marketing, app, admin |
  | `api.offload.club` | Core API, which is where Better Auth mounts |
  | `staging.offload.club`, `api.staging.offload.club` | Staging, asleep until woken |
  | `localhost:4700`, `localhost:4701` | Web and API in development, from offload's reserved 4700 to 4719 block |
- [ ] **A1** 🔴 Infrastructure prerequisites: Railway login, Google OAuth, Resend. Batched into one list rather than asked one at a time.
- [ ] **A1b** 🔴 **Apple credentials, started now and not in Phase E.** Developer Program enrolment, an App ID, a Services ID, and a Sign in with Apple key giving a `.p8`, a Team ID and a Key ID. *Enrolment alone can take days, so this is pure lead time and nothing about it is sequenced after the code. Started in parallel with A1; if it is not ready when Phase D arrives, ship Google-only and add Apple behind it.*
- [x] **A2** Monorepo skeleton: pnpm workspaces, Turborepo, shared tsconfig, ESLint already wired. `apps/web`, `apps/core-api`, `packages/api`, `packages/tokens`, `schemas/events`.
- [x] **A3** `packages/tokens`: generate design tokens as JSON from `.claude/skills/offload-design/tokens/`, plus a Tailwind theme built from it. *Generated, never hand-copied, so a design sync propagates (OFF-7).*
- [x] **A4** Core API skeleton: Fastify, `zod` and `fastify-type-provider-zod`, `/healthz`, structured logging that carries ids and outcomes only (OFF-1).
- [x] **A5** Migration runner and the spec 001 subset: `accounts` (with `UNIQUE (lower(email)) WHERE deleted_at IS NULL` and `waitlist_email_sent_at`), `account_identities`, `staff`, `threads`, `thread_members`, `account_keys`, `thread_keys`, `jobs`, `analytics_events`. Kysely codegen so types come from the schema.
- [x] **A6** `seed` script producing realistic shape and volume, since there is no database branching and this is what stands in for it.
- [~] **A7** Railway project `offload` up. Postgres added with **pgvector 0.8.6 verified present**, so there is no trade against the managed backup story. `core-api` deployed and serving, reaching Postgres over the private network. Migrations run on boot under an advisory lock. Remaining, both needing the dashboard: **PITR on the Postgres service**, and `DATABASE_URL` switched from a literal to a `${{Postgres.DATABASE_URL}}` reference.
- [ ] **A8** GitHub Actions: lint, typecheck, test, and migrations against an ephemeral Postgres seeded by A6.

## Phase B, the waitlist

- [ ] **B1** `POST /v1/waitlist`: honeypot, per-IP and per-email rate limiting, one upsert in every branch, a fixed minimum response duration, and trim-and-lowercase normalisation on every boundary.
- [ ] **B2** `jobs` runner in the Core API with `FOR UPDATE SKIP LOCKED`, visibility timeout, attempts with backoff, dead state.
- [ ] **B3** `Mailer` interface, Resend implementation, and the design's 600px template with four slots plus a plain-text alternative. From `offload@offload.club`.
- [ ] **B4** `email.waitlist_joined` job, gated on `waitlist_email_sent_at` so it sends once per account ever, and scrubbing the recipient from `jobs.last_error`.
- [ ] **B5** Landing page in `(marketing)`: one field, success line in place, `Sign in` top right, responsive to 375.
- [ ] **B6** `waitlist_joined` event, and the `schemas/events` entry plus its CI validation.

## Phase C, the admin panel

- [ ] **C1** `staff` seeded by `seed:admins` from `ADMIN_EMAILS`, which is then discarded. No runtime env check on the request path. **The seed runs the same promotion transaction as C5** for an email with no account yet, so the first owner is assembled exactly like every other account rather than by a second code path.
- [ ] **C2** Admin authorization middleware: `staff.account_id = session.account_id`, using the account the session already resolved rather than re-deriving one from an email claim. Support and owner resolve to different page sets.
- [ ] **C3** `(admin)` route group: moss navigation, the `admin` tag by the wordmark, its own layout.
- [ ] **C4** Waitlist page: waiting, invited-not-signed-in, cursor-paginated, select one or many.
- [ ] **C5** `POST /v1/admin/waitlist/:id/invite` and the batch variant. One transaction: state, `account_keys`, Miscellaneous thread, `thread_members`, `thread_keys`, enqueue email, emit `invite_sent`. Idempotent.
- [ ] **C6** `email.invited` job.

## Phase D, auth on web

- [ ] **D1** Better Auth **remapped onto `accounts` and `account_identities`**, with its own `accountLinking` **disabled**. Sessions in Postgres; cookie `Domain=.offload.club`, `HttpOnly`, `Secure`, `SameSite=Lax`; CORS on the API allowing only the web origin with credentials; 15-minute access TTL.
- [ ] **D2** The invite gate in **two layers**: a `user.create.before` hook returning false, and no session issued for an account that is not invited or active. *Better Auth has open issues about before-hooks not firing on every path, and this is the product's entire access control, so it does not get to be the only thing standing there. Verify the hook fires on both the Google and the Apple callback.*
- [ ] **D3** Identity linking, entirely in our code. The Apple relay-address limitation surfaced by name. Linking onto a `staff` account notifies existing identities and needs a second admin's approval.
- [ ] **D4** Session refresh checks `accounts.state`, so disabling stops live sessions.
- [ ] **D5** Sign-in screen, Apple first on web, with the refusal as one line above the buttons.
- [ ] **D6** No-invite screen: names the address it checked, joins the waitlist in one tap reusing it, "Use a different account" as the quiet secondary.
- [ ] **D7** First run, three screens, server-side completion flipping `invited` to `active`.
- [ ] **D8** Today's day-one empty state, in the serif voice, with the composer present but inert.
- [ ] **D9** `first_sign_in` and `onboarding_completed` events.

## Phase E, mobile

- [ ] **E1** Expo app with a custom dev build, Expo Router, NativeWind driven by `packages/tokens`.
- [ ] **E2** 🔴 EAS project, plus the iOS credentials that A1b started: provisioning for a custom dev build, the associated domain for Sign in with Apple, and a reversed client ID for Google on iOS.
- [ ] **E3** Native Apple and Google sign-in, session in `expo-secure-store`, provider order per platform.
- [ ] **E4** Gate, no-invite, first run and Today empty on both phones, with Material 3 chrome on Android. **The notification permission ask fires straight after Get started**, which is where the design puts it so the third screen is the reason the dialog appears.
- [ ] **E5** `email.download_app` job, sent from the invite email's footer link rather than automatically. *Gates no acceptance criterion; first to cut if the feature runs long.*

## Phase F, closing

- [ ] **F1** Tests for every acceptance criterion, named by AC.
- [ ] **F2** `/review` over the whole diff, then fix what it finds.
- [ ] **F3** `docs/local-dev.md` filled in for real: the one command, ports, environment variables, the seed.
- [ ] **F4** Deploy to Railway, staging awake on request at the domain settled in A0, and a smoke test of the full path.

## Tests, by acceptance criterion

- [ ] **T-AC1** Waitlist join is enumeration-safe: identical body and status, and **measured** timing variance within noise across new, waiting and existing addresses. Two submissions of one address produce one account row and one email.
- [ ] **T-AC2** Promotion is one transaction. Forcing a failure at each step leaves no half-promoted account.
- [ ] **T-AC3** A non-staff account gets 403 on every admin route. *The support-sees-404-not-403 half of AC-3 moves to the spec that builds the owner-only pages: with Costs, Limits, People and Staff out of scope here, that test would pass because the route does not exist rather than because the pattern works, which is false confidence.*
- [ ] **T-AC5** A valid provider login for an uninvited identity provisions nothing and returns the no-invite state. **A sign-in attempt against a `waitlist` or `disabled` account creates no `account_identities` row**, so a refusal has no side effects.
- [ ] **T-AC6** Apple then Google with the same verified email is one account. An unverified email never links.
- [ ] **T-AC7** First run completes once per person; a second device resumes rather than restarts.
- [ ] **T-AC9** Disabling an account stops an existing session at its next refresh, not at token expiry.
- [ ] **T-AC10** Every emitted event validates against its schema and contains no email address and **no field shaped like an account id**, asserted against the four funnel schemas specifically.
- [ ] **T-AC11** Every email has a plain-text alternative and no image references.
