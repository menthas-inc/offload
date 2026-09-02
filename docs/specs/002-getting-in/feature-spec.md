# 002 Getting in

## Why

Nothing in offload is reachable without an account, and the product is invite only, so the way in *is* the first feature. It is also the cheapest moment to wire all four surfaces together: a person joins a waitlist on the marketing site, an admin lets them in, they sign in on a phone or a browser, and they land on an empty Today. That path touches every client, the API, the database, the email provider and the deploy pipeline, which means building it stands the whole skeleton up.

Doing it first is deliberate. The alternative, building the dump loop against a stubbed account, defers exactly the parts that are expensive to get wrong: account lifecycle, identity linking and the invite gate.

## What

**Joining.** The landing page has one field and two actions, per the design: join the waitlist, or sign in if you already have an invite. Submitting swaps the field for one line on the same page. The person gets an email saying they are on the list.

**Being let in.** An admin opens the panel, sees who is waiting, and invites one person or a selection. Promotion creates the account, its key and its Miscellaneous thread together, and sends the invite email.

**Signing in.** Apple and Google, nothing else. Order flips by platform: Apple leads on iOS, Google on Android, Apple first on web. A valid login for an identity nobody invited gets the no-invite screen, which names the address it checked and offers to join the waitlist reusing it.

**Becoming active.** First run is three screens, once per person and not once per device. Finishing it flips the account from invited to active and lands them on Today, which is empty and says so in offload's own voice.

**Being one person.** Signing in with Apple and with Google using the same verified email reaches the same account.

## Acceptance criteria

- **AC-1** A public visitor can join the waitlist with an email address and receives a confirmation email **once, ever**. Submitting twice, or submitting an address that already has an account, produces an identical response, takes indistinguishable time, creates no second account and sends no second email.
- **AC-2** An admin can see the waitlist and promote one person or a selection. Promotion creates the account, its `account_keys` row, its Miscellaneous thread and its `thread_members` row in one transaction, and sends the invite email.
- **AC-3** Only an account whose verified email is on the staff allowlist can reach the admin panel. *The support-versus-owner page split is specified here but only testable once owner-only pages exist, so that half is verified in the spec that builds them.*
- **AC-4** Sign in with Apple and with Google works on iOS, Android and web, with the provider order the design specifies per platform.
- **AC-5** A valid provider login for an identity that was never invited gets the no-invite screen and can join the waitlist in one tap using that same address. No account is auto-provisioned.
- **AC-6** Signing in with a second provider whose **verified** email matches an existing account links to that account rather than creating a new one. An unverified email never links.
- **AC-7** First run shows once per person. Completing it flips `invited` to `active` and records the consent, in one transaction. Signing in later on another device shows no tutorial.
- **AC-7a** First run ends on a consent screen with two ticks, and neither Get started nor Skip can pass it. The server refuses `POST /api/onboarding/complete` without both, so no account can reach `active` with null consent columns. *Added 1 September 2026, after the privacy policy was written and the legal basis for special category content turned out to be missing. The tutorial is still the three screens the kits draw, with nothing to fill in; the consent is a fourth screen and carries no dot.*
- **AC-8** An active account lands on Today and sees the designed day-one empty state on all three clients.
- **AC-9** A disabled account cannot sign in and its live sessions stop working.
- **AC-10** The funnel is measurable server-side end to end: `waitlist_joined`, `invite_sent`, `first_sign_in`, `onboarding_completed`, each carrying `subject_id` and never a real account id.
- **AC-11** Every transactional email is the design's one template with four slots filled, ships a plain-text alternative, and contains no images.

## What this feature does not make possible

**Inviting anyone real.** Nothing can be dumped until 003, and first run's third screen teaches people to dump. This feature is done when *we* can get in, not when a stranger can. The waitlist and the promotion path are built and exercised on our own accounts.

## Deferred, and named so the next spec inherits it

**Removing an identity must revoke the sessions established through it.** Identity management is not built here, so this is forward-looking, but a removal that leaves a live session is a removal that did nothing.

## Out of scope

Dumping anything, threads beyond the Miscellaneous one created at promotion, things, memories, sharing, connectors, the admin panel's People, Costs, Limits and Staff pages, billing, and any Today content beyond the empty state. Bot protection beyond a honeypot and rate limiting, which is named as a pre-public gate rather than built now.

## Notes

- **The domain is `offload.club`**, settled 2026-08-31. The design's marketing README says `offload.app`, which is now stale and is logged as a divergence in the design system's own decisions file.
- **This feature migrates only the tables it uses.** Spec 001 designs the whole model; bringing up tables no code reads would be building ahead of a spec (DEV-1). The rest arrive with the features that need them.
