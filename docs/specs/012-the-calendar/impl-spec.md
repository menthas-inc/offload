# 012 The calendar, implementation spec

## Shape

```
connect     browser ──► /api/connectors/google/start ──► Google consent
                        /api/connectors/google/callback
                          └─ tokens ──► connector_secrets (sealed)

sync        calendar.sync job ──► Google events.list(syncToken)
                          └─ rules ──► content rows (type=event, source=calendar)

write       screen or tool ──► outward test ──► Google ──► content row
                                    │
                                    └─ reversible: Undo calls Google back
```

Four new tables, one new job kind, one new vault, five tools, and a Settings
page on three clients.

## Configuration, and what it costs to be missing

**Its own Google Cloud project and OAuth client**, separate from sign-in.
Calendar scopes are sensitive and drag a whole project into a heavier
verification review; sign-in works today on basic scopes and must not be able to
lose that because a calendar submission stalled.

| Variable | What happens without it |
| --- | --- |
| `GOOGLE_CONNECTOR_CLIENT_ID` | Calendar shows as unavailable rather than broken. Connect is not offered. |
| `GOOGLE_CONNECTOR_CLIENT_SECRET` | Same. |
| `CONNECTOR_VAULT_KEY` | Same, and refused loudly in production, like `DATA_ROOT_KEY`. |

**Unset is a supported state and the whole feature is inert in it**, which is
the shape `GOOGLE_MAPS_API_KEY` already established: the code ships, the boundary
is enforced, and nothing calls out until somebody turns it on. Every screen this
feature adds reads one `available` flag and says "not available yet" rather than
offering a button that cannot work.

**Scopes, least privilege**: `calendar.calendarlist.readonly` to list, and
`calendar.events` to read and write events. Not `calendar`, which also grants
access-list and calendar management this feature does not use. The sharing flag
comes from the person, not from an ACL read, so no ACL scope is requested.

**Redirect URI**: `/api/connectors/google/callback` on the API host, because
that is where every OAuth redirect already lands for the same cookie reason
sign-in has.

## The OAuth flow, which is hand rolled and therefore spelled out

This flow deliberately does not go through Better Auth, which means it does not
inherit Better Auth's state handling either. Everything it would have given us
has to be written here, and an omission is an account-linking CSRF: an attacker
starts a consent flow, gets a signed-in person to open the resulting callback,
and their calendar is now feeding that person's threads. Untrusted event text
into somebody else's account is the exact thing the rest of this spec defends
against.

- **`/start` requires a session.** The account id is read server-side, never
  from a parameter.
- **A signed, single-use, short-lived `state`**, carrying that account id and a
  nonce, using the HMAC seal `auth/attempt.ts` already implements for the
  refused-address cookie. Ten minutes. The callback re-reads it and compares the
  account **byte for byte** against the session it arrives with; a mismatch is a
  refusal, not a re-link.
- **PKCE**, `S256`. The verifier rides the same sealed state.
- **The post-callback redirect is an allowlist**, not a parameter. Where a
  person lands after connecting is one of a fixed set of internal destinations,
  chosen by an enum in the state. `auth.ts`'s `trustedOrigins` is deliberately
  narrow for this reason and the same reasoning applies at the end of this flow.

## The vault

`AC-2`, `AC-2a`. A table of its own, sealed with a key of its own.

```
connector_secrets
  connection_id (pk, fk)  ·  access_token bytea  ·  refresh_token bytea
  access_expires_at  ·  scope text  ·  wrapped_by text  ·  created_at, updated_at
```

**Sealed with `wrap`/`unwrap` from `crypto/keys.ts`**, the same AES-256-GCM
primitive the blob key hierarchy uses, under `CONNECTOR_VAULT_KEY` rather than
`DATA_ROOT_KEY`. Two keys rather than one because these are credentials to
somebody else's system and blobs are content: a key rotation for one should
never be a decision about the other, and a compromise of one should not be both.

