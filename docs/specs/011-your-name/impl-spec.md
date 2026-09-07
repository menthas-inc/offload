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

## Where the provider's name comes from, and why it is not the ID token

`AC-1`. The first instinct is to decode `identity.idToken` in
`account.create.before`, which already holds it. **That works for Google and
silently does nothing for Apple**, which is the worse half of the outcome:
Apple's ID token has no name claim at all. Apple sends the name once, in the
form post of the very first authorization, and Better Auth reads it from
`token.user` rather than the token.

The one place both providers agree is `mapProfileToUser`, which
`@better-auth/core` calls from each provider's `getUserInfo` with the name
already resolved: Google's from the ID token's `name` claim, Apple's from the
enriched profile built out of the form post. So both providers get a
`mapProfileToUser` that records the name and maps nothing.

**It rides the request slot that `attempt.ts` already opens.** `withAttempt`
wraps the whole Better Auth handler in `routes/auth.ts`, so `getUserInfo` and
`account.create.before` are the same async context, and the store gains a second
field beside the refused address. Two hooks in one request needing to share a
value is the same problem the slot was built for; a second `AsyncLocalStorage`
and a second wrapper would be the same mechanism twice.

**The write is one statement with the rule in the where clause**, in the idiom
`completeFirstRun` already uses:

```sql
UPDATE accounts SET display_name = $1
 WHERE id = $2 AND display_name IS NULL AND state = 'invited'
```

No read-then-write, so two concurrent sign-ins are the same case as one, and
`AC-2`, `AC-2a` and `AC-2b` are all the where clause rather than three branches
somebody has to keep in step. A second provider linked later reaches the same
statement and matches nothing, because by then the name is set or the account is
active.

**Trimmed and capped first** (`AC-5`), by the same function the endpoints use.
Nothing survives the trim, nothing is written.

**`account.update.before` is not involved, and cannot be.** A repeat sign-in
with an already-linked provider updates the identity row through
`updateAccount(linkedAccount.id, freshTokens)`, and `freshTokens` carries the
provider id and the tokens **and no `userId`**. That hook does not know whose
account it is holding, so it could not do this write even if it wanted to. It is
also not needed: the backfill's whole window is an invited account, and an
invited account's first sign-in is always the link that creates its first
identity, which is the create hook.

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

**`POST /api/onboarding/complete`** gains `displayName` in its body, required,
and `completeFirstRun` writes it in the same `UPDATE` that flips state and
records consent. One transaction, so an account that went through first run
after this cannot be active without a name, for the same reason it cannot be
active without consent.

A pre-existing account is the exception and stays one (`AC-8`): it went active
before there was anything to ask.

## The clients

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
