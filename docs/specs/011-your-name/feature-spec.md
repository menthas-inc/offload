# 011 Your name, feature spec

**Status:** drafted 2026-09-07, revised after review the same day
**Surfaces:** web, iOS, Android

## Why

Nobody has a name. `accounts.display_name` has existed since 0001 and **nothing
has ever written one**. Better Auth maps its `name` field to that column, but
`user.create.before` always returns `false`, because an account exists only
because an admin made one: signing in *links* an identity to a row that is
already there, so the row the provider's name would populate is never created
and the name is discarded.

So every screen that shows who you are shows an email. The settings index draws
`?` in the avatar. A shared thread calls you **"Someone"**, which is the literal
fallback in `membersOf`. It reads like a bug because it is one, and it is
invisible until you look at the column.

## What

Three ways a name arrives, in the order somebody meets them.

**Signing in remembers what the provider called you, and shows it to you before
anybody else sees it.** Google and Apple both hand over a name and we have been
discarding it. It is stored, but not as your name: it goes in `provider_name`,
which **nothing reads but the account it belongs to**, and only to fill in the
field where you confirm it.

*That column is the whole design, and it exists because the alternative is
worse.* `display_name` is what everybody in a shared thread sees next to your
content. A name that went from Google straight there would appear beside your
work, for people who know you, without you ever having seen it. Usually
harmless. For somebody whose provider account carries a legal name, an old name,
or a name in a script they do not use with these particular people, it is not,
and they are the people least able to shrug it off. **Confirming is what makes
it public**, and confirming is a screen nobody gets past without answering.

*Not `accountLinking.updateUserInfoOnLink`, which Better Auth offers and which
writes straight to the name everybody sees, unconditionally: linking Apple to an
account that already signed in with Google would replace a name somebody set.*

*And not `account.create.before`, which is where this started. That hook fires
only on the link that creates an identity, so it would have covered a brand new
account and missed every account that already exists: they linked their provider
months ago and only ever reach `account.update.before`, which Better Auth hands
the tokens and no account id at all. It lives on session creation, which happens
on every sign-in and carries the account.*

**Everybody confirms it, on the way in.** The field arrives filled with what the
provider said and usually needs one tap. For a new account it is a screen of
first run. For an account that finished first run before there was a name to
give, it is the same screen on its own, on the next launch: no tutorial they
have already seen and no consent they have already given. **The gate is
`needsName`, not `needsFirstRun`**, because those two came apart the moment this
shipped.

When there is nothing to prefill, which is what Apple does when somebody
declines to share their name, the field is empty and has to be filled in.

**Settings changes it**, on the My account page, which is where the phone kits
already draw a tappable Name row.

### What ships

- A name on `/api/me`'s account, editable through one new endpoint.
- `accounts.provider_name`, and the write that fills it on every sign-in.
- A name screen on all three clients, prefilled: inside first run for a new
  account, on its own for an account that already exists.
- An editable Name row on My account, on all three clients.
- Three changes to the privacy policy. See below.

### The rules

**One to sixty characters, trimmed, and required once you have one.** Any
characters: people's names contain apostrophes, hyphens, accents, spaces and
scripts this product has no business having opinions about. Sixty because it is
past every real name and short of a paragraph.

**The backfill goes through the same rule**, not a path beside it. A provider's
value is trimmed and capped at sixty like anything else, and if nothing survives
the trim, nothing is stored. The column is unconstrained `text` and this value
reaches other people's screens, so it does not get to skip the check because of
where it came from.

**It cannot be cleared.** Once set, empty is refused with "A name cannot be
empty." The product handles a nameless account and draws it correctly, but that
is the state of an account nobody has got to yet, not somewhere to return to by
deleting a field.

**No uniqueness.** Two people may be called the same thing. A display name is
not an identity; the account is.

### What a name changes

It is not only yours to look at. `display_name` is what a shared thread's
members see on each other's content, and initials come from it, so changing your
name changes what other people see, on their next read, without asking them.

That is correct and worth stating: it is the same name in both places, and a
product where the name your co-members see is a different field is a product
with two names to keep in step.

**Two consequences, both accepted, both recorded so they are not rediscovered:**