**Never Better Auth's `account` table**, and this is not a style preference.
`auth.ts`'s `account.create.before` and `account.update.before` both blank
`accessToken`, `refreshToken` and `idToken` unconditionally, which is the fix for
a real incident recorded in that file: every account once carried a live Google
token in plaintext. Connecting a calendar through the social-linking flow would
either be silently broken by those hooks or "fixed" by weakening them, which
restores the incident. **The connector OAuth flow shares no route, no table and
no hook with login.**

**A version tag on every row, because rotation is the thing this gets wrong.**
`connector_secrets.wrapped_by` names the key that sealed it, exactly as
`account_keys.wrapped_by` does for the root, with a `VAULT_NAME` constant beside
`ROOT_NAME`. Without it a rotation cannot tell which rows are already moved, and
that is the sibling table's whole reason for having the column.

**Bound to where it lives.** `wrap`/`unwrap` take no associated data, so a
sealed value carries no proof of which connection or which field it belongs to,
and a database writer could move a ciphertext between rows. Cheap to close for a
long-lived third-party credential: `connection_id || field` as AAD. This is the
first use of that primitive outside the key hierarchy it was written for.

**Refreshing, which nothing else in this product has to do.** An access token
expires hourly and a refresh happens under a sync and under a live tool call at
the same time. One refresh at a time per connection, guarded by a row lock, and
**the refresh token is replaced rather than assumed stable**: Google reissues it
sometimes and a client that keeps the old one is a connection that dies quietly
in a month. `invalid_grant` is not a retry, it is `needs_reauth`.

**Disconnect revokes at Google**, not only locally. Deleting our copy leaves the
grant live on Google's side, so "disconnected" in offload would mean nothing
where it counts. Revoke first, then delete the row; a failed revoke still
deletes locally and says the grant may need removing in the Google account.

**Read by the Core API alone.** The worker never receives a token; it asks the
Core API to act, per `architecture.md`. Tokens are never logged, never in an
event, and `connector_secrets` is excluded from any dump or fixture.

## The tables

```
connector_connections
  id · account_id · provider ('google') · external_account_email
  state ('active'|'revoked'|'needs_reauth') · connected_at · last_sync_at
  last_error_at · created_at, updated_at, deleted_at

connector_calendars
  id · connection_id · external_id · summary · timezone
  access_role ('owner'|'writer'|'reader'|'freeBusyReader')
  is_shared boolean NOT NULL DEFAULT true      -- AC-5a, the person's answer
  is_primary boolean
  selected boolean          -- reads into offload at all
  default_thread_id (nullable fk)
  sync_token · synced_at · created_at, updated_at

connector_calendar_rules
  id · calendar_id · ordinal · match_kind ('title_contains'|'attendee_is'|'all')
  match_value text · thread_id · created_at

connector_pending_writes
  id · account_id · calendar_id · action ('create'|'edit'|'delete')
  scope ('one'|'following', nullable) · payload jsonb · source_ref (nullable)
  expires_at · created_at · confirmed_at, declined_at
```

`connector_pending_writes` holds an outward-facing write the model proposed and
nobody has agreed to yet. Nothing in it has reached Google. It expires in an
hour and expiry is an ordinary ending.

`is_shared` **defaults to true**, and the migration says why: the safe direction
is a confirmation nobody needed rather than a notification nobody expected. Only
`is_primary` on a calendar whose `access_role` is `owner` may start false. A
calendar whose `access_role` is not `owner` cannot be set false at all, enforced
by a check on the write path, because somebody else owning it is proof somebody
else sees it.

**No `account_id` on `connector_calendars`**, deliberately. It hangs off the
connection, which hangs off the account, and a second copy is a second thing to
keep in step. Every query joins.

## Authorization, stated rather than implied

