# 002 Getting in, implementation

Grounded in `docs/tech/stack.md`, `architecture.md`, `decisions.md`, and the schema designed in `docs/specs/001-data-model/impl-spec.md`.

## Repository shape this feature creates

```
apps/web          Next.js. Route groups: (marketing) (app) (admin)
apps/core-api     Fastify. Auth, waitlist, promotion, sessions, email jobs
apps/mobile       Expo. iOS and Android
packages/tokens   Design tokens generated from the design system, as data
packages/api      Generated OpenAPI client, shared by web and mobile
schemas/events    JSON Schema per analytics event
```

The Python agent plane is **not** created here. Nothing in this feature calls Claude.

## Tables migrated

Only what this feature reads or writes, per the note in the feature spec: `accounts`, `account_identities`, `staff`, `threads`, `thread_members`, `account_keys`, `thread_keys`, `jobs`, `analytics_events`. Column definitions come from spec 001 unchanged; this feature adds none.

*`account_keys` and `thread_keys` are created at promotion even though nothing is encrypted yet, because promotion is the one moment the whole account is assembled and splitting it later means a backfill.*

## The lifecycle, end to end

```
join waitlist   →  accounts(state='waitlist')            + waitlist_joined
                   email: you are on the list

admin promotes  →  state='invited'                        + invite_sent
                   account_keys, threads(Miscellaneous), thread_members
                   email: your account is ready

first sign-in   →  account_identities row                 + first_sign_in
                   invite gate passes because state='invited'

first run done  →  state='active'                         + onboarding_completed
                   lands on Today, empty
```

## Authentication

**Better Auth**, self-hosted, sessions in our Postgres. Apple and Google only.

- **Web** keeps the session in an httpOnly cookie. A token never reaches JavaScript.
- **Mobile** uses native sign-in on each platform and stores the session in `expo-secure-store`.
- **Provider order is per platform**, from the design: Apple then Google on iOS, Google then Apple on Android, Apple then Google on web.

### The invite gate

Authentication and authorization are separate steps and the order matters. The provider proves who someone is; **we** decide whether they may in.

1. Provider returns a verified identity.
2. Look up `account_identities` by `(provider, subject)`. Found means sign in.
3. Not found: look up an account by that **verified** email.
   - Found and `state IN ('invited','active')`: **link**, by inserting an `account_identities` row (AC-6).
   - Found and `state = 'waitlist'`: no-invite screen. They are on the list but not through it.
   - Found and `state = 'disabled'`: refusal, one line, no detail.
   - Not found: no-invite screen, offering to join the waitlist with that address.
4. **Never auto-provision.** An account exists only because an admin made one.

*Linking on a verified email is safe only while every enabled provider verifies email. Apple's Hide My Email relay addresses cannot be matched, so those logins will not link, which is documented and shown to the person rather than failing silently.*

### Sessions and disabling

Short-lived access with a refresh, so disabling an account stops live sessions rather than waiting for expiry (AC-9). The session lookup checks `accounts.state` on every refresh, not only at sign-in.

## The waitlist endpoint

`POST /v1/waitlist { email }` and it is public, which makes it the most exposed surface in the product.

- **Enumeration-safe.** Identical response body, status and timing whether the address is new, already waiting, or already an account (AC-1). Achieved by doing the same work in every branch and returning before any branch-specific email decision.
- **Honeypot field** plus **per-IP and per-email rate limiting** in Postgres.
- ⚠️ **Turnstile is a pre-public gate, not built here.** A honeypot stops scripts, not a determined actor, and the cost of a flooded waitlist is a mailbox full of confirmation emails sent to people who did not ask. Add it before the landing page is publicly linked.
- The response is always the design's line: *"You are on the list, we will email you when your account is ready to use."*

## Promotion

`POST /v1/admin/waitlist/:id/invite`, and a batch variant. One transaction:

1. `state` waitlist to invited.
2. Insert `account_keys` with a fresh wrapped data key.
3. Create the Miscellaneous thread, `always_on = true`, and set `accounts.default_thread_id`.
4. Insert the creator's `thread_members` row, `accepted`, null `invited_by`.
5. Insert the creator's `thread_keys` wrap.
6. Enqueue the invite email.
7. Emit `invite_sent`.

*All of it or none of it. A half-promoted account is one that can sign in and has nowhere to put anything.*

## Admin authorization

A seeded, verified-email allowlist in `staff`, checked app-side. A caller is staff if and only if their token's **verified** email has a row.

