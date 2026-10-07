# 026 Mail in

**Status:** drafted 2026-09-29 from the product owner's answers of the same day and `docs/tech/decisions.md`, *Mail comes in at one shared address* (2026-09-29); revised 2026-09-30 with the owner's second and third rounds of answers and the project-lead, client and security reviews
**Surfaces:** iOS, Android, web, the Core API and the agent plane
**Amended by 031 (2026-10-02):** the Mail row becomes a card on Connected apps, drawn whatever the calendar is doing, carrying the address with Copy and Add to contacts. The phones' Mail page stays for How it works.
**Amended by 033 (2026-10-03):** first run's Mail step is a card on Bring it all in, with Copy address and Add to contacts.
**Amended 2026-10-01, before shipping:** mail is received by **Resend**, not Cloudflare Email Routing. Cloudflare can route a subdomain only by onboarding the root domain, which adds its MX records to `offload.club` and would take `hello@offload.club` away from Google Workspace. Resend receives on one MX record for `to.offload.club` alone, calls a signed webhook, and keeps a received email for 30 days, in the United States; the privacy wording was re-approved for that. There is no Worker. Wherever this spec says Cloudflare or the mail Worker, read Resend and its webhook; the impl-spec's As built has the detail.
**Depends on:** 003 and 004, whose dump and turn an email becomes; 010, whose Connected apps page has carried a dead *Mail* row since it shipped; 012 and 019, whose calendar writes a mail turn may make; 016, whose link reading this bounds; 018, whose questions a filing turn can stop on; 020, whose photos pipeline takes an email's images; 024, whose Activity records every email; 025, whose Activity Undo this reuses
**Amends:** 024's Activity, which gains a `mail` kind carrying 025's Undo; 010's Connected apps page, whose *Mail* row becomes a door; 016's fetch, which gains a provenance check for a mail turn; `plan_v2.md`'s rule that everything in a dump is the person's words
**Amended by 041 (2026-10-07):** a forwarded PDF is no longer left out by kind. Up to ten are collected, a locked one is left out, and page 1 goes to the look, which claims PDFs first, two a message, before images; *A PDF was left out.* now names one that is locked or cannot be read, one kept past the second, or each one when the look could not run; one the look declines goes quietly, as a declined picture does. See `docs/specs/041-pdfs/`.

## Why

A booking confirmation, a school letter, a ticket, a receipt: the things people most want offload to keep arrive by email, and today the only way in is a screenshot or a paste. The kit has drawn a *Mail* row in Connected apps since 010, *So a confirmation files itself.*, and the built page lists it under *Not built yet*.

Reading an inbox through Google needs a restricted scope and an annual third-party security assessment. Forwarding needs nothing from anybody, works from any mail app, and keeps the choice where the product wants it: **an email you forward is a dump.** You chose to hand it over, so it is kept like anything else you dump (OFF-1), and it is not a connected inbox (OFF-4). That distinction is the whole design and the privacy page already draws it.

## What

### Vocabulary

**The address** is `over@to.offload.club`, one for everyone, read as "over to offload". In anything a person reads the feature is **Mail** and the verb is **forward**; an email is **an email**. Nothing says inbox, import, sync, connect or capture, and there is no noun for what the email became. In schema and code `messages.source` gains `mail`; `gmail` stays reserved for the Gmail API path this spec parks. The Worker is the **mail Worker**; the check is **the sender check**.

### Who can send

**Only the address the account signed in with.** An email is accepted when every part of the sender check holds:

1. **One signer, the sender's own domain.** A DKIM signature verifies, with its signing domain equal to the From address's domain or a parent of it. offload checks the signature itself and does not rely on the domain's published policy about forged mail, which for `gmail.com` is lenient. A signature carrying a body length limit is refused, since anything appended past the limit would verify. The signature must cover From, and cover the To or Cc header that names offload.
2. **One From, one address, and it is the account's.** Exactly one From header holding exactly one address. The address alone is compared, never the display name, after unfolding and decoding, case-insensitively and exactly as the account's email is stored: no `+tag` stripping, no Gmail dot folding, internationalised domains compared in their ASCII form, and a non-ASCII local part refused rather than normalised.
3. **Sent to offload, once.** `over@to.offload.club` is in a signed To or Cc, so a signed email somebody once received from the person cannot be replayed at offload. A signature already seen is refused forever, and one dated more than seven days ago is refused, so a copy of an email the person really did send to offload cannot be sent again by somebody else holding it.

Everything else is dropped on arrival: nothing is kept, and **nothing is ever sent back**, because a reply would tell a stranger whether an address has an account. When the check cannot be run at all, because the signing domain's key could not be fetched, core-api answers as if it were down: the Worker retries, and if the key still cannot be fetched the email bounces back to its sender. Nothing is written.

**Copying offload in works.** An email the person writes to somebody else with `over@to.offload.club` in Cc passes the same check and is filed. If the other person is also on offload and replies to all, their reply, quoting the first email, lands in their own account, because they sent it to offload too.

**Automatic forwarding is not supported.** A Gmail filter keeps the original sender's From, so it fails check 2, and Gmail's own confirmation email for a new forwarding address fails it too, so a filter cannot even be set up. A test holds a real filter-forwarded message failing, so a change on Google's side turns a test red rather than opening a door. The Mail page says so in one line.

**An Apple hidden email cannot send.** The address Apple relays for somebody who chose *Hide my email* is not the one their mail comes from. Their Mail page shows a note instead of the address, and first run does not offer the step.

**Mail from a work address, or any address but the sign-in one, is dropped with nothing written.** It cannot be told apart from a stranger's. The Mail page carries the expectation, naming the one address that works, because that is the failure people will actually have.

### Limits

- **An email over 25MB** in total is refused by Cloudflare before offload sees it.
- **Thirty accepted emails an hour and a hundred a day per account.** Past either, an email is dropped and one Activity row a day says so: *Too many emails today*, *Some weren't added. Forward them again tomorrow.* Every accepted email is also a model turn under the account's daily budget, as any dump is.
- **Parsing is bounded**, part by part: decoded size, nesting depth, number of parts, HTML length, image pixels, and time. An email that breaches a bound is treated as one that held nothing, below.

### What happens to an email

It becomes **one dump**, arriving in the person's own conversation as if they had shared it from Today: the planner files it, the turn runs, and everything the turn does it does under the same rules as any dump, with the same tools and the same ask-first test on anything outward facing. The owner chose this knowing that the forwarded part is a stranger's words and that an account with *check with you before every change* off lets a calendar write that reaches nobody else happen without asking; that write is undone from Activity as below.

**The turn knows it is an email.** It sees the subject, the original sender's name and address and the date it was sent, the note the person typed above the forwarded part when there is one, and the body, each in its own block and never concatenated. **The person's note is theirs** and is read as their words. **The forwarded part was written by somebody else and is read as data**, labelled with its sender: an instruction inside it ("add this to your calendar", "reply to confirm") is a fact about the email, never a request from the person. This is a third kind of words the filing prompt has not had, and its rule that everything in a dump is the person's own is amended to name it. An email usually carries more detail than a typed dump; the turn may file it as one row with the detail in its body, or as several rows when it holds several dated things, a flight out and a flight back. **What the turn writes down to remember** from an email, a note or a standing fact, is marked as coming from somebody else's words, so it is read later as data and never obeyed, as a note from a connected calendar already is. The email itself stays searchable, as any dump is.

**What is kept.** The whole text of the email, turned from HTML into plain text, and the images that matter, each through 020's photos pipeline. The text is the dump and is kept whole (OFF-1); what the turn reads is a copy with the quoted history beneath the forwarded message trimmed and clamped at a fixed length (OFF-8). The raw email, its headers and everything else attached is never stored anywhere by offload.