`connector_calendars` carries no `account_id` and that is a schema choice, not
an authorization one. **Every calendar-scoped route resolves ownership by
joining** `connector_calendars.connection_id` to
`connector_connections.account_id` and comparing it to the session's account:
toggling `is_shared`, setting a thread, editing a rule, disconnecting, writing an
event. This repository has already fixed this exact bug twice, both recorded in
`decisions.md`: authorization written against a value that was joined but never
checked.

**A thread id from a client is membership-checked, every time.** A calendar's
default thread and every rule's destination are chosen in Settings and arrive
from a client, and an unchecked one routes a person's calendar into any thread
id they can name. 006 shipped precisely this fix for a dump's sort destination.

## Events become content

`AC-6`. One row per occurrence inside the window, `type = 'event'`,
`source = 'calendar'`, `source_ref = <google event id>`, `account_id` = the
connecting account.

| Google | offload |
| --- | --- |
| `summary` | `title` |
| `start.dateTime` / `start.date` | `occurs_at` |
| `end.dateTime` / `end.date` | `occurs_end_at` |
| `location` | kept as text in `attrs.location`, **not geocoded** |
| `attendees[]` | `attrs.attendees`, minimised, see below |
| `organizer` | `attrs.organizer`, and it is load-bearing |
| `recurringEventId`, `id` | `attrs.series_ref`, `source_ref` |
| `description`, conferencing, attachments | **dropped** |

**`location.resolve` is not reused, and the spec said it was.** That handler
returns `skipped` for anything whose `type` is not `location`, and geocodes the
row's `title`. Pointed at an event it would either skip it or send "Dentist
appointment" to a geocoder. Making it serve events means a type allowlist and a
per-type source field, which is a change to a shipped job for a pin nobody has
asked for yet. The event's location is text on the row until then.

**Times are stored UTC in `occurs_at` and the event's IANA zone is kept in
`attrs.timezone`.** An all-day event has a date and no time, which is not
midnight anywhere: it is flagged `attrs.all_day` and rendered as a day. Storing
an all-day event as midnight UTC is the classic way a calendar feature shows
somebody's birthday on the wrong day for half the planet.

**Attendees are minimised on the way in**, per `AC-6`: display name and response
status always; email **only where offload created the event with guests**,
because editing that event later has to name them. Everything else drops the
address. These are people who never signed up.

**Idempotent by `(account_id, source_ref)`**, a unique partial index where
`source_ref is not null`, so a re-sync updates rather than duplicating and an
at-least-once job is safe.

### Routing

`AC-8`. Rules in `ordinal` order, first match wins, else the calendar's
`default_thread_id`, else nowhere.

**There is no "nowhere".** `selected` requires `default_thread_id`, enforced by a
check constraint, so a calendar that reads always has a home. *An earlier draft
had an unrouted calendar reach Today without being filed. It cannot:
`content.thread_id` has been `not null` since 0008, and the two ways to get there
were loosening it for one connector or building a second live read path beside
every content query. A thread already expresses "keep this separate".*

### The window

`AC` volume. Sixty days back, twelve months forward, moved by the sync job.

| Field | Value |
| --- | --- |
| Records per account | One row per occurrence in the window. A weekly recurrence is about 55. Typical: a few hundred. Heavy: a few thousand. |
| Read pattern | Today, the agenda, thread widgets. Same reads as any content. |
| Write pattern | A sync every 15 minutes per connection, writing only what changed. |
| Sort and filter | `occurs_at` within a thread, and by `source_ref` for reconciliation. |

**Indexes:** the unique `(account_id, source_ref)` above, and
`connector_calendars(connection_id)`. Content's existing `occurs_at` indexes
serve the reads; this adds no new access pattern to that table.

**Aging out is not deletion.** A row whose occurrence falls behind the sixty-day
window is left exactly as it is: still in its thread, still searchable, still
yours. The window bounds what offload *fetches*, not what it keeps, so this
introduces no connector-specific retention rule and contradicts nothing in
`decisions.md`. What ages out is Google's obligation to tell us it changed.

