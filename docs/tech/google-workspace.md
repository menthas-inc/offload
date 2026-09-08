# Moving Google onto offload.club

Everything Google currently sits under a personal Gmail account: the Cloud
project behind sign-in, and whatever gets made for connectors. This moves it
onto the domain before anything is submitted for verification, because
verification binds to a project and moving afterwards is the expensive order.

**The one fact that makes this safe.** Sign-in requests `email`, `profile` and
`openid` and nothing else. All three are non-sensitive, so sign-in has never
needed verification and has no verification status a move could put at risk. The
calendar's scopes are the sensitive ones, and that project does not exist yet.

**And the one that makes it worth doing today.** `offload.club` has no MX
records, so `hello@offload.club` receives nothing. The privacy policy gives that
address in three places, once as the route for a GDPR request with a 30-day
answer, and says a person reads it. Nobody does.

---

## Part 1. The Workspace

**Business Starter, not Cloud Identity Free.** The free tier creates the
organisation and no mailbox, and a mailbox is half of why this is happening.

1. <https://workspace.google.com> → **Get started**.
2. Business name `offload` (or the legal entity, if it exists by now: see the
   note at the end). Employees: just you. Region.
3. Sign in with the **personal Gmail** when it asks for a current email. That is
   only how Google contacts you about the signup; it does not tie anything to it.
4. **"Does your business have a domain?"** → Yes → `offload.club`.
5. Create the admin account: `admin@offload.club`.
6. **Verify the domain.** Google gives a TXT record. DNS is Cloudflare:
   dash.cloudflare.com → `offload.club` → DNS → **Add record** → TXT, name `@`,
   the value Google gave. **Proxy status does not apply to TXT**, so there is
   nothing to toggle.
7. **Add the MX records** Google gives you, same place, TXT/MX are never
   proxied. This is what finally makes `hello@offload.club` real.
8. Once verified, **Admin console → Directory → Groups → Create group**
   `hello@offload.club`, with you as a member. A group rather than an alias,
   because the OAuth consent screen will accept a group as its support address
   and because the policy promises a person, not a person's personal mailbox.

You now have a **Cloud Organization** for `offload.club`. Confirm it:

```
gcloud auth login admin@offload.club
gcloud organizations list
```

Note the `ID`. It is a number and everything below wants it.

---

## Part 2. Moving sign-in, without breaking sign-in

**The client ID and secret do not change when a project moves.** A project keeps
its id and its number, and an OAuth client belongs to the project. So
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Railway stay exactly as they
are, and there is no window where sign-in is down. Nothing needs deploying.

1. **From the personal account**, in the Cloud console, open the sign-in project
   → **IAM & Admin → IAM → Grant access**. Add `admin@offload.club` as
   **Owner**. Keep the personal account as Owner too, for now: it is the way
   back if anything is wrong.
2. **From the Workspace account**, find the project and move it:

   ```
   gcloud auth login admin@offload.club
   gcloud projects list
   gcloud beta projects move PROJECT_ID --organization ORG_ID
   ```

   If it refuses, the Workspace account is missing
   `roles/resourcemanager.projectCreator` at the organisation. Grant it in
   **IAM & Admin → IAM** with the organisation selected as the resource, not the
   project.

3. **Do not touch the OAuth consent screen's user type.** This is the one way to
   break every account at once. A project inside an organisation is offered
   **Internal**, which sounds tidier and means *only `@offload.club` accounts
   may sign in*. Every alpha user signs in with their own Gmail or Apple ID.
   **It stays External.**
4. Change the consent screen's **User support email** to
   `hello@offload.club`, now that the group exists. This is what people see when
   they consent, and it is currently a personal address on a product whose
   privacy policy says it is run by a corporation.
5. **Billing does not move with the project.** Check **Billing** and, if you want
   it off a personal card, create a billing account under the organisation and
   re-link the project. Sign-in costs nothing, so this is tidiness rather than
   urgency.
6. Sign in to the app, on the web and on a phone. Nothing should have changed.
   **Only then** remove the personal account from the project's IAM.

---

## Part 3. The connectors project

Made in the organisation from the start, so none of the above ever applies to it.

1. `gcloud auth login admin@offload.club`, then
   <https://console.cloud.google.com/projectcreate>. **Set Location to the
   `offload.club` organisation**, not "No organisation". That dropdown is the
   whole point and it is easy to skip.
2. Name it `offload-connectors`. **Separate from sign-in on purpose:** calendar
   scopes are sensitive and pull a project into a heavier review, and sign-in
   must not be able to lose anything because a calendar submission stalled.
3. **APIs & Services → Library → Google Calendar API → Enable.** Nothing else. A
   scope you enable is a scope the review asks about.
4. **OAuth consent screen**: **External** again, for the same reason as above.
   App name `offload`, support email `hello@offload.club`, developer email
   `admin@offload.club`. App domain `offload.club`, privacy policy
   `https://offload.club/privacy`.
5. **Scopes → Add or remove scopes → Manually add**, exactly these two:

   ```
   https://www.googleapis.com/auth/calendar.calendarlist.readonly
   https://www.googleapis.com/auth/calendar.events
   ```

   Not `.../auth/calendar`, which also grants access-list and calendar
   management this feature never calls. offload asks *you* whether a calendar is
   shared rather than reading Google's access list, so no ACL scope belongs here.
6. **Test users**: yourself. **Leave the app in Testing**: 100 users, each seeing
   an unverified-app screen before consent, which is the right state for an
   invite-only alpha.
7. **Credentials → Create credentials → OAuth client ID → Web application.** Not
   Android and not iOS: the phones open a browser to this and it returns to the
   API, exactly as sign-in does, because a cookie cannot span unrelated domains.
   Redirect URIs, both, matched byte for byte including no trailing slash:

   ```
   https://api.offload.club/api/connectors/google/callback
   http://localhost:4701/api/connectors/google/callback
   ```

8. The three variables, on **core-api** in Railway and in `.env` locally:

   ```
   GOOGLE_CONNECTOR_CLIENT_ID=<from step 7>
   GOOGLE_CONNECTOR_CLIENT_SECRET=<from step 7>
   CONNECTOR_VAULT_KEY=<openssl rand -base64 32>
   ```

---

## Part 4. Verification, once the rest is true

Sensitive scopes need Google to verify the app before it goes past the
test-user cap. Weeks, not an afternoon, and it blocks nothing until you want
more than a handful of testers.

It asks for the privacy policy URL, a demo video of the consent flow, and why
each scope is needed. **It also asks who you are**, which is why this document
exists: a Gmail publisher, a `menthas-inc` GitHub organisation and a privacy
policy naming an unfilled `[legal name]` are three different answers to that
question. Before submitting, fill in the placeholders in section 1 of
`apps/web/src/app/(marketing)/privacy/page.tsx` so the page and the submission
agree.

## What this leaves behind

- The personal account owns nothing in production. Today it is the single point
  of failure for sign-in: if it is lost or recovered by somebody else, every
  account loses the ability to sign in and there is no second owner.
- `hello@offload.club` receives mail, which the privacy policy has been
  promising.
- The consent screen names the domain rather than a person.