**Images, filtered hard.** Most images in an email are a logo, a signature, a banner, a social icon or a spacer. Two passes decide what is kept:

1. **Rules first.** Only the types 020 accepts. Left out: anything under 20KB, anything under 300px on its shorter side, anything wider than four times its height or taller than four times its width, and anything the HTML draws smaller than that. At most twenty images go on to the second pass.
2. **Then a look.** A small copy of each image that passed goes to the cheap model with one question, whether it is something the person forwarded the email for (a ticket, a boarding pass, a QR code, a receipt, a photo, a map, a document) or decoration. Only a yes is kept, at most ten, in the order the email held them. A no, or a look that fails, leaves it out.

**Attachments that are not images**, a PDF, a spreadsheet, a calendar invitation file, a zip, are left out and named in the Activity row by kind: *A PDF was left out.* PDFs are 027's.

**Nothing an email links to or embeds is opened on arrival.** Images the email loads from a server are never fetched, which is what a tracking pixel relies on, and links are text. **016's fetch refuses a link that appears in the forwarded part of an email and not in the person's own note**, checked by the server against the message rather than asked of the model: a link in somebody else's email can confirm, cancel or unsubscribe by being opened. A link the person put in their note, or asks about in a later turn, is fetched as any link is.

**In the conversation** the email is drawn as the person's own message, since they sent it: the `mail` glyph, its subject as the first line and *Forwarded* as its meta, and the kept images beneath it as a dump's photos are.

**In a shared thread** it lands like any dump, which means the other members read what the email said, including the original sender's name. That is what pasting it would have done, and the privacy page says so.

**Deleting it** deletes the email's text and images, as deleting any dump does.

### Telling the person: Activity

A forwarded email is processed while the person is somewhere else, so the turn's toast and its eight-second Undo happen on no screen. **Activity is where they see it and where they undo it**, the way 025 made it for a label nobody was watching. No email sends a push: 024's rule stands whole.

Every processed email writes one Activity row in the account's record, **never sent** (no words reach a push service), with the `mail` glyph:

```
Today
( ) Dentist, Tuesday 15:00, in Health                  9:41   Undo
    From an email, “Your appointment is confirmed”.
( ) Two into Lisbon trip, from an email                8:02   Undo
    “Booking LX3K9”, the flight out and the flight back. A PDF was left out.
( ) A question about an email                          7:40
    “Parents' evening”.
( ) An email couldn't be added                         7:15
    Couldn't confirm it came from you, so it wasn't kept.
```

- **The title names what landed and where**, from the turn's own result, in the words its reply used. The body quotes the subject in curly quotes, clamped as 024 clamps every string a person did not write for offload, then a sentence for each kind of attachment left out.
- **Tapping opens what landed**: the row, or the thread when several did.
- **Undo** is 025's control, 44px and outside the row's press, **for twenty-four hours**. It takes back everything the turn filed: the content rows, the labels it set, the notes it wrote, and a calendar event it wrote, which is removed from the calendar first as 012's Undo does. **The email stays in the conversation**, because it is the dump and Undo reverses the filing, not the forwarding. A row somebody has changed since is left as it is. After Undo the row reads *Undone*, drawn from a column as 025 does. After a day the row stays as a record without Undo and a wrong filing is fixed by hand as any row is: a filing is noticed the day it lands, where a label sort nobody asked for may not be, which is why 025's window is longer.
- **When the turn stopped to ask**, through 018, the title is *A question about an email* and tapping opens the question. 018 closes an open question on the conversation's next turn, so when it has been closed the tap opens the email in the conversation instead.
- **When it filed nothing**, because the email held nothing it could use or the turn failed, the title is *Nothing filed from an email*, the body the subject, and tapping opens the email in the conversation, where 004's *Try again* is.
- **An email that failed the sender check** writes a row only when its From is an account's sign-in email, in that account's record: *An email couldn't be added*, *Couldn't confirm it came from you, so it wasn't kept.*, with no subject, no sender and nothing else from the email, because anybody can write a From line and the row must not carry their words. **At most one an hour and three a day per account**, so a stranger cannot fill somebody's Activity. It opens the Mail page, which names the one address that works.

