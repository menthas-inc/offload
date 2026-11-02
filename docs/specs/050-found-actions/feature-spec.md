# 050 Found actions

**Status:** drafted 2026-11-02 from the product owner's ask of the same day, after a screenshot of a venue contact was filed as an event and the number to call could be neither found nor tapped on the phones. Revised the same day after the project-lead, client and security reviews and the owner's seven planning calls (below). Ships in the same pull request as 020's 2026-11-02 amendment (tap to open, details in the sheet), as its extension: the on-device Call pill that amendment drew is replaced by this before it ships
**Surfaces:** iOS, Android, web, the Core API and the agent plane
**Depends on:** 044, whose actions, control, confirm, Remove and storage this widens from a PDF's links to what any dump says; 020, whose photo rows, viewer, `Text:` line and row-sheet details carry a picture's words; 021, whose transcript is a voice note's words; 026, whose mail body is a forwarded mail's words; 030, whose resolved place and directions link a Directions pill draws from; 041, whose clean copy's text is a PDF's printed words
**Amends:** 044's never-list, which drops *a mail or phone link* for Call and Email; 044's *Anything but a PDF* out of scope, which this feature is; 044's label rule, which moves from eval cases into code for every source, PDFs included; 020's AC-40 and AC-41 of 2026-11-02 (the on-device Call pill), replaced by this in the same change

## Why

A dump often holds the one thing you will do with it next: the number to call in a screenshot of a message, the tracking link in a delivery mail, the email the landlord asked you to write to, the number you said out loud in a voice note. offload reads every one of those words on the turn it files the dump. Today it writes them into the row's details and stops, so on a phone the move means opening the picture, finding the number, copying it and switching apps. 044 solved this for a PDF's links; this does it for what any dump says, with the same control and the same rule that offload never makes a destination up.

## What

### What an action is

044's: a short label and a destination, offered on a row so one tap goes where the person would have gone anyway. Three kinds offload chooses:

- **Open**, a web address (`http`/`https`): *Track parcel*, *Manage booking*, *View order*.
- **Call**, a phone number: *Call Dana*, *Call the venue*.
- **Email**, an email address: *Email the landlord*. It opens a draft in the person's mail app; nothing is sent.

At most **two** per row, and usually **none**. Each action records its kind, and everything that differs between kinds (glyph, what the pill shows, the confirm) follows the kind, never the scheme.

And one offload does not choose:

- **Directions**, on any row with a place offload resolved (030), drawn when the row is drawn from 030's own directions link to that place. It is not stored, not picked by the model and not counted in the two, so it appears as soon as the place resolves and follows the place when it is refreshed or corrected. 030's map callout and place sheet keep theirs.

### The label

Model-written, as 044's: sentence case, no en or em dash, at most 24 characters, saying what the tap does in the person's terms. **Checked in code, not only by eval cases**, for every source including PDFs: a label carrying a scheme, an `@`, a dotted host-shaped token or a run of four or more digits is refused and the action dropped. The only destination on screen is the one offload computes from the action itself.

### Where the words come from, and why offload cannot invent a destination

**Typed, said, mailed and PDF words.** Before the filing turn, offload gathers the web addresses, phone numbers and email addresses in the dump's words: what the person typed, a voice note's transcript, a forwarded mail's body as the turn reads it (026's clamp), and a PDF's printed text (044 already gathers its links). The gathering is deterministic: one strict pattern per kind, linear in its input, over a bounded number of bytes, deduped, and capped at 24 for the dump's words and 24 for each PDF, as 044's are. The set travels into the turn as numbered data behind a data label, as 044's does, and the model names an action by its number; a number outside the set yields nothing.

A spoken number often arrives as words. A transcript's run of digit words is read as a phone number only when it is one unbroken run of exactly 10 or 11 digits (*two one two five five five zero one four two*), or 8 to 15 led by *plus* (another country's number says its plus); *double*, *triple*, a pause word, a year, a price or a count is never read as one.

