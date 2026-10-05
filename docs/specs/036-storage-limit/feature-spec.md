# 036 · A storage limit per account

Status: reviewed, 2026-10-04. Clarified with the owner the same day, twice:
the limit is 1 GB; reaching it refuses new uploads and nothing else; deleting a
photo gives its room back; the person sees what they use in Settings on all
three; what you leave in a shared thread stops counting against you; deleting
photos one at a time is the way back for now; and the daily caps stay as they
are. Reviewed by the project lead, the client reviewer and the security
reviewer; what changed is at the foot.

## Why

Every photo and voice note is kept in R2 for as long as the account exists
(OFF-1, privacy page section 10). The daily caps from 020 and 021 bound how
fast an account grows, not how big it gets. This puts a ceiling on what one
account's uploads add to the bucket. It is not a ceiling on everything R2
holds for an account: each photo also has two smaller copies offload makes to
draw it, and an export is a full copy for 7 days, so the real footprint is
roughly twice the figure. At about $0.015 a GB a month the cap is a guard
against an outlier, not a saving.

The larger half is a defect found while planning this. **Deleting a photo has
never deleted the file.** The row goes, but the message the photo arrived on
still holds it, and messages are only removed by Undo or with the account. The
privacy page says anything you delete *goes from the live database and from
file storage as soon as you ask*. For photos that has been untrue since 020.
This spec makes it true; the page's words do not change.

## What

### The limit

- **1 GiB per account**, written *1 GB*, counting the files it uploaded that
  are still kept: photos and screenshots from the app and the web, pictures
  from forwarded email, and voice notes. The size counted is the file as it
  arrived. Nothing offload makes itself is counted.
- **The uploader carries it.** A photo in a shared thread counts against the
  person who dumped it, never against the other members.
- **What you leave behind is the thread's.** A photo whose every live row is
  in threads its uploader is no longer in, by leaving, being taken out or
  deleting the account, stops counting against them. Undo of the leave puts
  it back. This is what the privacy page already says happens to what you
  leave in a thread.
- **A per-person value.** The limit is one of 034's caps: the owner sets the
  default on Limits and can give one person their own on that person's page.
- **What it refuses.** A new photo or voice note that would take the account
  past the limit, as `429 {"error":"storage_full"}`. Text dumps, links and
  everything else keep working. A forwarded email is still filed; its pictures
  that would not fit are left out, as when the daily cap stops them. A
  refusal is written down in `limit_hits` like every other cap's, with no
  name, title or thread in it.
- **What it never does.** Nothing already kept is removed, thinned or aged
  out. An account already over the limit keeps all of it and cannot add more
  until it is under.
- **Two uploads at once can pass it by one file.** The check runs before the
  insert, as the daily caps' does: a cost bound, not a bill.
- **Unsent uploads count.** A photo uploaded for a draft that never went is in
  the bucket, and the hourly sweep that removes it is what gives the room back.

### Deleting a photo gives its room back

- **A photo row deleted** takes its photo when the person deleting it dumped
  it, or when its uploader has left the thread (only then may anyone else
  delete it, OFF-3). It goes on the row's own eight seconds and Undo brings
  both back.
- **Deleting a thread you are the last one in** takes every photo in it, on
  the thread's Undo window. Everybody else has already left, so all of it is
  the thread's.
- **Only if nothing else still shows it.** A photo another live row carries
  stays. And the purge checks again before destroying anything: a photo a live
  row carries at that moment is put back rather than destroyed.
- **The conversation stops drawing it too**, since it is the same file. A
  message whose only photo is gone draws no bubble; one that had three draws
  two. A dump that loses its only photo leaves the conversation with the
  reply under it, which names what is gone.
- **Undo of a dump** already takes its photos and voice note, unchanged.
  Archiving, a forwarded email's Undo (whose pictures stay with the email,
  026), account deletion and leaving a thread others are still in do to the
  file what they do today.
- **Voice notes** have no row and no delete of their own. Since 2026-10-05 one
  goes with the last row or note that came from its dump, below, as well as
  with Undo of the dump.

### What you delete is deleted

*Added 2026-10-05, the owner's decision after an audit found a deleted row
left its dump behind: the words, a voice note's audio and its transcript.*

