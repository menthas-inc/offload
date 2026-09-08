# 011 Your name, implementation spec

## Shape

One column that already exists, one new endpoint, one widened endpoint, and a
step in first run on three clients.

```
sign-in  ──► mapProfileToUser  ──► request slot ──► account.create.before
                (both providers)                     UPDATE ... WHERE
                                                       display_name IS NULL
                                                       AND state = 'invited'

first run ──► POST /api/onboarding/complete { consent, displayName }
                                     one transaction: name + state + consent

settings ──► PATCH /api/me { displayName }
```

**No migration.** `accounts.display_name` is `text` and nullable since 0001,
which is the shape this wants: null means nobody has set one.

## Volume and access

| Field | Value |
| --- | --- |
| Records per account | One column on one row. |
| Read pattern | Already read: `/api/me` per shell mount, `membersOf` and `authorName` per thread read. Nothing new. |
| Write pattern | Once at first run, then approximately never. |
| Sort and filter | None. Never queried by name. |

**Indexes:** none. Nothing looks an account up by name, and `AC` deliberately
has no uniqueness, so there is nothing to enforce. **Pagination:** not
applicable.

## Where the provider's name comes from, and where it lands

`AC-1`. Two separate questions, and both had an obvious answer that was wrong.

### It is read in `mapProfileToUser`, not from the ID token

Decoding `identity.idToken` is the first instinct and it **works for Google and
silently does nothing for Apple**, which is the worse half of the outcome:
Apple's ID token has no name claim. Apple sends the name once, in the form post
of the very first authorization, and Better Auth reads it from `token.user`.

The one place both providers agree is `mapProfileToUser`, which
`@better-auth/core` calls from each provider's `getUserInfo` with the name
already resolved. It maps nothing, because `user.create.before` always refuses
and the row those fields would land on is never created.

**It rides the request slot `attempt.ts` already opens.** `withAttempt` wraps
the whole Better Auth handler in `routes/auth.ts`, so `getUserInfo` and the
session hook are the same async context.

### It is written on session creation, not on account creation

`account.create.before` was the first home and it is wrong for the population
that matters. That hook fires only on the link that creates an identity: it
covers a brand new account and **misses every account that already exists**,
which linked its provider months ago. Those accounts only ever reach
`account.update.before`, and Better Auth calls that one
`updateAccount(linkedAccount.id, freshTokens)` with the provider id, the tokens
and **no `userId`** at all. It does not know whose account it is holding.

`session.create.after` runs on every sign-in, carries the account, and sits
after the profile has been read. It already had a caller doing exactly this
shape of work, `emitFirstSignInOnce`.

### It lands in `provider_name`, which nobody else can see

Migration 0022, one nullable column, and it is the whole reason this feature is
safe rather than merely convenient. `display_name` is what a shared thread's
members see; `provider_name` is read by exactly one query, `/api/me`, for the
account it belongs to, to fill in a field.

```sql
UPDATE accounts SET provider_name = $1
 WHERE id = $2 AND display_name IS NULL
```

`AC-2` is that second clause: once somebody has a name, offload stops having an
opinion about what the provider calls them, so a second provider linked later
and a hundredth sign-in are the same case. No read-then-write, so two concurrent
sign-ins are the same case as one.

**Trimmed and capped first** (`AC-5`). Nothing survives the trim, nothing is
written, and a name absent from the slot is logged, because an empty slot is
also what a broken async context looks like.

## One validator, three callers

```ts
/** A name as it is allowed to be stored, or null if there is nothing left. */
export function cleanName(raw: string | null | undefined): string | null
```

Trim, reject past sixty **after** trimming, return null for empty. Lives beside
`initialsOf` in `accounts/`, for the same reason that one moved there: the
backfill, first run and the settings endpoint have to agree, and three trims is
three chances to disagree about a trailing space.

The endpoints refuse what the backfill drops. That asymmetry is deliberate and
is `AC-5`: a person typing sixty-one characters gets told, and a provider
handing back something unusable is not an error anybody can act on.

## The endpoints

**`PATCH /api/me`**, body `{ displayName: string }`. Writes only
`currentAccountId(request)`'s row, which is `AC-9` and is how every other
authenticated route in this file already works. It takes no id, so there is
none to get wrong.

- **The trim is in the zod schema, not the handler**, so there is one way to
  refuse a name and one 400 shape. A handler that sent its own 400 needed a 400
  response schema, and that schema does not match the one Fastify's own
  validation failure produces, so a missing field serialised as a 500. The
  suite caught it. Trimming before the bound is what makes `"   "` a refusal
  rather than a stored blank.
- The clients catch the empty case before sending, so "A name cannot be empty."
  is the specific message rather than a generic failure (`AC-6`). The server
  refuses it either way.
- Returns the same `meResponse` shape as `GET /api/me`, so the client replaces
  its identity from the response rather than patching a field and recomputing
  initials locally. `AC-7`'s "no client holds a stale copy" is that return
  value: initials come from the server in one place, and one of the three
  clients guessing them is exactly what 010 moved them server-side to prevent.

**`POST /api/onboarding/complete`** gains `displayName` in its body, **optional
on the wire and required on the screen**, and `completeFirstRun` writes it in
the same `UPDATE` that flips state and records consent.

Required looked right and would have stranded people (`AC-3a`). A phone build
installed before this has no name screen, sends the two ticks and nothing else,
and cannot be forced to update: a 400 is an account that can never leave first
run. So the endpoint accepts the older contract.

**Absent is not empty, which is why the column is set conditionally.** Writing
null for a missing field would wipe whatever the backfill had already stored;
omitting the column leaves it, so an old client completes first run and still
ends up with the provider's name. An empty string that *is* sent is still
refused.