- **Renaming is silent, and names are not unique**, so an account can take the
  name of a mutual connection inside a thread they already share. Narrow, since
  membership is invite-only and connections are mutual, and the alternative is a
  notification about a settings change. Accepted, not overlooked.
- **A name is untrusted text from another account.** Nothing reads it into a
  prompt today, and nothing may: whoever first shows a member's name to a model
  carries it as user-turn content, never concatenated into a system prompt.

### Not built

- **Editing your email.** An identity change with a verification flow behind it,
  and a different feature.
- **A name for anybody else.** No nicknames, no per-thread names.
- **Anything about the avatar beyond initials.** No uploads.

### The privacy policy needs three changes

`AC-10`. One is the source, and two are the ones the review found.

- **Section 3** says the email comes from Apple or Google "and whatever display
  name they pass along with it". A name **you type** is a source that sentence
  does not describe. Widened to say it comes from the provider or from you.
- **Section 6's** Apple and Google row says we receive your verified email
  address. After the backfill that is incomplete: we keep the name too, where
  today we throw it away.
- **Section 11, "Other people"**, says what a co-member can do and never says a
  co-member sees a name. That silence was accidentally true while every account
  was nameless and a shared thread said "Someone". It stops being true here, and
  it is the change with the most claim surface behind it: it is a new fact about
  what other people see.

**All three ship in the same change**, as 010's did. The page is true before and
after, and never in between.

## Acceptance criteria

**AC-1** Signing in stores the provider's name as a suggestion, on any account
that has no name of its own, whatever state it is in.

**AC-1a** That suggestion is **never** what another member sees. Only the
account it belongs to reads it, and only to fill in the field.

**AC-2** Signing in stops touching it once there is a name. Neither a later
sign-in nor **linking a second provider** replaces what somebody set.

**AC-2a** Linking a second provider to an account that already has a name leaves
that name alone.

**AC-3** Nobody reaches the shell without a name. A new account is asked inside
first run; an account that finished first run before this is asked on its next
launch, on the same screen with the tutorial and the consent left off. Both are
prefilled with the suggestion, and an empty prefill is a normal state, not an
error.

**AC-3a** A client installed before this can still finish first run. The name is
required by the screen, not by the endpoint: a build with no name screen sends
none, cannot be forced to update, and a 400 would leave it unable to leave first
run at all. A name the backfill already stored survives that completion.

**AC-4** My account offers the name as an editable field on all three clients,
showing the current one.

**AC-5** A name is trimmed, one to sixty characters, and any character is
allowed. **The backfill obeys this too**, and stores nothing when nothing
survives the trim.

**AC-6** Clearing a name is refused, with a message that says what happened and
nothing else.

**AC-7** Changing a name changes it everywhere it is shown, including the
avatar's initials and what other members of a shared thread see on their next
read. No client holds a stale copy of its own name after a change.

**AC-8** An account with no name still renders correctly everywhere, because
that is the state every account is in between signing in and confirming: the
email alone, `?` in the avatar, "Someone" on a shared thread.

**AC-9** The name endpoint is the account's own and nobody else's: it takes no
account id and writes only the session's.

**AC-10** All three privacy policy changes ship in the same commit as the field.

**AC-11** No event carries a name. Anything fired here carries ids and outcomes
only, per OFF-1, and `assertNoContent` does not catch this on its own: a name
under sixty characters looks nothing like an email or a URL and passes it.

## Depends on

- 010 for My account, which this makes editable.
- 002 for first run, which this adds a step to.

## Open

- **Everyone who already has an account will meet this screen on their next
  launch.** That is the point rather than a side effect, and it is the only way
  the alpha ends up with names at all.

- **Anybody already signed in gets an empty field, not a prefilled one**, and
  there is no way around it. The suggestion is read from the provider's profile
  during a sign-in, and a live session does not sign in again: sessions last
  thirty days and refresh without ever going back to Google or Apple. We
  discarded the name at the time and kept no token to ask with, which is OFF-2
  working as intended. So the alpha types its names, and the prefill starts
  working for anybody who signs in on a new device or after their session
  expires. Typing a name once is a small cost; holding a provider token so we
  could avoid it would not be.
