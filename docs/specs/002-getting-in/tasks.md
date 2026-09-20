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
- [x] **A1** 🔴 Infrastructure prerequisites: Railway login, Google OAuth, Resend. Batched into one list rather than asked one at a time.
- [x] **A1b** 🔴 **Apple credentials, started now and not in Phase E.** Developer Program enrolment, an App ID, a Services ID, and a Sign in with Apple key giving a `.p8`, a Team ID and a Key ID. *Enrolment alone can take days, so this is pure lead time and nothing about it is sequenced after the code. Started in parallel with A1; if it is not ready when Phase D arrives, ship Google-only and add Apple behind it.*
- [x] **A2** Monorepo skeleton: pnpm workspaces, Turborepo, shared tsconfig, ESLint already wired. `apps/web`, `apps/core-api`, `packages/api`, `packages/tokens`, `schemas/events`.
- [x] **A3** `packages/tokens`: generate design tokens as JSON from `.claude/skills/offload-design/tokens/`, plus a Tailwind theme built from it. *Generated, never hand-copied, so a design sync propagates (OFF-7).*
- [x] **A4** Core API skeleton: Fastify, `zod` and `fastify-type-provider-zod`, `/healthz`, structured logging that carries ids and outcomes only (OFF-1).
- [x] **A5** Migration runner and the spec 001 subset: `accounts` (with `UNIQUE (lower(email)) WHERE deleted_at IS NULL` and `waitlist_email_sent_at`), `account_identities`, `staff`, `threads`, `thread_members`, `account_keys`, `thread_keys`, `jobs`, `analytics_events`. Kysely codegen so types come from the schema.
- [x] **A6** `seed` script producing realistic shape and volume, since there is no database branching and this is what stands in for it.
- [x] **A7** Railway project `offload` up. Postgres added with **pgvector 0.8.6 verified present**, so there is no trade against the managed backup story. `core-api` deployed and serving, reaching Postgres over the private network. Migrations run on boot under an advisory lock. **PITR enabled 2026-08-31.** *`DATABASE_URL` is a proper `${{Postgres.DATABASE_URL}}` reference; an earlier note here said otherwise and was wrong.* Remaining: the custom domain, which waits on a DNS record.
- [x] **A8** GitHub Actions: lint, typecheck, test, and migrations against an ephemeral Postgres seeded by A6.

## Phase B, the waitlist

- [x] **B1** `POST /v1/waitlist`: honeypot, per-IP and per-email rate limiting, one upsert in every branch, a fixed minimum response duration, and trim-and-lowercase normalisation on every boundary.
- [x] **B2** `jobs` runner in the Core API with `FOR UPDATE SKIP LOCKED`, visibility timeout, attempts with backoff, dead state.
- [x] **B3** `Mailer` interface, Resend implementation, and the design's 600px template with four slots plus a plain-text alternative. From `offload@offload.club`.
- [x] **B4** `email.waitlist_joined` job, gated on `waitlist_email_sent_at` so it sends once per account ever, and scrubbing the recipient from `jobs.last_error`.
- [x] **B5** Landing page in `(marketing)`: one field, success line in place, `Sign in` top right, responsive to 375.
- [x] **B6** `waitlist_joined` event, and the `schemas/events` entry plus its CI validation.

## Phase C, the admin panel

- [x] **C1** `staff` seeded by `seed:admins` from `ADMIN_EMAILS`, which is then discarded. No runtime env check on the request path. **The seed runs the same promotion transaction as C5** for an email with no account yet, so the first owner is assembled exactly like every other account rather than by a second code path.
- [x] **C2** Admin authorization middleware: `staff.account_id = session.account_id`, using the account the session already resolved rather than re-deriving one from an email claim. Support and owner resolve to different page sets.
- [x] **C3** `(admin)` route group: moss navigation, the `admin` tag by the wordmark, its own layout.
- [x] **C4** Waitlist page: waiting, invited-not-signed-in, cursor-paginated, select one or many.
- [x] **C5** `POST /v1/admin/waitlist/:id/invite` and the batch variant. One transaction: state, `account_keys`, Miscellaneous thread, `thread_members`, `thread_keys`, enqueue email, emit `invite_sent`. Idempotent.
- [x] **C6** `email.invited` job.

## Phase D, auth on web

