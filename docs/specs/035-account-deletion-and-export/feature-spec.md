# 035 · Account deletion and export

Status: reviewed, 2026-10-03. Clarified with the owner the same day: deletion is
at once with no way back, the confirmation is a typed word with no second
sign-in, the export holds everything the person can read, it is downloaded in
Settings and kept 7 days, and there is one every 7 days. Reviewed by the project
lead, the client reviewer and the security reviewer; what changed is at the
foot.

## Why

The privacy page says a person can export everything in one file readable
without offload, and can delete their whole account, which leaves the live
systems immediately and the backups within 30 days. Section 13 of the same page
admits none of its controls is built and offers to do them by hand. 001
specified what deleting an account destroys and what it leaves (AC-4, T21) and
nobody built it; export has never been specified at all.

Two things make this a launch item. A promise kept by email does not scale past
friends. And Apple and Play both refuse an app that creates accounts and cannot
delete them from inside the app; Play also asks for a web address where the
same thing can be started without the app.

Deletion is the half the stores need and it ships on its own. Export follows in
the same spec because the delete confirmation offers it.

## What

### Delete account

- **Where.** The account page on all three: under *Ending things* on the phones
  (`mobile_app/SettingsDetail.jsx`, `android_app/M3SettingsDetail.jsx`) and as
  the danger panel at the foot of Account on the web (`web_app/WSettings.jsx`,
  `SDanger`). The kits draw the row and the panel. The confirmation is not
  drawn and is specified here.
- **Copy, with no noun** (the kit rows still say *things*):
  - Shared threads row: *A shared thread belongs to everyone in it. Deleting
    your account takes away your access and what only you could see, and leaves
    what you added with the others.*
  - Delete row note, phones: *Everything only you can see goes with it. There's
    no undo.*
  - Web panel: label *Delete your account*, the same body, action *Delete
    account*.
- **Confirmation.** A sheet on the phones, each in its own platform's chrome
  from its own kit, and a dialog on the web. It says what goes and what stays,
  offers *Make a copy first* (the export), and holds one field labelled *Type
  delete to confirm*. The word is `delete`, matched trimmed and without regard
  to case; the field does not capitalise, correct or spell-check. The button,
  *Delete account*, is disabled until it matches. The field and the button
  both stay above the keyboard.
- **States.** In flight: the button reads *Deleting* with the one spinner, and
  the sheet cannot be dismissed. Failed: *Couldn't delete your account* and
  *Try again*. Offline: the button is disabled under the launch screen's
  *You're offline*. The last staff owner: *Hand offload's ownership to someone
  else first.*, with no retry. None of them says why.
- **What goes.** Everything only the person could read: threads nobody else is
  in and all they hold, their conversations and dumps, the notes offload keeps
  about them and about the people they named, their calendar connections
  (revoked at Google, not only forgotten), push registrations, connections and
  requests in both directions, blocks, shares they sent that nobody has
  accepted, their activity and every entry about them in other people's,
  their put-offs, suggestions and questions, every session on every device,
  any export, and the identity itself.
- **What stays.** What they added to a thread other people are still in, with
  the author shown as gone, exactly as when somebody leaves (OFF-3, 022).
  Photos and voice notes there stay openable by the others. Labels on such a
  thread stay. A share they had waiting is withdrawn. The members list no
  longer shows them.
- **What is kept without them.** The cost ledger keeps its rows with the
  account removed, since they hold no content. Usage counts already shipped to
  storage stay and can no longer be tied to anyone.
- **When.** At once. Backups hold it for up to 30 days.
- **A notice.** An email to the account's address says the account was
  deleted, so a deletion somebody else made does not pass unseen.
- **After.** Signed out everywhere, landing on the sign-in screen with one
  line above the buttons in the ordinary text colour: *Your account is
  deleted.* The same identity signing in later is a stranger and gets the
  no-invite screen.
- **On the web without the app.** `offload.club/delete-account` is a public
  page, the same for every visitor, that says what deleting does and what
  stays, and leads through sign-in to the confirmation. It asks for no email.
  It serves anyone who can sign in, which is an invited or active account. An
  address that is only on the waitlist, or an account that has been disabled,
  cannot sign in: the page says to write to `hello@offload.club`.

### Export everything

- **Where.** A new section, *Your copy*, on the Privacy page as built (which
  today holds only *Reaching the web*), in the section format of 2026-10-02:
  glyph tile, heading, caption. The kits place the row on pages that were never
  built.
- **One file.** A zip that opens without offload: a page per thread, the
  photos, screenshots, files and voice notes as ordinary files, the person's
  conversations, notes and people, and one machine-readable file of all of it.
- **Shared threads come whole**, each row naming who added it, or saying the
  author is gone.
- **States and copy.**
  - Idle: *Export everything*, note *One file, readable without offload.*
  - Making: *Making your copy*, the one spinner, no skeleton.
  - Ready: *Ready, 3 Oct*, a *Download* button, caption *Kept until 10 Oct*,
    and *Delete copy*.
  - Failed: *Couldn't make your copy* and *Try again*.
  - Within 7 days of the last request with no copy left: *Next copy from
    10 Oct*.
  - Expired: the row returns to idle.