**Attendees are kept as long as the event is**, which is indefinitely, because
content is kept until the person deletes it. That is a defensible position and it
is other people's names, so the privacy policy says the actual answer rather than
implying a window that does not exist.

**Reconciliation.** A sync compares what Google returns for the window against
rows carrying that calendar's `source_ref` prefix. A row whose event Google no
longer returns is soft-deleted, which covers a deletion made elsewhere and the
tail of a series that a split shortened.

## Sync

One job kind, `calendar.sync`, owned by this service, not the model worker: it
talks to Google, not to Claude.

**Incremental by `syncToken`.** Google returns one per full read; the next call
passes it and gets only changes, including `cancelled` entries for deletions.
A `410 Gone` means the token is too old and the answer is a full re-read.

**A full window pass every night, separately**, and the delta is not trusted to
carry every removal on its own. The case that worries this design is a series
split: occurrences that fall outside a newly shortened `UNTIL` may or may not
arrive as `cancelled` in a delta, and this repository's own rule is to verify a
vendor's behaviour rather than infer it. Until somebody has watched it happen,
the nightly pass is what makes reconciliation true, and the delta is what makes
it fast.

**Scheduling is decoupled from success**, which is the trap in a self-
rescheduling job and the reason to say it out loud. Nothing in this codebase
re-enqueues itself today. Two failure modes follow if it is done naively:

- **A dead job ends the chain silently.** Five failed attempts on a Google
  outage marks the job `dead`, and if the next tick is only enqueued by a
  successful run, that connection simply stops syncing forever, looking healthy.
  So the next tick is enqueued **before** the work runs, not after it.
- **A stable `idempotency_key` ends the chain after exactly one run.**
  `enqueue()` does `onConflict().doNothing()`, silently. A key like
  `calendar.sync:<connectionId>`, which is the obvious choice for making the
  first enqueue safe against a duplicated OAuth callback, means every later tick
  is a no-op with nothing failed and nothing to look at. **The key carries the
  tick**, `calendar.sync:<connectionId>:<iso hour>`, so a duplicate within a tick
  collapses and the next tick is a different row.

**A supervisor, because neither guard is proof.** A daily sweep enqueues a sync
for any active connection with no queued or running `calendar.sync`. Cheap, and
it is the only thing that notices a chain that broke in a way nobody predicted.

**`needs_reauth` is a state, not an error.** A refresh token Google has revoked
is a person's decision, not a fault: the connection is marked, the sync stops,
and Settings shows a Reconnect row. Nothing retries into a wall.

**`is_shared` is re-derived every pass.** If Google now says the access role is
not `owner`, the calendar is forced back to shared, whatever it was set to. A
calendar can be given away or shared upstream after somebody marked it private
here, and an invariant checked only at write time goes stale silently.

**The jobs table grows and nothing sweeps it.** A sync every fifteen minutes per
connection is about thirty five thousand rows a year each, and `jobs` has no
`purge_after` and no purge handler, unlike every other table that grows. This
feature adds one: `done` and `dead` jobs older than thirty days are deleted, in
the same sweep `content.purge` already runs on.

## Writing

`AC-5`, `AC-5a`, `AC-5b`, `AC-7`, `AC-17`.

**One function decides outward-facing, server-side, and both a screen and the
model reach it through the same path.** The model is told the outcome; it never
supplies it.

```
outward = union(attendees before, attendees after) is non-empty
       OR target calendar is_shared
```

**The union is the point.** Removing every guest from an invited event sends
each of them a cancellation, and a test that read only the proposed state would
see no attendees and call it reversible.

**The ordinary Undo would silently break this, and that is a code change, not a
caveat.** `undoTurn` in `routes/dumps.ts` soft-deletes every `content` row whose
`derived_from_message_id` is in the turn, filtered by nothing else: not `type`,
not `source`. A calendar event created by a tool inside a dump turn is
indistinguishable to it. Pressing the ordinary Undo toast would delete the row
here and leave the event sitting in Google forever, which is exactly the
disagreement `AC-17` forbids. **`undoTurn` gains a `source <> 'calendar'` filter
and hands those rows to the path below**, and a test covers a turn that created
one.