**A picture's words.** A picture has no text to gather until offload reads it, and offload reads it in the same turn that files it, writing what it read as the row's `Text:` line (020). So a picture's action has a weaker bound, chosen with the owner: **the destination must be one the same gathering finds in the `Text:` line of the row that carries that picture**: the model quotes it as it appears there, and offload keeps it only if gathering that line finds the same number, address or link. This is self-referential, and the spec says so plainly: the model writes both the transcription and the choice, so a picture built to inject a destination, or a misread digit, can satisfy it. What holds it is that the destination is always visible before anything happens (below) and the picture is one tap away. The owner accepted that over reading text on the device, which would mean a store build and nothing for the web or for mail.

**Which row carries an action.** A picture's actions ride only the row that carries that picture, bound to that row's `Text:` line. Typed, transcribed and mailed words may give an action to any row the turn files, bound by the turn's gathered set. A PDF's actions stay on the PDF's own row, as 044 has them; 044's deferral of the derived row stands for PDFs.

**Text is never an instruction** (041, 020, 026). Words telling offload to offer a destination produce nothing from that instruction.

### Which destinations become actions

The move the dump exists for, as the person would use it: the number to call back, the parcel to track, the booking to manage, the person to write to. At most one more that pays off on a phone.

Never, whatever the words say: anything 044 never offers (terms, privacy, unsubscribe, the issuer's home or social pages, marketing, reader software); a sign-in, confirm, verify, reset or one-click link, which carries an account in its address; a number that is not a phone number (an account, an order, a reference, a card, a booking code); a support line or address in a footer or signature that is boilerplate rather than the point; anything in a picture that is not for the person (another line in a group chat, an advert in a feed); anything from an identity document or a payment card, which 020 reduces to its kind and a first name.

### Forwarded mail

A forwarded mail is somebody else's words, and a phishing mail's number is in them. The owner's call: actions come from the whole mail, as from any dump the person chose to give offload, and two things make the source plain. Every pill shows its destination or confirms it, and Open's confirm names the sender: *From a mail from dhl.com. Open dhl.com?* The tap is the person's; offload fetches nothing. This is not 026's refusal to fetch a link from the forwarded part, which is about offload acting on a link, not offering one.

### Where they show

- **On the row**, under the title and meta, wherever a list draws the row as a row: the thread's lists and widgets, Today, Loose, a layout's list sections, and the content rows under a calendar's day. Not on a tile (a layout's gallery or a file tile), a calendar grid cell, or a search result, which open the row instead.
- **In the row's sheet** on the phones, in the details block 020 added, and in the row's edit modal on the web, which gains the actions with their Remove (the web's viewer already shows a picture's details).
- **In the viewer**, under a picture's details.
- **In the conversation**, as built for 044: under the attachment in the person's own turn, for a picture or PDF the turn filed. Typed, spoken and mailed dumps have no attachment there; their actions are on the rows.

The control is 044's pill, one component per client for every kind, replacing both 044's PDF pill and 020's interim Call pill: a neutral outline, a 44px hit area, sizes from the type tokens (so 044's PDF pills change size too), a glyph per kind before the label (`phone`, `mail`, `map-pin`), and 044's leaves-offload glyph after an Open.

### Showing the destination, and opening it

- **Call and Email show their destination on the pill**, after the label in secondary text: *Call Dana  +1 212 555 0142*, *Email the landlord  ana@flat.co*. The number is formatted by the client from the stored digits, and the address shown is the stored one. They open on the tap, with no confirm of offload's: the destination was on screen before the tap, the phone's call prompt or dialer places no call by itself, and the mail app's draft sends nothing. Where nothing on the device can open it (a tablet with no dialer, a computer with no mail app), the tap does nothing and the destination stays readable on the pill; offload says nothing about it.
- **Open keeps 044's per-tap confirm**, naming its source (*From the picture.*, *From your voice note.*, *From what you typed.*, *From the PDF.*, and for mail the sender) and the host computed on the client.
- **Directions** opens 030's link on the tap, as 030's own Directions does.
- The accessible name carries the label and the destination or host.
- offload opens, fetches and previews nothing itself, on any turn or tap. Schemes are `http`, `https`, `tel` and `mailto` only. A `tel:` is a `+` and digits and nothing else; a `mailto:` is one plain address with no `?`, `&`, `,`, line break or encoded form of any of them, so nothing can be prefilled into the dialer or the draft. Both are built by offload from the parsed number or address, and every rule is enforced where gathered, when chosen, when stored and on the client before opening.