- **A row or a note deleted takes the message it came from** once nothing
  else alive came from that message: its words, every file on it of any kind,
  a voice note's audio and the transcript, which is part of the message, and
  offload's reply under it, which names what is gone. One dump can make several
  rows and notes, so the message stays while any of them is alive, archived
  ones included. The same rule as a photo decides whose: the deleter dumped it,
  or its author has left the row's thread.
- **A row takes every file it carries**, of any kind, not only photos.
- **Deleting a thread you are the last one in** takes the messages its rows
  and notes came from, the same way, keeping any that a live row or note in
  another thread also came from.
- **All of it rides the delete's clock** and Undo brings all of it back. A row
  put back brings its message back whichever delete took it, so two rows from
  one dump deleted in turn and the first undone leave nothing missing.
- **The purge works through in batches** of 500 a run, booking the next run
  itself, so a delete of any size, thousands of photos with an account,
  completes. It no longer halts at a count (004 AC-12 is amended to match).
- **The room comes back at once.** What Settings shows and what the limit
  counts drop the moment the delete lands, not when storage catches up.

### Seeing it

- **Where.** A new section on the Privacy page of all three, after *Reaching
  the web* and before *Your copy*, in 031's section format: glyph tile
  (`image`), heading, caption. The phone kits draw a pressable *Files and
  photos, 128 MB* on a *Memory and data* page that was never built
  (`mobile_app/SettingsDetail.jsx`, `android_app/M3SettingsDetail.jsx`); the
  web kit draws nothing. Logged as a divergence.
- **Copy.**
  - Heading *Storage*, caption *Deleting a photo makes room.*
  - One row, *Photos and voice notes*, value *312 MB of 1 GB*. Not pressable.
  - Binary units. Under 1 GB whole megabytes, rounded down; from 1 GB,
    gigabytes to one place, rounded down, a trailing zero dropped: *0 MB*,
    *312 MB*, *1 GB*, *1.4 GB*. *0 MB* is a measurement, not an empty state.
    One function in `@offload/widgets` says it for all three.
- **States.** Read once when the page opens. Until it lands the row has no
  value. A read that fails leaves the value empty and the page's toast says
  *Couldn't load storage* with *Retry*, once. Nothing says why.
- **At the limit**, in the composer, one line where *Enough for today.* goes
  today: *Your storage is full.* The draft comes back as it was: a photo chip
  has its remove control and a voice note its Discard, and the text can still
  be sent. Phones already installed show *Enough for today.* for it, since
  they read the status alone; that is accepted.
- **The admin panel.** The cap is labelled *Storage* and shown in megabytes on
  Limits, a person's page and the audit log. On a person's page it sits
  beside their files with *of* the limit, not in the day's grid, since it is
  not a day's figure.
- **The privacy page gains one clause**, chosen by the owner after the
  build's security review: in section 11's shared-thread photo bullet, *If you
  leave, it stays with the others, and if one of them deletes it, it is
  deleted for you too.* Nothing else changes: a refusal is not retention, the
  limit's refusals are covered by *When a limit stops you*, and the deletion
  line becomes true rather than needing new words. The page's date and the
  consent version do not move, since moving them asks everyone to consent
  again for a clarification.

## Acceptance criteria

- **AC-1** An upload of a photo or voice note that would take the account's
  kept files past its limit is refused `429 {"error":"storage_full"}`, stores
  nothing, and writes a `cap.storage_bytes` hit. One that fits, up to exactly
  the limit, is stored as today. A retried client key is answered as before.
- **AC-2** The limit is `cap.storage_bytes`, 1 GiB by default, bounded from
  1 MiB to 1 TiB, a setting on Limits and a per-person override.
- **AC-3** What counts is the sum of the original sizes of the account's blobs
  that are not deleted, of every kind and from every route, claimed or not,
  less those whose every live row is in a thread the account is not an
  accepted member of.
- **AC-4** Forwarded email over the limit is still filed, without the pictures
  that would not fit, and the hit is written once for the email.
- **AC-5** A photo in a shared thread counts against its uploader only.
- **AC-6** Leaving a shared thread, or being taken out, stops the photos whose
  every live row is there counting against the leaver; Undo of the leave
  counts them again.