- Seeded once from `ADMIN_EMAILS` by a `seed:admins` script, after which the variable is discarded. **No runtime `email IN env` check on the request path**, which would be both a privilege-escalation surface and a way for a secret to reach a log.
- `support` sees Waitlist. `owner` also sees the pages this feature does not build. Support does not see them at all (AC-3).

## Email

**Resend**, behind a `Mailer` interface with one method, so swapping it is one class. *Chosen for DX and price at this volume; Postmark is the alternative if deliverability ever needs a specialist. The interface is the point, not the vendor.*

Sending is **a job, never inline**. A slow provider must not slow a request, and a failed send must retry without the person resubmitting. `jobs.kind` values: `email.waitlist_joined`, `email.invited`.

Three sends, all the design's single 600px table template with four slots, no images, each shipping a plain-text alternative (AC-11):

| Job | Slots |
| --- | --- |
| Waitlist confirmation | You are on the list · what happens next · no button · footer |
| Invite | Your account is ready · one sentence · Open offload · footer |
| Download the app | Get it on your phone · one sentence · App Store or Play link · footer |

*The download email is sent from the invite email's footer link rather than automatically, since sending two emails a minute apart to someone who just got in is noise.*

## Clients

### Web, `apps/web`

- `(marketing)` the landing page. One field, one line on success, `Sign in` top right. Responsive to 375, controls 52px full width below 820px.
- `(app)` the sign-in gate, the no-invite screen, first run, and Today's empty state.
- `(admin)` moss navigation, the Waitlist page.

### Mobile, `apps/mobile`

Expo, custom dev build from day one, so **not Expo Go**. Native Apple and Google sign-in, `expo-secure-store` for the session. Screens: the gate, no invite, first run, Today empty.

*The two mobile kits differ in navigation motion and chrome. This feature has almost no navigation, so the differences are limited to the sign-in button order and Material 3 chrome on Android.*

### First run

Three screens, dots and Skip in the same place on all three, one button at the bottom, Get started lands on Today. It runs **once per person, not once per device** (AC-7), so completion is a server-side flag, the `invited` to `active` transition, not local storage.

## Analytics

Four events, all server-side, so the whole funnel is measurable without any browser tracking or consent banner: `waitlist_joined`, `invite_sent`, `first_sign_in`, `onboarding_completed`. Each carries `subject_id` and never a real account id (AC-10).

*`waitlist_joined` is emitted for an account that does not yet have an `analytics_subject_id`, so the subject is minted at waitlist creation rather than at promotion.*

## Volume and access

| Table | Per account | Notes |
| --- | --- | --- |
| `accounts` | 1 | The whole table is small for a long time. Alpha is tens of rows. |
| `account_identities` | 1 to 3 | One per linked provider. |
| `staff` | | Single digits, ever. |
| `jobs` | transient | A handful per promotion. |

Reads: the admin Waitlist page lists `accounts WHERE state = 'waitlist'` ordered by `created_at`, which needs `(state, created_at)`. Sign-in looks up `(provider, subject)`, unique, and by verified email, which needs an index on `lower(email)`. Nothing here is close to needing pagination, but the waitlist list gets a cursor anyway because it is the one that grows unattended.

## Constitution check

- **OFF-1** The four funnel events carry ids and states only. No email address ever enters an event.
- **OFF-3** Every account-scoped read is by the session's account. The admin panel is the one cross-account surface and it is gated by the staff allowlist.
- **OFF-6** Nothing here is reversible-by-Undo; promotion and disabling are admin actions with their own confirmations. Deleting an account is out of scope.
- **SEC-1** No secrets in source. `ADMIN_EMAILS` is read once at seed and discarded.
- **SEC-2** The invite gate is server-side. The client never decides whether someone is allowed in; it renders what the server returns.
- **DEV-1** Only the tables this feature reads are migrated, and the Python plane is not created.

## Edge cases

- **Someone joins the waitlist with an address that already has an active account.** Identical response, no email, no state change. Telling them would be an enumeration oracle.
- **Someone is promoted twice.** Idempotent: the second promotion is a no-op and sends no second email.
- **Apple Hide My Email.** The relay address cannot match an existing account, so that login creates a separate identity and hits the no-invite screen. Shown to the person as a named limitation rather than a generic refusal.
- **A person signs in on a second device mid-first-run.** First run is server-side state, so they resume rather than restart.
- **The email provider is down at promotion.** The transaction commits and the job retries. An invited account with no email yet is recoverable; a rolled-back promotion with a sent email is not.
- **An admin invites someone who then never signs in.** They stay `invited`. The Waitlist page shows them as invited-not-signed-in, which the design calls for.
