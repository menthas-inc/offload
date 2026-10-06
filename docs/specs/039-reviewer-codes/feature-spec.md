# 039 · A way in for store reviewers

Status: written 2026-10-05 for going-public item 21. The owner chose the
mechanism, a reviewer invite code; this spec is the smallest safe shape of it.
Amends 002: where they disagree about who can get in, this is current.

## Why

Apple and Google review the apps before they are listed, and both need a
working account. Getting in is invite only: an admin promotes an address, and
a sign-in for an address nobody promoted gets the no-invite screen (002 AC-5).
A reviewer signs in with their own Apple or Google account, often behind an
Apple relay address that nobody can know in advance, so an emailed invite
cannot reach them.

## What

**A code.** Staff create one in the admin panel, on the Waitlist page. It has
a note (*App Store review 1.0*), a number of uses (5 unless changed, at most
50), and a life (30 days unless changed, at most 90). The code is shown once,
when it is made, and only a hash of it is kept. A code can be revoked. The
owner pastes it into the review notes for both stores.

**Using it.** The reviewer signs in with Apple or Google as anyone would and
lands on the no-invite screen. Under its two buttons is *Have a code?*. It
opens a field and a *Use code* button. A good code lets that address in
exactly as an admin invite would, through the same promotion, and the screen
says *You are in* with one button, *Sign in*. Signing in once more with the
same account opens first run.

**What it does not do.** It never makes an account by a second route: the
code calls the promotion the Waitlist page calls. It never issues a session:
the second sign-in does, through the gate, which still links only a verified
address. It never lets in an address that did not just sign in: the proof is
the signed refusal 002 already carries back to the no-invite screen. It does
not reopen a disabled account.

**Where it works.** Anywhere the no-invite screen knows the address it
checked: the web, Sign in with Apple on an iPhone, and Google on Android.
Google on an iPhone and Apple on Android go through a browser whose refusal
the app cannot read, so the screen there has no address and offers no code.
The review notes say which button to use.

## Acceptance criteria

- **AC-1** Staff can create a code with a note, a number of uses and a number
  of days. The response carries the code once, as `XXXX-XXXX-XXXX` from a
  32-character alphabet (60 bits). Only its SHA-256 is stored. Creating it is
  audited as `code.created`.
- **AC-2** Staff can list codes (note, uses of the limit, expiry, state) and
  revoke one. Revoking is audited as `code.revoked`; revoking twice is
  revoking once.
- **AC-3** `POST /api/sign-in/code` with a good code and a live refused-sign-in
  proof promotes that address through `promote`, marks the account with the
  code that let it in, and spends one use, in one transaction.
- **AC-4** The limit is the database's. Concurrent redemptions of a code with
  one use left let exactly one address in. A check constraint holds
  `uses <= max_uses`.
- **AC-5** An expired, revoked, used up or unknown code is refused with one
  answer, `refused`, and spends nothing. Typing it in lower case, with spaces,
  or with O for 0 and I or L for 1 still works.
- **AC-6** An address that is already invited or active is told `in` and
  spends nothing. A disabled one is `refused` and spends nothing.
- **AC-7** Without a live proof the answer is `sign-in`, and nothing is read
  or spent.
- **AC-8** Tries are limited to 10 an hour per address and 20 an hour per IP,
  counted whether or not they succeed. Over the limit the answer is `refused`
  and nothing more is written.
  The limiter keeps HMACs, not addresses or IPs, is purged daily with the
  waitlist's, and an account's rows go when the account is deleted.
- **AC-9** The no-invite screen on the web and both phones offers *Have a
  code?* only when it knows the address. A refused code says *That code did
  not work.* beside the field; a lapsed proof says *Sign in again to use a
  code.* beside a *Sign in* button; success says *You are in* and *Sign in once
  more with the same account.* with a *Sign in* button.
- **AC-10** The phones keep the refusal's proof from the sign-in response in
  memory and send it with the attempt read and the code, so the address and
  the code work there as on the web.

## Out of scope

Codes per platform, a code entered before signing in, a code that also skips
first run, and showing on a person's page which code let them in (the column
is there for when it is wanted).

## Privacy page

Unchanged, checked 2026-10-05. offload stays invite only, a code is an invite,
nothing new is collected about a person, and no company receives anything new.
