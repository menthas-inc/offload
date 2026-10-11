# Turning the calendar on

Everything in 012 ships inert. The code is there, the boundary is enforced, and
no screen offers a control that cannot work until the three variables below are
set. This is what setting them takes.

**Do `docs/tech/google-workspace.md` first.** Everything Google sits under a
personal Gmail account, and this project is the first thing that will ever be
submitted for verification. Verification binds to a project, so making it inside
the `offload.club` organisation costs nothing now and moving it afterwards is
the expensive order. That document also covers moving sign-in, which is safe and
changes no credentials, and it is where steps 1 to 4 below are written out in
full with the organisation in place.

**Its own Google Cloud project, not sign-in's.** Calendar scopes are *sensitive*
and pull a whole project into a heavier verification review. Sign-in works today
on basic scopes and must not be able to lose that because a calendar submission
stalled.

## 1. The project

1. <https://console.cloud.google.com/projectcreate>
2. Name it something that says what it is, `offload-connectors`. Not the project
   sign-in uses.

## 2. The API

1. **APIs & Services → Library**, search **Google Calendar API**, Enable.
2. Nothing else. Not Gmail, not Drive, not People. A scope you enable is a scope
   the review asks about.

## 3. The consent screen

**APIs & Services → OAuth consent screen.**

- **User type: External.** Internal needs a Workspace org and would lock this to
  one domain.
- App name `offload`, your support email, your developer email.
- **App domain**: `offload.club`. Privacy policy `https://offload.club/privacy`.
  Both are asked for at verification and the page already exists.
- **Scopes → Add or remove scopes**, then *Manually add scopes*, exactly these
  two and no others:

  ```
  https://www.googleapis.com/auth/calendar.calendarlist.readonly
  https://www.googleapis.com/auth/calendar.events
  ```

  Not `.../auth/calendar`. That one also grants access-list and calendar
  management, which this feature never calls, and a broader scope is a longer
  review. offload asks *you* whether a calendar is shared rather than reading
  Google's access list, which is why no ACL scope is here.

- **Test users**: add the accounts you will actually test with. **Leave the app
  in Testing.** Testing allows up to 100 users, each of whom sees an
  "unverified app" screen before consent, which is fine for an invite-only
  alpha and is the state you want until verification is done.

## 4. The client

**APIs & Services → Credentials → Create credentials → OAuth client ID.**

- **Application type: Web application.** Not Android and not iOS: the phones
  open a browser to this flow and it comes back to the API, exactly as sign-in
  does, because a cookie cannot span unrelated domains.
- **Authorised redirect URIs**, both:

  ```
  https://api.offload.club/api/connectors/google/callback
  http://localhost:4701/api/connectors/google/callback
  ```

  These must match `${API_URL}/api/connectors/google/callback` byte for byte.
  Google compares them exactly: a trailing slash is a different URI.

- Copy the client ID and the client secret.

## 5. The variables

Three, in Railway on **core-api**, and the same three in `.env` for local work:

```
GOOGLE_CONNECTOR_CLIENT_ID=<from step 4>
GOOGLE_CONNECTOR_CLIENT_SECRET=<from step 4>
CONNECTOR_VAULT_KEY=<openssl rand -base64 32, generated per environment, never written here>
```

The vault key is generated and is 32 bytes of base64. It seals the OAuth tokens
at rest and is **not** `DATA_ROOT_KEY`: two keys, because these are credentials
to somebody else's system and that one seals content, so rotating or losing one
should never be a decision about the other. **Losing this key means every
connection has to be reconnected**, which is annoying rather than destructive,
since nothing but tokens is sealed with it.

With any of the three missing, `connectorsAvailable()` is false: Settings shows
Calendar as "Not available yet" and first run never offers the step.

## 6. Verification, which is the long pole

Sensitive scopes need Google to verify the app before it goes past the test-user
cap, and that takes weeks rather than an afternoon. **Start the submission
before you need it.** It wants the privacy policy URL, a demo video of the
consent flow, and an explanation of why each scope is needed. Nothing about it
blocks building or testing with test users.

## 7. What to check first, in order

1. Settings → Connected apps stops saying "Not available yet".
2. Connect. Google's consent screen names offload and lists two scopes.
3. Coming back lists your calendars, with the shared toggle off only on your own
   primary.
4. Point one at a thread, turn it on, wait for a sync, and see events in it.
5. Ask offload for something on your calendar with no calendar connected: it
   should say to connect one in Settings, not pretend.
6. Ask it to add something to a calendar only you can see: it should just do it,
   with Undo.
7. Ask it to add something with a guest, or to the calendar you share: it should
   ask first and name who finds out.