**Reversible writes get the ordinary toast and an extraordinary Undo.** Every
other Undo in this product is a local soft delete; this one has to reach Google
inside the window, because the effect already left. So:

- Undo calls Google **first**, and only soft-deletes the local row if that
  succeeded. `AC-17`.
- If the Google call fails, nothing local changes and the line says the event is
  still in the calendar. offload and Google never disagree, and it does not
  diagnose which of the two of them was at fault.

**Outward-facing writes confirm first**, naming who finds out: the guests, or
the calendar. Per action, never batched.

### Recurrence

`AC-7`. Scope is an argument, never a question.

- **One occurrence**: `PATCH` that instance id. Google records the exception.
- **This and all following**: `PATCH` the series with `UNTIL` set just before the
  split, then `POST` a new series from the split with the new values.

Deleting follows the same two shapes. **Past occurrences are never touched.**

**A split is two calls and can fail between them**, leaving the old series
truncated and the new one never created: occurrences quietly disappear from
somebody's calendar. So the split is ordered **new series first, then truncate
the old**, which fails safe in the opposite direction, toward a visible
duplicate rather than a silent hole. A duplicate is obvious and fixable; a
missing standup is neither. The new series carries a deterministic
`iCalUID` derived from the original and the split point, so a retry recognises
its own work rather than posting twice.

*Knowingly unhandled: a series carrying single-instance exceptions, made in
Google, at dates after a split point. Recorded in the feature spec.*

## The tools

`AC-9`. Five, in `apps/agent`'s registry, structured per OFF-5.

`list_calendars` · `find_events` · `create_event` · `edit_event` · `delete_event`

**The three writes are not on the reversible allowlist as a class.** They are
reversible or confirmed per call, decided server-side. The tool schema carries
`scope` for recurrence and carries **no** field for confirmation, so there is
nothing for a model reading untrusted text to set.

**Untrusted text and the write tools are the risk this feature adds**, and the
mitigation is that no tool can act without the outward test, and the outward test
cannot be influenced by the model.

### An outward-facing write from the model has nowhere to wait, so one is built

`routes/tools.ts` executes every tool synchronously inside the turn and returns a
result. There is no pending state anywhere in this product, so "confirmed first"
had no meaning for a tool call: the write would either go to Google immediately,
which is the thing this whole section exists to prevent, or the model would be
told no.

**A proposal, and a person's tap.** An outward-facing write tool does not call
Google. It writes a `connector_pending_writes` row holding the whole intended
call, returns "waiting for them to confirm" to the model, and offload's answer
carries the proposal. Confirming calls `POST /api/calendar/pending/:id/confirm`,
which re-runs the outward test server-side against live state and then performs
the write. Declining deletes the row.

**Re-run, not trusted.** The test is evaluated again at confirmation time
because minutes may have passed and a calendar may have been shared in them.

**A proposal expires**, an hour, and expiry is a normal end rather than a
failure. An unconfirmed proposal has changed nothing anywhere.

**Reversible writes from the model still execute immediately**, which is most of
them: your own calendar, no guests. Nothing about the ordinary case gets slower.

*This is the one genuinely new mechanism in the feature and it is the price of
letting a model write outside offload at all. It is also reusable: Mail will need
the same thing and worse.*

## Untrusted event text

`AC-11`, `AC-11a`, `AC-11b`. Per event, by author.

```
untrusted = attrs.organizer.self !== true
```

An event you did not organise is untrusted **wherever it sits**, including your
own private calendar, because an invitation from a stranger is exactly that.

**Two consequences, and the second is a change outside this feature.**

1. Untrusted event text never enters a system prompt. It arrives as tool result
   content, which is where untrusted input already goes.
