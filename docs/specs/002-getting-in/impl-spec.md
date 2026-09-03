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

Only what this feature reads or writes, per the note in the feature spec: `accounts`, `account_identities`, `staff`, `threads`, `thread_members`, `account_keys`, `thread_keys`, `jobs`, `analytics_events`.

Column definitions come from spec 001 unchanged, **except for three changes to `accounts` in migration `0003_promotion.sql`.** They were added during implementation rather than specified ahead of it, which is a DATA-1 miss; they are written down here now:

| Change | Why |
| --- | --- |
| `analytics_subject_id` gains `default gen_random_uuid()` and becomes `not null` | It had no default, so whichever code path created the account assigned it, and the auth hook was using "is it still null?" as its once-only lock for `first_sign_in`. The moment promotion also assigned one, that event would have stopped firing for everyone. `gen_random_uuid` and not `uuid_v7`: a v4 is unordered, and a time-ordered pseudonym would put account creation time into the warehouse in the clear, in every event, forever. |
| `first_signed_in_at timestamptz` | The once-only claim for `first_sign_in`, freed by the change above. Not derivable from `sessions`: "is this the only session?" is true again as soon as the first one expires and a second device signs in. |
| `invite_email_sent_at timestamptz` | The same claim the waitlist confirmation uses, for the same reason. The queue's idempotency key stops a second enqueue, not a second send by a job that retried after the mailer succeeded and the acknowledgement did not. Released deliberately by the admin panel's Resend. |

*`account_keys` and `thread_keys` are created at promotion even though nothing is encrypted yet, because promotion is the one moment the whole account is assembled and splitting it later means a backfill.*

**Four more migrations landed after the ones above**, and they are recorded here for the same DATA-1 reason:

| Migration | Change | Why |
| --- | --- | --- |
| `0004_waitlist_attempts.sql` | `waitlist_attempts (email_hash, ip_hash, created_at)` | The rate limiter read two properties off `analytics_events` that nothing ever wrote, so it had never once fired. HMACs rather than addresses, because a rate limiter does not need to be able to read its own subjects. |
| `0005_account_issuer.sql` | `account_identities.issuer` | Better Auth 1.7 scopes an identity by issuer as well as subject. We moved 1.6 to 1.7.2 mid-flight and never ran the schema change, so the first real OAuth callback in production failed on a missing column. The guard against a repeat is the schema-drift test, not this migration. |
| `0006_account_image.sql` | `accounts.image` | Better Auth's user model expects it. Written by the provider, read by nothing yet. |
| `0007_staff_single_identity.sql` | Trigger refusing a second `account_identities` row for an account in `staff` | The application guard took a `SELECT ... FOR UPDATE` and a comment claiming the lock closed the check-then-act window. It does not: Better Auth calls the hook and the insert as separate statements with no transaction around either, so the row lock is released before the insert runs. A trigger runs inside that insert, which is the only place the window can be closed. The application check stays, because it is what makes this a refusal the gate can explain. |


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

### How Better Auth maps onto our schema

*This is the highest-risk task in the feature and it was previously one asserted line.*

**Better Auth is remapped onto our tables, it does not run its own alongside them.** Its `user` model maps to `accounts` and its `account` model to `account_identities`, via its model and field naming options, with our extra columns (`state`, `default_thread_id`, `analytics_subject_id`) declared as additional fields. Its `session` and `verification` tables are its own and we do not care about their shape.

*The alternative, letting it own a parallel identity table that we reconcile against, gives two sources of truth for who someone is. That is the kind of thing that works until an edge case makes them disagree, and then the disagreement is an authorization bug.*

### Where the invite gate actually runs, and why it runs twice

AC-5 says never auto-provision, which means intercepting **before** a user row is written, not cleaning up after.

- **Better Auth's own account linking is turned off.** `accountLinking` disabled, no trusted providers. **Every linking decision runs in our code, in the steps below, and nowhere else.**

  *This is the hole the two layers would otherwise have left. A waitlist join already writes an `accounts` row, so a later sign-in with that address is not a user creation and never reaches the create hook. With Better Auth's linking enabled, it would attach the new identity at the account level on verified email, on a path neither layer sees. The session backstop still refuses to sign them in, so it is not a full bypass, but a `disabled` account, disabled for cause, would silently gain an unreviewed provider identity as a side effect of a refusal that was supposed to do nothing.*
- **Primary: a `databaseHooks.user.create.before` hook.** Returning `false` aborts the create, which is the documented mechanism.
- **Backstop: no session is issued for an account that is not `invited` or `active`.** Checked at issuance, not only at refresh.

**Two layers on purpose.** Better Auth has open issues reporting that before-hooks do not fire on every path and do not always respect a returned object. We are betting the product's entire access control on that hook, so it does not get to be the only thing standing there. If the hook silently fails, an un-invited identity may get a row, and it still cannot get a usable session. Verify the hook fires on both the Google and the Apple callback path as part of D2, rather than assuming symmetry.

### Cookies, CORS and CSRF

The web app is `offload.club` and the API is `api.offload.club`, which are **different origins sharing a session cookie**, so none of this is implicit:

- Cookie: `Domain=.offload.club`, `HttpOnly`, `Secure`, `SameSite=Lax`. Lax rather than Strict so a link from an email lands signed in, which is the whole point of the invite mail.
- CORS on the API allows exactly `https://offload.club` (and the staging equivalent) with credentials. **Never a wildcard**, which is not merely bad practice here but inoperative, since browsers refuse credentialed requests against `*`.
- Every state-changing route, which in this feature means promotion, carries CSRF protection. Confirm Better Auth's own protection covers the cross-origin POSTs this feature adds rather than assuming it.