A pre-existing account is the exception and stays one (`AC-8`): it went active
before there was anything to ask.

## The clients

### One screen, two ways in

`AC-3`. The gate is `stillAsking(me)`, which is `needsFirstRun || needsName`, on
the web's `useMe` and the phones' launch route. Those two questions came apart
the moment this shipped: every account that existed had finished first run and
had no name.

**A new account** gets the name as a step of first run. **An account that
already exists** gets the same screen on its own, on its next launch, with the
tutorial and the consent left off: they have read one and given the other, and
showing them again would be asking twice. The button saves through
`PATCH /api/me` rather than `POST /api/onboarding/complete`, because there is no
onboarding left to complete.

Both prefill from `suggestedName`, never from `displayName`, which is null for
everybody who reaches this screen.

The phones hold a blank frame until the identity lands. Which screens somebody
needs is not known until then, and one frame of "Dump anything" for a person who
only has to confirm a name is a screen they never asked for.

### First run gains a fourth screen, and Skip lands on it

**And a `KeyboardAvoidingView`, which the kit could not have told us about.**
The field sits above the button that leaves the screen, and this app is edge to
edge, where Android ignores `adjustResize` outright: the window does not move
and the button ends up under the keyboard. `behavior="padding"` on both
platforms, which is the fix the waitlist screen already writes out in full and
the second time this has come up.

Tutorial, tutorial, tutorial, **name**, consent. The name goes *before* consent
so the flow still ends on the gate everybody has to answer, and so "Get started"
still means the same thing.

**Skip jumps to the name step, not to consent.** Skip has always meant "skip the
tutorial", and both screens that ask something sit behind it. A Skip that jumped
past a required field would be a dead end with a disabled button on the next
screen.

The field is prefilled with `me.displayName` when the backfill found one, and
empty when it did not, which is normal rather than an error (`AC-3`). Next is
disabled while it is empty, the same treatment consent already uses for an
unanswered tick.

**Three screens with nothing to fill in was the kit's rule and this is the
second thing to break it.** Consent broke it first, and for the same reason:
the rule is about not making somebody configure the filing before they have put
anything in. A name is not filing. Recorded in `decisions.md` with the consent
screen it sits beside.

### My account, on all three clients

`AC-4`. The Name row stops being a value and becomes editable. Both files carry
a comment saying "neither name nor email is editable here"; the name half goes
and the email half stays, with its reason.

`EditableRow`, beside `Row` in the same module on each client, rather than an
editing state inside `Row`: every static row would carry an async save, a draft
and an error it never uses. Same vocabulary, one more word in it.

- **Web**: the value becomes an input with Save and Cancel, in the row.
- **The phones**: the row expands in place. The kit's `SettingsDetail` draws a
  tappable Name row and does not say what tapping it opens; a pushed screen or
  a modal is more screen than one field needs, and the row already has
  somewhere to put it. The field is `NameField`, shared with first run and
  toned per platform the way `ConsentTicks` already is.

Saving calls `PATCH /api/me`, and the identity everything else reads is replaced
from the response.

### What updates without a reload

`AC-7` is a client-cache question, not a push question. There is no fan-out to
another member's open screen and none is being built: a shared thread reads
`accounts.display_name` live on every fetch (`membersOf`, `authorName`), so the
next read is already correct and no denormalised copy exists to migrate.

Within your own clients it is a cache question, and both had the same bug
waiting: the settings index and My account each call `useMe` and each fetch
separately, so a name saved in one would leave the other showing the old name
and the old initials. Both broadcast the identity the `PATCH` returned to every
mounted `useMe` instead: a window event on web, the mechanism `appearance.ts`
already uses for the theme, and a module-level listener set on the phones.

## The privacy policy

`AC-10`, three edits, one commit.

| Section | Change |
| --- | --- |
| 3 | The name comes from the provider **or from you**, not only from the provider. |
| 6 | Apple and Google's row gains the name to what we keep from them. |
| 11 | A co-member sees your name and initials on a shared thread. |

Section 11 is the one that matters. It is a new fact about what other people
see, it was accidentally true while every account was nameless, and it is
exactly the class of change CLAUDE.md says to raise before writing the code.

## Principles that apply

- **OFF-1**: `AC-11`. No event carries the name. `assertNoContent` would not
  catch it: a name under sixty characters looks like neither an email nor a URL
  and passes the heuristic, so this is a rule people follow rather than a check
  that fires.
- **OFF-3**: `AC-9`. The endpoint writes the session's account and takes no id.
- **OFF-7**: the first-run step and the in-place edit are both divergences from
  the kits and need `decisions.md` entries with a filled Design system impact.
- **QUAL-1**: the tests worth writing are the ones nobody exercises by hand:
  the backfill's where clause against an active account and against an account
  that already has a name, and the endpoint's refusal of an empty name.

## Edge cases

| Case | Behaviour |
| --- | --- |
| Provider sends no name (Apple, declined) | Nothing stored. First run asks with an empty field. |
| Provider sends a 200-character name | Trimmed, capped at sixty, stored. Not refused: nobody can act on it. |
| Provider sends only whitespace | Nothing stored. |
| Second provider linked later | Where clause matches nothing. Name unchanged. |
| Existing active account, no name | Not backfilled. Email everywhere, "Someone" on a shared thread, Settings sets one. |
| Name cleared in Settings | 400, "A name cannot be empty." Nothing written. |
| Two accounts, same name | Allowed. Distinguished by the account, not the string. |
| A name reaching a model | Nothing reads it into a prompt today. Whoever first does carries it as user-turn content. |