### Removing a wrong action

044's author-only **Remove**, durable, with the row's Undo. Open keeps it in its confirm; Call and Email have it in the row's sheet on the phones and the row's edit modal on the web, beside the action. The viewer's and the conversation's pills have no Remove; the row does. Directions is not removable here, because it is the place's (030 corrects a place).

### What this is not

An action is not a row, a task, an event or a note; it is a shortcut on the row it was filed with (044). It is chosen once, on the filing turn, and not refreshed; editing a row's details does not add, change or remove one. Rows filed before this ships gain no Open, Call or Email: there is no backfill, and the interim Call pill never ships, since this replaces it in the same change. Directions, being drawn from a place, appears on old rows with a resolved place too.

## Volume and access

Actions are at most two small entries on an existing `content` row, written once on the filing turn; most rows have none. A heavy account files tens of dumps a day, so at most tens of action writes a day, never a separate read. They ride the row's existing envelope on every screen that already loads the row (thread, Today, Loose, the calendar's day, layouts, viewer, sheet, edit modal, conversation tail), never filtered, sorted or paginated on their own. The gathered set is capped at 24 per dump and lives only for the turn. Directions needs no read: every row's envelope already carries its resolved place (030).

## What it costs in privacy

Said before any code.

- **No new company and no new content to any company.** Every word gathered from is already on the filing turn's call to Anthropic. The gathered set adds the same words again, as numbered data.
- **Stored destinations.** A phone number, an email address or a link from a dump is kept on its row as an action, plaintext under OFF-2 as 044's links are, readable by accepted members of a shared thread and nobody else, gone with the row. The same words are already in the row's details; the action adds nothing to who can read them, and the action field adds nothing to the row's search text or embedding.
- **The policy.** Since the owner's rewrite of 2026-10-30 the page states intent rather than mechanism, which also removed 044's explicit clause. *The dates, places and other details it pulls out* covers a kept number, address or link, and offering one to tap is not a new use of data, so no line is made untrue. Checked again before the code ships.
- **Egress (OFF-1).** Events, logs, traces, error reports, crash breadcrumbs, captured page snapshots, a failed open, push payloads and calendar writes carry the count of actions on a row and their kinds, never a label or destination.

## Acceptance criteria

**Gathering and choosing**

- **AC-1** Before the filing turn, the web addresses, phone numbers and email addresses in the typed text, the transcript, the forwarded mail's clamped body and a PDF's printed text are gathered by linear patterns over bounded input, deduped and capped at 24 for the dump's words and 24 for each PDF, and travel into the turn as numbered data behind a data label; the model names an action by its number, and a number outside the set or a destination it wrote yields nothing.
- **AC-2** A transcript's unbroken run of 10 or 11 digit words, or 8 to 15 led by *plus*, is gathered as a phone number; *double*, *triple*, a broken run, a year, a price and a count are not. Unit tests, one per confusable.
- **AC-3** A picture's action is kept only on the row carrying that picture and only when gathering that row's `Text:` line finds the destination the model quoted; otherwise it is dropped.
- **AC-4** Typed, transcribed and mailed actions may ride any row the turn files; a PDF's stay on its own row.
- **AC-5** A row carries zero, one or two chosen actions; the common case is zero. Eval cases, each asserting yes or no: a screenshot of a message asking to call back yields Call; a delivery mail yields Open; a voice note saying a number to call yields Call; a typed dump with an address to write to yields Email; a PDF booking confirmation with a hotel number yields Call. A group chat screenshot whose number is someone else's, a receipt with a footer support line, an order number, a card, an identity document, a feed with adverts, a sign-in or reset link, and a mail whose only link is unsubscribe each yield none.
- **AC-6** Words in a picture, a mail, a PDF or a voice note telling offload to offer a destination produce no action from that instruction; one injection case per source.
- **AC-7** A label is refused in code, in the worker and again at the write, when it carries a scheme, an `@`, a dotted host-shaped token, an en or em dash or a run of four or more digits, or is over 24 characters; unit tests; the rule applies to PDF actions too.

**Showing and opening**