### Where the address lives

**Settings, Connected apps.** The *Mail* row leaves *Not built yet* for its own group and becomes a door, with the address as its note and no value, since nothing here is switched on or off. For an Apple hidden email its value is *Unavailable*. It opens **Mail**, on the phones a page one level down as the calendar's is, on the web a settings pane:

```
Mail
  over@to.offload.club                    Copy
  Add to contacts                           >
How it works
  Forward an email from jo@hey.com and it's filed like anything
  else you dump. Mail from any other address isn't accepted.
  Forward by hand. Automatic forwarding rules don't work yet.
```

- **Copy** puts the address on the clipboard and the toast says *Copied*.
- **Add to contacts** hands the system a contact card named *offload* with the address, so a mail app autocompletes it, and asks for no permission. The card is a static file on the marketing site. The phones open it in the system browser, which offers to add it to contacts; the web downloads it. The impl-spec confirms each platform on a device before it is relied on.
- The address the person signed in with is written in, so they know which one it has to come from.
- **An Apple hidden email** gets the note instead: *You signed in with an address Apple keeps private, so mail you forward can't be matched to you.* No Copy, no Add to contacts.
- One spinner until the account has loaded, no skeleton.
- The page's *What offload may do* line, *It never sends mail*, stays true and stays.

**First run** offers it once, on the phones and the web, as its own step after the calendar's, in the calendar step's layout: title *Forward what matters*, the `mail` mark, two lines, *Send it an email.* *Forward anything to over@to.offload.club and it's filed.* and *Only from your address.* *Mail from jo@hey.com is the only mail it accepts.*, with **Add to contacts** as the button and *Not now* in the corner. Adding the contact moves on; so does Not now. Not offered to an Apple hidden email, and the step dots count the steps this account is shown, not a constant.

### Where the code diverges from the design

Logged in `.claude/skills/offload-design/decisions.md` with **Design system impact** in the same change:

- **A `mail` glyph is added to the icon set.** There is none, and a missing icon name draws an empty circle and passes every gate but `dead-icons.mjs`.
- The mobile kit draws *Mail* under *Not connected* with *Connect*; it becomes its own group, a door with the address as its note.
- The web kit draws *Mail* as a card with a switch, *Watching for things you dump*; it becomes a door with no switch, since forwarding has nothing to turn on.
- The web kit's *What came from where* block is not built.
- The first-run flow gains a step and its dots are counted per account.

### The privacy page

Told to the owner in this spec, before code; made before the first email is accepted in production, and told to account holders as section 17 requires:

- Section 3, *What you give us*: email you forward, and what is kept of it and what is not.
- Section 5: an email's words, and small copies of its images for the look that decides which to keep, go to Anthropic as any dump's do.
- Section 6: Cloudflare's row gains Email Routing, which receives an email you forward and passes it to us. What they receive is the email; how long they hold it, including while they retry delivery when offload is unreachable, is written from Cloudflare's own statement and checked against it, not assumed.
- Section 6: the R2 row and the short version's encryption bullet name the images from an email alongside photos, screenshots and voice notes; the text of an email is not encrypted, as no text is.
- Section 11: forwarding an email into a shared thread shows its sender's name and words to the other members; copying offload in on an email to somebody who is also on offload means their reply-all, quoting you, lands in their account, where you cannot delete it.
- Section 12: an email travels to offload as email does, which is not encrypted end to end.
- The updated date and the consent version move.

### States