**Access token TTL is 15 minutes**, which bounds how long a disabled account keeps working (AC-9). Stated here because it is a security parameter, not an implementation detail.

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

- **Enumeration-safe.** Identical response body, status and timing whether the address is new, already waiting, or already an account (AC-1). Every branch performs **the same single upsert** against the unique email index, and the response is held to a **fixed minimum duration** so a faster branch cannot be timed. *"The same work in every branch" was the intent in an earlier draft, but an insert, a no-op and a lookup have different costs and identical HTTP responses still leak through timing.*
- **Normalised at every boundary.** Trim and lowercase on write and on read, with the unique index making it a guarantee rather than a convention.
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

**Idempotent by a guarded update, not by a check-then-act.** The transaction opens with `UPDATE accounts SET state='invited' WHERE id = ? AND state='waitlist'`, and zero rows affected means someone else already promoted them, so it returns success having done nothing. *Two admins clicking at once is the ordinary case, not the exotic one.*

## Admin authorization

A seeded, verified-email allowlist in `staff`, checked app-side. A caller is staff if and only if their token's **verified** email has a row.

- **The check is `staff.account_id = session.account_id`.** The session already resolved which account this is; re-deriving one from a raw email claim would be a second account-resolution path for the same request, which is how two paths come to disagree (SEC-2). *An earlier draft said "the caller's verified email has a row", which `staff` cannot answer: it holds `account_id`, not an email.*
- Seeded once from `ADMIN_EMAILS` by a `seed:admins` script, after which the variable is discarded. **No runtime `email IN env` check on the request path**, which would be both a privilege-escalation surface and a way for a secret to reach a log.
- **Bootstrapping the first owner.** Every account reaches `invited` through admin promotion, and promotion needs an admin, so the first one cannot come from the product. `seed:admins` therefore runs **the same promotion transaction as C5** for a seeded email with no account yet, rather than inserting a `staff` row beside a half-made account. *Two code paths that both create accounts is how the invariant "an account is assembled all at once" quietly stops being true.*
- **A new provider identity linking onto a `staff` account is not automatic.** It notifies the account's existing identities and requires a second admin to approve. *Verified-email linking trusts that whoever controls the address today is who controlled it before, which is fine for an ordinary account and not fine for one that can promote and disable people.*
- `support` sees Waitlist. `owner` also sees the pages this feature does not build. Support does not see them at all (AC-3).

## Email

**Resend**, behind a `Mailer` interface with one method, so swapping it is one class. *Chosen for DX and price at this volume; Postmark is the alternative if deliverability ever needs a specialist. The interface is the point, not the vendor.*

Sending is **a job, never inline**. A slow provider must not slow a request, and a failed send must retry without the person resubmitting. `jobs.kind` values: `email.waitlist_joined`, `email.invited`.

⚠️ **`email.*` jobs are the first place a real email address can reach a log (OFF-1).** A provider rejection or bounce quotes the recipient, and `jobs.last_error` is persisted. For these job kinds, store the job id, the kind, the provider status code and the attempt count, and nothing else. *The 001 review already flagged `last_error` as an unscrubbed path for content to reach a log; this feature is where that path first carries something.*

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

### The composer on Today is inert, and that is a staging state

The design is explicit that every empty screen keeps a working composer, "because on every one of them the answer is to dump something", and first run's third screen teaches exactly that one screen earlier. This feature cannot dump anything.

**So nobody real is invited until 003 ships.** This feature is done when *we* can get in, not when a stranger can. The waitlist accepts addresses and the admin panel promotes them, but promotions are for our own accounts until the dump loop exists. A person invited into an app that taught them to dump and then cannot take a dump would be the worst possible first impression, and it is entirely avoidable by not sending the invite.

*Logged as an OFF-7 divergence in the design system's own decisions file, because the composer's designed behaviour and its built behaviour differ for the length of one feature.*

### First run

Three screens, dots and Skip in the same place on all three, one button at the bottom, Get started lands on Today. It runs **once per person, not once per device** (AC-7), so completion is a server-side flag, the `invited` to `active` transition, not local storage.

**The notification permission ask fires straight after Get started, on mobile only.** The design puts it there deliberately: the third screen, which says offload only interrupts when it matters, is the reason the system dialog appears, so the ask arrives already explained. Asking anywhere else wastes the one chance the platform gives you.

## Analytics

Four events, all server-side, so the whole funnel is measurable without any browser tracking or consent banner: `waitlist_joined`, `invite_sent`, `first_sign_in`, `onboarding_completed`. Each carries `subject_id` and never a real account id (AC-10).

*`waitlist_joined` is emitted for an account that does not yet have an `analytics_subject_id`, so the subject is minted at waitlist creation rather than at promotion.*

## Volume and access

| Field | This feature |
| --- | --- |
| Records per account | `accounts` 1. `account_identities` 1 typical, 3 heavy, one per linked provider. `staff` single digits across the whole product, ever. |
| Fan-out | One account to at most three identities. One promotion to exactly one thread and one membership. |
| Growth | Alpha is tens of rows. A public waitlist is the only thing here that can grow unattended, which is why it is the one with a cursor. |
| Read pattern | Admin Waitlist page lists waiting and invited-not-signed-in. Sign-in looks up an identity on every authentication. |
| Write pattern | Waitlist joins are bursty and adversarial, since the endpoint is public. Promotions are a handful a week, by hand. |
| Sort and filter | Waitlist by `state` then `created_at`. Sign-in by `(provider, subject)` and by verified email. |

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