- **AC-7** Deleting a photo row whose photo the deleter uploaded, or whose
  uploader has left the thread, marks the photo deleted with the row's own
  `deleted_at` and `purge_after`; Undo restores it; a photo another live row
  carries is untouched; after the window the purge destroys the object in R2,
  and no thread or conversation draws it.
- **AC-8** Deleting a thread as its last member does the same for every photo
  its live rows carry and no live row elsewhere does, held until the thread's
  15 second restore window has passed, and its Undo restores them. Leaving a
  thread others are still in takes none.
- **AC-9** Archive, a dump's Undo, a forwarded email's Undo, account deletion
  and a leave do to a photo exactly what they did before 036.
- **AC-10** A deleted photo is never filed again by the settle that files
  unfiled photos.
- **AC-11** The purge puts back, rather than destroys, a condemned photo that a
  live row carries.
- **AC-12** `GET /api/me/storage` returns `{ usedBytes, limitBytes }` for the
  signed-in account only, with `Cache-Control: no-store`; unauthenticated is
  401.
- **AC-13** Privacy shows the *Storage* section with the row and caption
  above on iOS, Android and web, formatted by `storageFigure`, with the failed
  state.
- **AC-14** The composer on all three shows *Your storage is full.* on a
  `storage_full` refusal of a photo or a voice note, and the draft comes back.
- **AC-15** The admin Limits page, a person's page and the audit log name and
  format the new cap, and a person's page shows it as everything kept.
- **AC-16** A dump left with no text, no photo and no voice note leaves the
  conversation with its reply, since the reply names what is gone.
- **AC-17** *(2026-10-05)* Deleting the last live row or note derived from a
  message marks the message, every blob on it no live row carries, and the
  reply in its turn deleted on the row's clock; while another row or note
  from it is alive, the message is untouched. The purge removes the message,
  and with it the transcript, and destroys the audio in R2.
- **AC-18** *(2026-10-05)* Deleting a thread as its last member does the same
  for every message its live rows and notes came from that nothing alive
  outside it came from; its Undo restores them.
- **AC-19** *(2026-10-05)* Undo of a row or a note restores the message it
  came from, with the files and reply that delete took, whichever delete took
  the message.
- **AC-20** *(2026-10-05)* `content.purge` and `blob.purge` each remove up to
  500 a run per table and book another run when a batch was full; more than
  500 due is removed across runs rather than refused.

## Out of scope

- **Deleting a voice note, or a message, on its own.** Neither has a control
  today; each goes with the last row or note that came from it. Voice notes
  are small: 1 GB is roughly thirty hours of them.
- **A list of what takes the room, and a warning before the limit.** The way
  back is deleting photos from a thread's Files. The owner chose this on
  2026-10-04; logged as a known gap.
- **Counting renditions, exports or anything offload writes itself.**
- **Paying for more.** There is no billing.
- **Leaving as a way round the limit.** Two accounts can share a thread, dump,
  and leave, and the photos then count against nobody. Accepted by the owner
  for the invite-only alpha on 2026-10-04: it takes two people working
  together, and every account's files are on its admin page.

## What the reviews changed

- **Security.** The first draft let "the row's author" free the file; now the
  rule is the uploader, or a thread the uploader has left, which the owner
  then chose to make the thread's. The blob's clock is the row's, and the
  thread's restore window rather than its purge clock. The purge re-checks
  live rows (AC-11). `no-store` on the read. No privacy copy changes, stated.
  Not taken: excluding unclaimed mail pictures from the count. The look
  claims or drops them within the turn, which is seconds, and they are in the
  bucket meanwhile.
- **Client.** Status and body named; the shared formatter named with binary
  units; the glyph named from the set; voice notes' Discard named; read once,
  toast once; the admin figure moved out of the day's grid; the kit
  divergence logged.
- **Project lead.** The leave rule, the way back and the numbers went to the
  owner, who answered as above. The Why no longer claims an R2 ceiling. The
  route moved under `/api/me/` beside the export. An empty bubble is defined.
  Not taken: shipping the delete fix as a separate batch. It is what makes the
  limit survivable, it is tested on its own, and it shares the review.