- **AC-8** One pill component per client draws every kind, replacing 044's PDF pill and the interim Call pill: a glyph per kind (`phone`, `mail`, `map-pin`, and `arrow-up-right` after Open), a 44px hit area, type tokens, no literal sizes.
- **AC-9** Pills draw on the row in the thread's lists and widgets, Today, Loose, a layout's list sections and a calendar day's content rows; in the phones' row sheet and the web's edit modal; in the viewer; and under a sent picture or PDF in the conversation. Never on a tile, a grid cell or a search result.
- **AC-10** Call and Email show the label and the client-formatted destination on the pill and open on the tap through the platform; a device with nothing to open them leaves the pill readable and says nothing.
- **AC-11** Open keeps 044's per-tap confirm, naming its source, and for mail the sender, with the host computed on the client.
- **AC-12** Directions draws on any row with a resolved place whose coordinates are current (030 keeps them thirty days and fetches them again when a map asks), from 030's link to those coordinates at render, not stored, not counted in the two, and opens on the tap.
- **AC-13** Schemes are `http`, `https`, `tel` and `mailto` only; a `tel:` is `+` and digits only; a `mailto:` is one address with no query, separator, line break or encoded form of them. Enforced at gather, choice, write and before opening, with unit tests per refused form (`*21*`, `#`, `,`, `;ext`, `%23`, `?bcc=`, `%0A`). offload makes no network call while showing or opening an action.

**Lifecycle, scope and privacy**

- **AC-14** Actions are produced inside the filing turn's Undo, read once, and not refreshed by later turns or by editing the row's details.
- **AC-15** The author removes an Open from its confirm and a Call or Email from the row's sheet or edit modal; removal is durable and Undo puts it back; the viewer's and conversation's pills offer no Remove.
- **AC-16** Scope, sharing, moving and deleting follow 044's AC-14.
- **AC-17** The action field adds nothing to the row's search text or embedding; no label or destination reaches an event, log, trace, error report, crash breadcrumb, page snapshot, failed-open report, push payload or calendar write; tests assert it.
- **AC-18** Labels and destinations never enter a later turn's prompt; the gathered sets are capped and live for the turn.
- **AC-19** 020's AC-40 and AC-41 are amended in the same change to point here, and the on-device detector is not in the shipped code.
- **AC-20** OFF-6's reversible allowlist in `docs/tech/decisions.md` names found actions (and 044's, which it never did).

## Where the code diverges from the design

One entry in the design system's `decisions.md` with **Design system impact**, in this change, naming the glyph files it uses:

1. 044's pill on every row type, in the row's sheet, the web's edit modal and the viewer.
2. A leading glyph per kind (`phone.svg`, added 2026-11-02; `mail.svg`; `map-pin.svg`), and the destination after the label for Call and Email.
3. No confirm for Call, Email and Directions; their Remove in the sheet and the edit modal.
4. The web's edit modal gains the row's actions, with Remove.

## Out of scope

- Text messages, WhatsApp, a calendar invite, a contact card, or any scheme but the four.
- offload composing, completing or correcting a destination. Directions is 030's own link to a place 030 resolved.
- Gathering from anything but the dump's words and a picture's `Text:` line: not a linked page (016), a note or a memory.
- Backfill.
- Adding or editing an action by hand (removing is in).
- More than two chosen actions per row.
- Reading a picture's text on the device.
- The derived row for a PDF (044's deferral stands).

## Decided during planning

With the product owner, 2026-11-02.

- **The PDF way**, over a detector on the device.
- **A picture's actions come from what offload read**, over reading text on the device; the self-reference and misread risk are accepted and held by showing the destination.
- **Every source**: screenshots and photos, voice notes, typed dumps, forwarded mail, and PDFs' printed text.
- **Links, phone numbers, email addresses and directions.**
- **Directions is drawn from the place**, after all three reviews showed a model-chosen one would usually be dropped and go stale.
- **Forwarded mail gives actions from the whole mail**, with the destination shown and the sender named.
- **This ships in the same pull request as 020's 2026-11-02 amendment**, replacing its Call pill before it ships.

Decided in review, not by the owner, and open to change: the destination shown on Call and Email pills (all three reviews: the web shows nothing on a `tel:` tap, and it holds the misread and injection risks), which is the owner's earlier choice for the Call pill; no Remove in the viewer or conversation; no pill on tiles, grid cells or search results.
