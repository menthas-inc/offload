# 039 · A way in for store reviewers

Status: written 2026-10-05 for going-public item 21, and changed by the owner
the same day: the code is typed on the sign-in screen and redeemed by that one
sign-in, not on the refusal screen after a second one, and a switch turns it
off when the waitlist ends. Amends 002: where they disagree about who can get
in, this is current.

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

**Using it.** On the sign-in screen, under the waitlist line, is *Have a
code?*. It opens a field above the two providers. The reviewer types the code
and continues with Apple or Google as anyone would. Once the provider has said
who they are, a good code lets that address in exactly as an admin invite
would, through the same promotion, and the same sign-in carries on into first
run. No refusal, no second sign-in.

**How it travels.** With that one sign-in and nothing longer lived: beside the
token when a native sheet signs in (Apple on iPhone, Google on Android), and
in Better Auth's OAuth state, kept server-side for that attempt, when a
browser does (the web, Google on iPhone, Apple on Android). All four ways in
carry it.

**What it does not do.** It never makes an account by a second route: the
code calls the promotion the Waitlist page calls, and Better Auth then signs
in the invited account through the gate's own hooks. It never lets in an
address the provider did not verify. It does not reopen a disabled account.
An identity that is already in ignores it.

**A switch.** *Review codes* on the Limits page, on for now. Off, no client
draws *Have a code?* and sign-in ignores any code. It goes off when offload
opens past the waitlist.

## Acceptance criteria

- **AC-1** Staff can create a code with a note, a number of uses and a number
  of days. The response carries the code once, as `XXXX-XXXX-XXXX` from a
  32-character alphabet (60 bits). Only its SHA-256 is stored, with the staff
  member who made it. Creating it is audited as `code.created`.
- **AC-2** Staff can list codes (note, uses of the limit, expiry, state) and
  revoke one. Revoking is audited as `code.revoked`; revoking twice is
  revoking once.
- **AC-3** A sign-in that carries a good code, for a verified address that is
  not in, promotes that address through `promoteIn`, marks the account with
  the code, spends one use and records `code.redeemed` against the code's
  maker, in one transaction, and the same sign-in issues a session.
- **AC-4** The limit is the database's. Concurrent redemptions of a code with
  one use left let exactly one address in. A check constraint holds
  `uses <= max_uses`.
- **AC-5** An expired, revoked, used up or unknown code is one answer and
  spends nothing. Typing it in lower case, with spaces, or with O for 0 and I
  or L for 1 still works.
- **AC-6** An identity that is already invited or active signs in as always
  and spends nothing. A disabled one is refused as disabled.
- **AC-7** A code that does not work ends at the no-invite screen, whose
  refusal carries `reason: code`: it says *That code did not work.* and its
  outlined button reads *Try another code*, back to sign-in with the code
  field already open and focused.
- **AC-8** Tries are limited to 10 an hour per address and 20 an hour per IP,
  counted whether or not they succeed. Over the limit the code does not work
  and nothing more is written. The limiter keeps HMACs, not addresses or IPs,
  is purged daily with the waitlist's, and an account's rows go when the
  account is deleted.
- **AC-9** *Have a code?* sits under the sign-in screen's waitlist line on the
  web and both phones, and opens a field above the providers.
- **AC-10** The code rides with the native sheets' token requests and with the
  browser sign-ins' OAuth state; without a code nothing extra is sent. The
  phones keep the refusal's signed cookie from the refused response, so their
  no-invite screen can name the address and say a code did not work.
- **AC-11** `switch.review_codes`, on by default, is read by every client from
  `GET /api/sign-in/options`. Off, no client draws the entry and sign-in
  ignores a code: no account, no use spent, a plain refusal.
- **AC-12** An address the provider does not mark verified is never let in by
  a code.

## Out of scope

Codes per platform, a code that also skips first run, and showing on a
person's page which code let them in (the column is there for when it is
wanted).

## Privacy page

Unchanged, checked 2026-10-05. offload stays invite only, a code is an invite,
nothing new is collected about a person, and no company receives anything new.