2. A memory derived from it carries `derived_from_untrusted`, **and something
   finally reads that column.** `plan_v2.md` currently says of a thread's
   memories: "Read them and do what they say." Today that is safe because
   `memories.ts` writes `false` at every call site and no source is untrusted.
   012 is the first feature that would ever write `true`. So this feature also
   splits the memory block in the prompt: rules the model follows, and, listed
   separately, things read from a connected app that it may cite and must not
   obey.

*Without that second half the flag is decoration and the two-hop path 001
described stays open. It is in this spec because this feature is what opens it.*

## Analytics

`AC-14`. Ids, counts, outcomes. `calendar_connected`, `calendar_sync_completed`
with counts, `calendar_event_written` with a scope and an outward flag.

**The earlier draft of this section was wrong and is worth correcting rather than
quietly fixing.** It claimed the event property types admit ids and enums only,
so a title could not be passed without failing to compile. `analytics.ts` types
`properties` as one `Record<string, string | number | boolean | null>` shared by
every event, so a title compiles fine. And the runtime guard lets the spec's own
example through: `assertNoContent` rejects an address, a URL, or anything over
sixty-four characters, and "Dr Osei biopsy" is fifteen characters of none of
those.

**The real control already exists and is not the type system.** `schemas/events/`
holds a JSON Schema per event with `additionalProperties: false` and a typed
property list, and `test/events.test.ts` compiles them with Ajv and validates
every event the code emits. A title in a calendar event's properties fails that
test. So each new event here ships with its schema in the same change, which is
what makes `AC-14` enforceable rather than aspirational.

**Mixed provenance combines by OR.** A memory drawn from a turn that touched both
a person's own words and a stranger's event is untrusted. Any untrusted
contribution taints the whole memory; there is no partial. Stated because it is
obvious to whoever writes it and invisible to whoever reads it later.

## The clients

**Settings, Connected apps** on all three. Calendar is the one live row; Mail,
Browser and Photos are listed as the kit draws them, with no action. Per
calendar: a thread, a shared toggle, and whether it reads at all. Disconnect
lives here and takes a confirmation, and removing what was filed is a **second**
confirmation. `AC-12`, `AC-16a`.

**First run, last screen, skippable.** After `completeOnboarding` has already
returned, so a bounce to Google cannot strand anybody mid-onboarding. `AC-16b`.
*The kit is being drawn; the flow and copy ship first and the screen catches up.*

**The OAuth round trip on a phone** opens a system browser and returns through
the app's scheme, which is the mechanism sign-in already uses.

## Principles that apply

- **OFF-4**: derived and discarded, with the reasoning and the exact field list
  in the feature spec rather than an assertion. `description` and conferencing
  are dropped; attendees are minimised.
- **OFF-6**: amended, and the amendment is recorded in `decisions.md`. A calendar
  write joins the reversible allowlist **conditionally**, which is a new shape
  for that list and is written as a condition rather than a verb.
- **OFF-7**: the kits' "offload never moves events" line changes in both phone
  kit files, with one `decisions.md` entry.
- **SEC-1**: the untrusted axis above, and the prompt change that makes it real.
- **QUAL-1**: the tests worth writing are the outward test's union across an
  edit, the recurrence split, `(account_id, source_ref)` idempotency, and that
  an unowned calendar cannot be marked private.

## Edge cases

| Case | Behaviour |
| --- | --- |
| No credentials configured | Calendar shows as not available. Nothing is offered. |
| Token revoked in Google | `needs_reauth`, sync stops, Settings offers Reconnect. |
| Calendar you can only read | Listed, marked, writes refused with one line. |
| Event deleted in Google | Reconciliation soft-deletes the row on the next sync. |
| Event outside the window | Not held. Reachable through `source_ref`. |
| All-day event | Date, not midnight. Flagged and rendered as a day. |
| Same calendar on two connected accounts | Two calendars. Named by connection. |
| Undo when Google is down | Nothing local changes. The event is still there and the line says so. |
| Disconnect | Sync stops, filed events stay. Removing them is a separate confirmed action. |