- **Getting it.** Downloaded from the row while signed in. On the phones the
  file is saved through the system's own share or save sheet and is still
  there after the app is closed. Activity gains one entry, *Your copy is
  ready*; no push is sent.
- **One every 7 days**, counted from the request. The copy is destroyed 7 days
  after the request, when the person presses *Delete copy*, when they leave or
  are taken out of a thread it contains, and with the account.
- **A notice.** An email says a copy was asked for.

## Acceptance criteria

Deletion:

- **AC-1** The account page shows the *Shared threads* line and *Delete
  account* on iOS, Android and web, as the kits draw them, with the copy above.
- **AC-2** Delete is confirmed: what goes, what stays, *Make a copy first*,
  and a button disabled until `delete` is typed. Cancel and Back change
  nothing. On both phones the field and the button are visible with the
  keyboard up.
- **AC-3** After a confirmed delete no table holds a row for the account,
  except content, notes, labels and blobs inside threads with another member,
  which carry no author, and cost rows, which carry no account. Every column
  that refers to an account is named in the impl-spec with its fate, and a
  test fails when a new one appears without one.
- **AC-4** A thread the account was alone in is deleted with everything in it.
  A thread with other members loses the membership and key only.
- **AC-5** After the delete, every other member of a shared thread can still
  open every photo and voice note in it, including those the deleted person
  added. The same holds after leaving and after being taken out.
- **AC-6** A blob is destroyed in storage once nothing living references it.
- **AC-7** Calendar connections are revoked at Google. A failed revoke does
  not stop the deletion and is retried without the account.
- **AC-8** Every session stops working at once on every device, and no push
  or email other than the deletion notice is sent afterwards.
- **AC-9** The last staff owner is refused, with the line above.
- **AC-10** Signing in afterwards with the same identity finds no account.
- **AC-11** `offload.club/delete-account` renders the same for every visitor,
  takes no input, and leads through sign-in to the confirmation for an invited
  or an active account.
- **AC-12** Work in flight for the account ends without writing anything back
  and without an error anyone sees.
- **AC-13** The delete and the export request are refused from another origin
  and are never a GET or a form post.
- **AC-14** The usage pseudonym is destroyed with the account, by a named
  step.

Export:

- **AC-15** *Export everything* starts a copy and the row walks idle, making,
  ready, with the failed, waiting and expired states as above.
- **AC-16** The archive holds every thread the person can read at the moment
  it is made, their conversations, notes and people, and each blob as an
  ordinary file, readable with an archive tool and a browser.
- **AC-17** A row from a shared thread names who added it, and a row whose
  author is gone says so.
- **AC-18** The copy is readable only by the account that asked, through a
  signed-in request. In storage it is encrypted with a key storage never
  receives, and there is no link to it that works without a session.
- **AC-19** The copy is destroyed 7 days after the request, on *Delete copy*,
  when the person leaves or is taken out of a thread it contains, and with the
  account.
- **AC-20** A second request within 7 days of the last is refused by the
  server whatever the client sends.
- **AC-21** On both phones the downloaded file opens from the system's files
  after the app is closed.

Both:

- **AC-22** No event, log line, trace, job payload or error written by either
  flow carries content, a thread title or a file name (OFF-1).
- **AC-23** A notice email is sent when an account is deleted and when a copy
  is asked for, carrying no content.
- **AC-24** The privacy page describes both exactly as built: section 13's
  note no longer covers these two, the export lines state the 7 days and one
  every 7 days, section 10 says a member can take a copy of a shared thread,
  and the deletion lines say what is kept without the person.
- **AC-25** One entry in the design system's `decisions.md`, with **Design
  system impact** filled in, covers the confirmation, the destructive button,
  the danger panel in semantic tokens, and the export row's states.

## Out of scope

- *Forget everything*, and the kit's counts of content and storage.
- A grace period or recovery. Decided against, 2026-10-03.
- A second sign-in before deleting. Decided against, 2026-10-03. What that
  leaves: a stolen session can export or delete everything, and the only
  recovery from a deletion is a whole-database restore from the nightly
  backup. The notice emails are the mitigation.
- Self-serve removal from the waitlist, and for a disabled account. By email.
- Emailing the export or a link to it.
- Importing an export.
- The admin panel deleting an account (034). Admin confirms by typing the
  account's email and the product by typing a word; the difference is
  deliberate.

## What the reviews changed

- **Security, critical:** deleting the only holder of a shared thread's key
  would have left the others unable to open its photos. AC-5 and the fix reach
  leave and take-out too.
- **Security:** how the export is stored and served (AC-18), cross-origin
  refusal (AC-13), the notices (AC-23), the export dying on a membership change
  and on demand (AC-19), the pseudonym (AC-14), no input on the public page.
- **Project lead:** the list of what goes was 001's and missed everything
  since; waitlist and disabled accounts cannot sign in, so the public page
  cannot serve them; the cost ledger is kept without the account; deletion is
  shippable alone.
- **Client:** every missing state and its copy, the copy without *things*, the
  export's real home on the built Privacy page, how a phone saves a file, both
  7-day clocks counted from the request, the sign-in landing line, AC-25.

Not taken: destroying the export on every sign-out (security), since signing
out of one device is ordinary and the copy is behind a session anyway; and an
emailed one-time link for waitlist removal (project lead), which is a second
unauthenticated destructive path for a case email handles.
