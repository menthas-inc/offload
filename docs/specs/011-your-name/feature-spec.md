# 011 Your name, feature spec

**Status:** drafted 2026-09-07
**Surfaces:** web, iOS, Android

## Why

Nobody has a name. `accounts.display_name` has existed since 0001 and **nothing
has ever written one**: Better Auth maps its `name` field to that column, but an
invited account already exists from the waitlist, so signing in *links* to a row
rather than creating one and the provider's name is thrown away.

So every screen that shows who you are shows an email. The settings index draws
`?` in the avatar. A shared thread will call you by your address. It reads like
a bug because it is one, and it is invisible until you look at the column.

## What

Three ways a name arrives, in the order somebody meets them.

**Signing in fills it if it is empty.** Google and Apple both hand over a name;
we have been discarding it. When an account has none and the provider gives one,
it is stored. **Never an overwrite**: a name you set is yours, and a later
sign-in must not quietly replace it with what Google thinks you are called.

*Not `accountLinking.updateUserInfoOnLink`, which Better Auth offers and which
is the wrong shape: it copies the provider's name unconditionally, so linking a
second provider later would silently replace a name somebody had set. The two
hooks in `auth.ts` that already strip the provider tokens see the verified ID
token, which carries the name, so the conditional version costs nothing extra
and lands in the one place that already looks at this.*

**First run asks, with that name already in the field.** Usually one tap. It is
the one moment somebody is already answering questions about their account, and
asking later means asking in the middle of something else.

**Settings changes it**, on the My account page, which is where the phone kits
already draw a tappable Name row.

### What ships

- A name on `/api/me`'s account, editable through one new endpoint.
- The backfill, in the auth layer, on sign-in.
- A name step in first run on all three clients, prefilled.
- An editable Name row on My account, on all three clients.
- A reword of one sentence in the privacy policy. See below.

### The rules

**One to sixty characters, trimmed, and required once you have one.** Any
characters: people's names contain apostrophes, hyphens, accents, spaces and
scripts this product has no business having opinions about. Sixty because it is
past every real name and short of a paragraph.

**It cannot be cleared.** Once set, empty is refused with "A name cannot be
empty." The product handles a nameless account and draws it correctly, but that
is the state of an account nobody has got to yet, not somewhere to return to by
deleting a field.

**No uniqueness.** Two people may be called the same thing. A display name is
not an identity; the account is.

### What a name changes

It is not only yours to look at. `display_name` is what a shared thread's
members see on each other's content, and initials come from it, so changing your
name changes what other people see, immediately and without asking them.

That is correct and worth stating: it is the same name in both places, and a
product where the name your co-members see is a different field is a product
with two names to keep in step.

### Not built

- **Editing your email.** An identity change with a verification flow behind it,
  and a different feature.
- **A name for anybody else.** No nicknames, no per-thread names.
- **Anything about the avatar beyond initials.** No uploads.

### The privacy policy needs one line changed

It says the email comes from Apple or Google "and whatever display name they
pass along with it". After this, the backfill makes that sentence *more* true
than it is today, because today we discard the name. But a name **you type**, at
first run or in Settings, is a source that sentence does not describe.

The line is widened to say the name comes from the provider or from you.
Nothing else about it changes: the same field, the same purpose, the same
retention. **It ships in the same change**, as 010's did.

## Acceptance criteria

**AC-1** Signing in stores the provider's name when the account has none.

**AC-2** Signing in **never** replaces a name that is already there, whatever
the provider says.

**AC-3** First run asks for a name, prefilled with whatever AC-1 stored, and
does not let somebody through without one.

**AC-4** My account offers the name as an editable field on all three clients,
showing the current one.

**AC-5** A name is trimmed, one to sixty characters, and any character is
allowed.

**AC-6** Clearing a name is refused, with a message that says what happened and
nothing else.

**AC-7** Changing a name changes it everywhere it is shown, including the
avatar's initials and what other members of a shared thread see, without a
reload.

**AC-8** An account that has no name and predates this keeps working: every
screen shows the email, and Settings offers to set one.

**AC-9** The name endpoint is the account's own and nobody else's: it takes no
account id and writes only the session's.

**AC-10** The privacy policy describes both sources of the name, and the change
ships in the same commit as the field.

## Depends on

- 010 for My account, which this makes editable.
- 002 for first run, which this adds a step to.

## Open

- **What a nameless existing account sees at first run.** It has already
  completed first run and will not be asked again, so it stays nameless until
  Settings or a sign-in backfill. Correct, and worth watching: it is the state
  every account in the alpha is in right now.