- An email that arrives while core-api is unreachable is retried by the Worker for about thirty seconds. If core-api still does not answer, the email is refused and the sender's own server returns it to them as undeliverable, so they know to forward it again. Cloudflare's Email Workers can only refuse permanently: a thrown error is reported to the sender as a permanent failure, not one their server retries (checked 2026-09-30, below). offload writes nothing in either case.
- An email for an account that is deleted, or mid-deletion, is dropped as if the address matched nobody.
- The same email delivered twice, by a retry, files once.
- Every colour on the new rows is an alias and holds in both themes.

## Acceptance criteria

Arriving

- **AC-1** Cloudflare Email Routing on `to.offload.club` delivers mail for `over@` to the mail Worker, which has no storage, queue or database binding, forwards the raw message to one public core-api route authenticated by its own secret with a signed timestamp, logs an outcome enum and nothing else, retries the forward for about thirty seconds and then refuses when core-api does not accept; every other address on the subdomain is rejected by Cloudflare. No route that accepts `INTERNAL_SERVICE_TOKEN` is publicly reachable.
- **AC-2** The inbound route refuses a request without a valid signature, with a timestamp outside five minutes, or replayed within that window; captures no request body in any log or error report; and caps the body at 26MB.
- **AC-3** The sender check accepts a real signed Gmail message and refuses each of: an unsigned message; a signature from another domain; a signature with a body length limit; a signature not covering From; offload named only in an unsigned To or Cc; two From headers or two addresses in one; a display name holding the account's address over another address; a `+tag` or dotted variant of the account's address; a non-ASCII local part; a signature seen before; a signature dated more than seven days ago; a filter-forwarded message. A key that cannot be fetched is answered 503, so the Worker retries, and writes nothing.
- **AC-4** A refused email writes nothing except, when its From is an account's sign-in email and the refusal is not temporary, one Activity row in that account's record, at most one an hour and three a day, carrying no text from the email and opening the Mail page.
- **AC-5** An accepted email becomes one message with `source = 'mail'` in the account's conversation, carrying its extracted text, subject, original sender and sent date, and one filing turn is enqueued exactly as for a dump; a second delivery of the same email files nothing; the raw message and its headers are stored nowhere.
- **AC-6** HTML becomes plain text and is stored whole; the copy the turn reads has the quoted history beneath the forwarded message trimmed and is clamped at a fixed length; remote images are never fetched; a test asserts no outbound request while an email with a remote image and a link is processed.
- **AC-7** Parsing refuses past a bound on decoded part size, nesting depth, part count, HTML length, image pixels and wall-clock time, and such an email is handled as one that held nothing.
- **AC-8** An account's thirty-first accepted email in an hour and hundred-and-first in a day are dropped, with one Activity row a day; every accepted email passes the daily budget check before its turn.

Images