- [x] **D1** Better Auth **remapped onto `accounts` and `account_identities`**, with its own `accountLinking` **enabled and governed by our hook**. *Corrected during implementation: with linking disabled and user creation refused, an invited person has no path in at all, because attaching a first identity is a link. See `docs/tech/decisions.md`.* Sessions in Postgres; cookie `Domain=.offload.club`, `HttpOnly`, `Secure`, `SameSite=Lax`; CORS on the API allowing only the web origin with credentials; 15-minute access TTL.
- [x] **D2** The invite gate in **three layers**: a `user.create.before` hook returning false, and no session issued for an account that is not invited or active. *Better Auth has open issues about before-hooks not firing on every path, and this is the product's entire access control, so it does not get to be the only thing standing there. Verify the hook fires on both the Google and the Apple callback.*
- [x] **D3** Identity linking governed by the gate. **Linking onto a `staff` account that already has an identity fails closed** rather than notifying and asking a second admin: stricter than the flow it stands in for, and the approval flow is deferred with the owner-only pages. *The Apple relay-address limitation still needs surfacing by name in the UI copy.*
- [x] **D4** Session refresh checks `accounts.state`, so disabling stops live sessions. `session.update.before` refuses the refresh, which is where a session that should have died gets its extension.
- [x] **D5** Sign-in screen, Google first on web (Apple first until 2026-09-21), with the refusal as one line above the buttons.
- [x] **D6** No-invite screen: names the address it checked, joins the waitlist in one tap reusing it, "Use a different account" as the quiet secondary.
- [x] **D7** First run, three screens, server-side completion flipping `invited` to `active`.
- [x] **D7a** The consent screen, fourth and dotless, on all three clients: two ticks, the privacy link, and the advice line about passwords and card numbers. `consent_version` and `consented_at` are written by the same update that flips the state, and `z.literal(true)` on both fields is the whole enforcement. **Skip now lands here rather than completing first run.** *Existing `active` accounts, which are all ours, have null consent columns and are not backfilled: a consent nobody gave is not a consent.*
- [x] **D8** Today's day-one empty state, in the serif voice, with the composer present but inert.
- [x] **D9** `first_sign_in` and `onboarding_completed` events.

## Phase E, mobile

- [x] **E1** Expo app with a custom dev build, Expo Router, NativeWind driven by `packages/tokens`. **The bundle works and runs on a device.** `expo export` used to hang after "Starting Metro Bundler"; the cause was a CSS `@import` across a workspace package, which stalls NativeWind's Metro transformer with no error and no CPU. `pnpm tokens` writes the stylesheet into the app instead. Bundles in about six seconds now, and the app has been driven end to end on a Pixel 9. *`pnpm tokens` now also emits `nativewind.css` and `tailwind-preset.js`: colours as RGB channels in CSS variables, so dark is a variable swap rather than a second palette. Nothing in `apps/mobile` holds a value.*
- [~] **E2** 🔴 **EAS project created** (`9b52f487-7c53-4d9d-a389-889ccc79798d`, owner `menthas_offload`), `eas.json` written with four profiles, all pinned to `https://api.offload.club`; `apps/mobile/EAS.md` has the remaining steps in order. **What still needs a person:** the Apple credentials, which need an Apple ID with two-factor and cannot be delegated to a token. Originally: EAS project, plus the iOS credentials that A1b started: provisioning for a custom dev build, the associated domain for Sign in with Apple, and a reversed client ID for Google on iOS.
- [x] **E3** **Apple native** through `expo-apple-authentication`, **Google browser-based** through Better Auth's Expo plugin, session in `expo-secure-store`, provider order per platform. *Native Google needs `@react-native-google-signin` and a reversed client id that only exists once E2 does. The browser flow is the same gate and swapping it later changes `lib/auth.ts` and nothing else.*
- [x] **E4a** **The phones were rendering none of the design system, and nobody could see it.** The token generator filtered colours from the raw scope, so 27 of 81 were dropped and 24 of those were semantic: `text-primary`, `text-inverse`, `text-link`, `surface-raised` and their neighbours. The Android platform scope was inserted by a pattern that hard-coded the indentation `@layer base` used to give it, so every `a-` class was dead too. And no font was ever loaded, so both platforms substituted their own. All three failed by doing nothing rather than by raising. The generator asserts now, and `.claude/scripts/dead-classes.mjs` checks every class in the app against the generated theme.
- [x] **E4b** Waitlist screen on both phones, `components/screens/Waitlist.{ios,android}.tsx`. **No kit draws it:** the kits only reach the waitlist after a refused sign-in, where the address is already known, so "Join the waitlist" on the gate was inert and tapping it did nothing. Logged in the design system's `decisions.md`.
- [x] **E4** Gate, no-invite, first run and Today empty on both phones, **rebuilt from `ui_kits/mobile_app/FirstRun.jsx` and `ui_kits/android_app/M3FirstRun.jsx`**, with Material 3 on Android as **a real fork** (platform route files, Material's shape scale, container roles and bar heights, Google first). **The notification permission ask fires straight after Get started**, which is where the design puts it so the third screen is the reason the dialog appears. *A refused or errored permission still lands on Today: it is not a failure of first run.*
- [~] **E5** Not built, deliberately. `email.download_app` job, sent from the invite email's footer link rather than automatically. *Gates no acceptance criterion; first to cut if the feature runs long.*

## Phase F, closing

- [x] **F1** Tests for every acceptance criterion, named by AC. **AC-1 through AC-11 except AC-8**, which is the day-one empty state: a visual criterion with no server surface to assert. *The test names were wrong at first: they cited AC-12 and AC-17, numbers that came from this task list rather than from the spec, which stops at AC-11. Remapped, because a citation that does not resolve is worse than none.*
- [x] **F2** `/review` over the whole feature: code, security and client panels in parallel, then the constitution pass by hand, then fixes. **Two criticals, two highs and a dozen smaller findings, every one of them invisible to the 103-test suite.** The worst: nothing drained the jobs table in production, so no email had ever been sent; and the no-invite screen was unreachable on both phones. Also live provider tokens at rest in plaintext behind a comment claiming a hook removed them, and a rate limiter that had never fired because it read two properties nothing wrote.
- [x] **F3** `docs/local-dev.md` filled in for real: the one command, ports, environment variables, the seed.
- [~] **F4** Deployed to Railway and smoke tested: migrations 0002 and 0003 applied at boot, both providers redirect, `/api/me` 401s and `/v1/admin/waitlist` 404s unauthenticated, the waitlist accepts. **The web app is deployed too**, as a second Railway service at `https://web-production-f4caf.up.railway.app`, verified serving the marketing page, the gate, first run, Today and the admin panel, with sign-in callbacks accepted back to it and an untrusted callback refused. **`offload.club` and `api.offload.club` are live**, both serving, with `www` redirecting. **Still open:** a staging environment.

- [x] **F5** Second `/review` over the whole feature before shipping, panels in parallel then the constitution pass by hand. **Two criticals, five highs.** The worst two were invisible in every previous pass: Skip on both phones completed first run instead of landing on the consent screen, so `consent_version` and `consented_at` were written for two ticks nobody was shown, which is the one thing AC-7a exists to prevent; and the web's day-one Today shipped with no styling at all, eight of its nine CSS classes defined nowhere, because `declare module "*.css"` makes every `styles.x` an `any`. Also: a refused sign-in only remembered the address when no account matched at all, so the waitlisted person who got impatient hit a dead end; mobile discarded the server's answer when finishing first run; the admin panel sent a manually selected bulk invite with no confirmation; the composer wore the attention accent at rest on both phones; and the staff-linking guard's lock did not close the window its comment claimed. **Two scanners came out of it**, `dead-classes.mjs` and `dead-css.mjs`, because both criticals were classes of bug that pass typecheck, lint and build.
- [ ] **F6** 🔴 **Remove the temporary sign-out** before anyone outside the team has a build: `apps/mobile/lib/auth.ts`'s `signOutForTesting()` and `components/TempSignOut.tsx`, wired into both Today screens. Added deliberately so the gate could be tested without reinstalling, and named so both halves point at each other.

## Tests, by acceptance criterion

- [x] **T-AC1** Waitlist join is enumeration-safe: identical body and status, and **measured** timing variance within noise across new, waiting and existing addresses. Two submissions of one address produce one account row and one email.
- [x] **T-AC2** Promotion is one transaction. Forcing a failure at each step leaves no half-promoted account.
- [x] **T-AC3** A non-staff account gets **404**, not 403, on every admin route. *Changed during implementation to match the design's own rule for owner-only pages: support does not see them refused, it does not see them. Applying that to the whole API costs nothing and confirms less.* *The support-sees-404-not-403 half of AC-3 moves to the spec that builds the owner-only pages: with Costs, Limits, People and Staff out of scope here, that test would pass because the route does not exist rather than because the pattern works, which is false confidence.*
- [x] **T-AC5** A valid provider login for an uninvited identity provisions nothing and returns the no-invite state. **A sign-in attempt against a `waitlist` or `disabled` account creates no `account_identities` row**, so a refusal has no side effects.
- [x] **T-AC6** Apple then Google with the same verified email is one account. An unverified email never links.
- [x] **T-AC7** First run completes once per person; a second device resumes rather than restarts. *Server-side: `invited` to `active` is the only marker, the client never claims it, and the flip is idempotent by its where clause.*
- [x] **T-AC7a** `POST /api/onboarding/complete` is refused with either tick missing or absent, and the account stays `invited`. A completed first run has both `consent_version` and `consented_at` set, in the same transaction as the state flip.
- [x] **T-AC9** Disabling an account stops an existing session at its next refresh, not at token expiry.
- [x] **T-AC10** Every emitted event validates against its schema and contains no email address and **no field shaped like an account id**, asserted against the four funnel schemas specifically.
- [x] **T-AC11** Every email has a plain-text alternative and no image references.