- **AC-9** Images pass the rules (020's types, 20KB, 300px shorter side, four-to-one aspect, drawn size) and at most twenty reach the look; the look keeps only what it answers yes to, at most ten, in the email's order, and keeps nothing for an image whose look failed; a test holds a signature logo, a social icon, a banner and a spacer left out and a boarding pass and a photo kept.
- **AC-10** Every attachment that is not a kept or filtered image is left out and counted by kind in the Activity row.

The turn

- **AC-11** The turn's prompt carries the subject, sender, date, the person's note and the forwarded part in separate user-turn blocks, the forwarded part labelled with its sender as somebody else's words; the body the prompt carries is clamped at a fixed number of characters and the images at ten; `plan_v2.md`'s rule on dumped words names the third kind.
- **AC-12** Notes and standing facts written in a mail turn are marked as derived from somebody else's words and read as data thereafter; the email's message stays searchable.
- **AC-13** In a mail turn the fetch tool refuses a URL that appears in the forwarded part and not in the person's note, checked by the server.
- **AC-14** Eval cases are added before the feature is done: a confirmation email files with its date and detail; a two-leg booking files as two rows; an email whose body tells offload to act is filed as a fact and its instruction is not carried out; a forwarded email with a person's note follows the note; an email full of links opens none of them. Running them is a separate ask.

Activity

- **AC-15** Every processed email writes one never-sent Activity row with the `mail` glyph, a title naming what landed and where, the subject clamped in curly quotes, a sentence per kind of attachment left out, and a door to what landed.
- **AC-16** Undo is offered for twenty-four hours and not after; it reverses the turn's content rows, labels, notes and calendar writes, the calendar first, leaves the email and its images in the conversation, leaves a row changed since, and draws *Undone* from a column.
- **AC-17** A turn that stopped on a question writes *A question about an email*, opening the question while it is open and the email once it is closed; a turn that filed nothing writes *Nothing filed from an email*, opening the email.

Settings and first run

- **AC-18** Connected apps shows *Mail* as its own group's door with the address as its note, or *Unavailable* for an Apple hidden email, on all three surfaces; the Mail page shows the address, Copy, Add to contacts, the sign-in address and the two lines, or the relay note alone, with one spinner until the account loads.
- **AC-19** Add to contacts opens the contact card from the marketing site in the system browser on the phones and downloads it on the web, asks for no permission, and the card holds the name *offload* and the address.
- **AC-20** First run offers the Mail step after the calendar's on all three surfaces, not to an Apple hidden email; its dots count the account's own steps; Add to contacts and Not now both move on.
- **AC-21** The `mail` glyph exists in the design set and both generated icon sets, `dead-icons.mjs` passes, and the four divergences are logged with their impact.

Privacy and logs

- **AC-22** No log line, trace, analytics event, `jobs.last_error` or error report carries an address, a subject, a body, an image or an attachment name; sender check failures are an enum; analytics carry `mail_received` with the outcome enum and counts only.

## Done means

Every criterion has a test named in the impl-spec, the suites are green on all three surfaces, the privacy page edits are live and section 17's notice has gone before the route accepts production mail, a real email forwarded from Gmail on a phone lands in production and files, a forged one does not and writes the one row, Add to contacts is tried on both phones, and the Mail page and the first-run step are driven and screenshotted in both themes.

## Out of scope

- **PDFs**, read or kept: 027.
- **Any push about an email.** The Activity row carries the question.
- **Reading an inbox**: the Gmail API, search, watching new mail, and the security assessment they need.
- **Automatic forwarding** by filter or rule, until the forwarding headers are tested against Google's signature.
- **Sending addresses other than the sign-in email**, and so a way in for an Apple hidden email.
- **A per-account address.**
- **Any mail offload sends**: no replies, no confirmations, no bounces of its own.
- **The web kit's *What came from where*.**

## Decided during planning

- **One shared address, `over@to.offload.club`, on its own subdomain**, because the apex's mail is Google Workspace and routing through it would keep a copy of every email in the company's mailbox.
- **The sender check is ours, and sign-in email only.** Apple hidden emails see the note; added addresses wait.
- **A failed check writes a plain row, capped, carrying nothing from the email**, the owner's call over a silent drop, opening the Mail page.
- **Filed like a dump, with the same tools and the account's own ask-first setting**, the owner's call after the security review raised the unwatched calendar write. What bounds it: the forwarded part is labelled data, notes from it are marked, links in it are not opened, outward writes to other people still ask, and Undo sits in Activity for a day.
- **Text and images, images filtered hard by rules and then a look.** PDFs move to 027.
- **Confirmation lives in Activity**, never in a reply email and never a push; Undo there for twenty-four hours.
- **Cc is accepted**, with the same check.
- **Discovery is the Mail page, first run and a contact card.**

### Logged in `docs/tech/decisions.md` at merge

- The 2026-09-29 entry is updated from direction to built, with the sender check as specified here.
- OFF-6's reversible allowlist names a mail turn explicitly: its reversible actions are undone from Activity for twenty-four hours rather than from a toast.
- The Worker, its secret and how it rotates.
