# 029 WhatsApp

**Status:** drafted 2026-10-02 from the product owner's three rounds of answers of the same day and a read of Meta's WhatsApp Business Platform documentation and terms as of that date; revised the same day with the project-lead, client and security reviews and the owner's fourth round of answers
**Decision, 2026-10-02: not implemented.** The product owner decided to keep this as a product spec and not build it now. Nothing in the code, the privacy page or the design system changes for it. The spec stands as reviewed (project lead, client, security, and a passed constitution gate) so it can be picked up later; before then, re-check Meta's AI providers clause and service-message pricing, which were both moving when it was written, and write the impl-spec and tasks. The privacy page edits it calls for were drafted and taken back out, because the page may only describe what is built.
**Surfaces:** iOS, Android, web, the Core API and the agent plane
**Depends on:** 003 and 004, whose dump and turn a WhatsApp message becomes; 010, whose Connected apps page gains the row; 013, whose question classifier decides what is a question; 018, whose questions a filing turn can stop on; 020 and 021, whose photos and voice-note pipelines take a WhatsApp photo and voice note; 022, whose shared threads a filing can land in; 026, whose forwarded-words rules, link bound, note marking, first-run offers and 24-hour Undo this reuses
**Amends:** 026's rule that a forwarded part is somebody else's words, which gains a second channel; 026's rule that a mail turn is never classified as a question, which a WhatsApp turn does not share (below); 016's fetch bound, which reads a WhatsApp turn's own words alone; first run, which gains a step and one ordered list of offers; the phones, which gain universal links for three paths; `docs/tech/decisions.md`'s reversible allowlist, which names a WhatsApp turn beside a mail turn

## Why

A lot of what people want to keep arrives in WhatsApp: a plumber's quote, the school group's note about Friday, an address somebody sent, a voice note from a friend with the plan. Today getting it into offload means a screenshot or copying text out of one app into another, which is the friction offload exists to remove. Sending a message to yourself is already what people do instead, and it is where things get lost.

Forwarding to offload's own WhatsApp number keeps the habit and fixes the outcome. **A message you send or forward is a dump**, filed as anything typed into the composer is, and offload replies in WhatsApp with what it filed and a link to it.

## What

### Vocabulary

In anything a person reads the feature is **WhatsApp**, the verbs are **send** and **forward**, and offload's account there is **offload on WhatsApp**. What offload sends back is a reply; in this spec and in code it is a **receipt**. Tying a WhatsApp account to an offload account is **linking**, started with a **link code**. Nothing a person reads says connect, sync, bot, chat with offload or capture, and there is no noun for what a message became. In schema and code `messages.source` gains `whatsapp`.

### What this is, and what it is not

**WhatsApp is a way in, not a place to talk to offload.** That is the owner's call after reading Meta's terms, which since 2026-01-15 prohibit providers of "general-purpose artificial intelligence assistants" from the Business Platform where the AI is "the primary (rather than incidental or ancillary) functionality being made available for use, as determined by Meta in its sole discretion". offload's service is keeping what you dump; on WhatsApp it presents as exactly that:

- Everything sent is filed, through the same turn as the composer's.
- A receipt is **composed by offload from what landed and from fixed words, never written by the model**: a title, a thread, a link. No model prose leaves through WhatsApp. This is also what keeps a forwarded message from steering what offload says back to the person who forwarded it (SEC-1).
- **A question is answered in the app, not in WhatsApp.** When the person's own words are a question ("when's the dentist?"), the turn runs as it would from the composer and the answer appears in their conversation in offload; the receipt says *Answered in offload* with a link. The model's answer never travels to WhatsApp.
- **offload never writes first.** It sends only a receipt to a message the person just sent, inside WhatsApp's 24-hour window, so no message template is ever needed.

**If Meta turns the number off**, the WhatsApp row in Settings reads *Unavailable* with the line *WhatsApp isn't available right now.*, first run stops offering the step, and nothing already filed is touched. Nobody is told through WhatsApp, since offload cannot write first. This is the first way into offload that another company can close at its own discretion, and it is logged as such.

### Linking

**One WhatsApp account per offload account, and the other way round.** Linking takes two proofs: that the person controls the WhatsApp account, by sending a code from it, and that they mean this offload account, by confirming its name in WhatsApp. The second is what stops somebody generating a code in their own offload and talking somebody else into sending it.

1. In Settings or first run they tap **Link WhatsApp**. offload makes a link code, single use, valid for ten minutes, and opens WhatsApp on a chat with offload's number with a message already typed: *Link my offload: K7QM-4XZ2*. On the web this opens WhatsApp Web or the desktop app, which send as the same account. Under the button the page shows the code and offload's number, each with Copy, and how long the code has left, so a phone without WhatsApp, a desktop with WhatsApp Web never set up, or a link that fell through to a browser still has a way. *Get a new code* replaces it.
2. They tap send. offload reads the code from the message, wherever it is in the text and in either case, so an edited message still links.
3. offload replies **naming the account** with two buttons: *Link this WhatsApp to Jo's account?* **Link** and **Cancel**. Nothing is linked until Link is pressed, within the code's ten minutes.
4. Link replies *Linked. Send or forward anything here and it's filed.* Cancel replies *Not linked.* and spends the code.

The page shows *Linked* as soon as the person is back in offload: it reads the link afresh when the app comes back to the front, and when the web tab is shown again.

**What a link is keyed on is WhatsApp's own id for the person, not their phone number.** WhatsApp is rolling out usernames, and a person who turns one on may reach offload with no phone number at all. A message that carries no stable WhatsApp id is treated as a stranger's, never matched on a number. When WhatsApp tells offload a person's id has changed, because they changed number, the link follows it; nothing else moves a link. The page shows the number when WhatsApp gave it, the username when it did not, and *Linked* when it has neither.

- **A code that is wrong, used or expired** gets one reply, the same whichever it was: *That code didn't work. Get a new one in Settings.* A WhatsApp account gets five tries an hour, a code gets five tries in all, and failed tries across everybody are capped, after which tries are ignored. An account has one code at a time.
- **A WhatsApp account already linked to an offload account** is refused, with the same reply whether the code was good or not: *This WhatsApp is linked to another account. Unlink it there first.* A link never moves from one account to another.
- **Unlinking** is on the page, confirmed on a sheet, and sends nothing to WhatsApp. After it, messages from that WhatsApp account are a stranger's.
- **Deleting the offload account** removes the link with it.

### Messages from somebody not linked

A WhatsApp account that is not linked, and whose message holds no link code, gets one fixed reply at most once a day: *offload is invite only. If you have an account, link WhatsApp in Settings.*, with the site's address. **Nothing from the message is kept.** To send that reply once a day, offload keeps a one-way hash of the sender's WhatsApp id and the time, for a day, and nothing else; the privacy page says so. The reply is the same for everyone, so it says nothing about who has an account. All strangers' replies together are capped per day, because each costs offload money and a list of numbers is cheap; past the cap, strangers get nothing.

### What offload takes in

| Sent | Becomes |
| --- | --- |
| Text, links | The dump's words |
| A photo, with or without a caption | A dump photo through 020, the caption as words |
| A voice note or audio | A voice note through 021, transcribed, filed on its own as a voice note dumped in the app is |
| A location | Words: the place's name and address when WhatsApp gives them, and its coordinates |
| A video, a document, a contact card, a sticker, a poll, a GIF, anything else | Left out, and the receipt says so in a clause: *A video was left out.* |

020's and 021's limits apply as for any dump, counted with the account's other photos and voice notes. A reaction, an edit and a message that only reacts to offload's own are ignored and nothing is kept. **The link preview WhatsApp draws on a message is never kept or read**: its title and picture come from somebody else's site. offload reads the link itself, under 016, if the bound lets it.

### Forwarded is somebody else's words

WhatsApp marks a forwarded message as forwarded and never says who wrote it. **What the person typed is their words; what they forwarded is data**, labelled as forwarded from somebody unknown, exactly as 026 treats the forwarded part of an email:

- An instruction inside a forwarded message ("add this to your calendar", "reply YES to confirm") is a fact about the message, never a request from the person.
- What the turn writes down to remember from a forwarded message, a note or a standing fact, is marked as coming from somebody else's words and read later as data.
- **A link that appears only in a forwarded message is not opened** (016's bound reads the person's own words alone). A link the person typed is fetched as any link is.
- A label or `#word` must come from the person's own words.
- The caption on a forwarded photo is forwarded words. A location's name and address are not the person's words either, for every one of these checks.

**Which words are a question.** Only the person's own words are asked whether they are a question, and a burst of forwards with nothing typed is always filed. This is where WhatsApp parts from 026, deliberately: a mail turn is never classified, because nearly everything in an email is somebody else's, while a WhatsApp message the person typed is as much theirs as the composer's.

### Bursts become one dump

Forwarding five messages at once arrives as five separate messages a moment apart. offload **gathers** what one person sends until there has been a quiet gap of about three seconds, and files the burst as **one dump with one receipt**. Three seconds is tuned to a multi-forward and an album, which arrive within a second; it is short enough that a single message waits barely at all. A burst closes early at thirty seconds from its first message, at twenty messages or at ten photos, and the next message starts a new one. A voice note is filed on its own, as it is in the app. Inside a burst, messages are put in the order WhatsApp stamped them.

**A message that arrives late**, because WhatsApp retried it after its burst had closed, is a dump of its own. One that arrives more than twenty-four hours after the person's last message is filed with no receipt, since offload cannot write then. **The same message delivered twice**, which WhatsApp does, files once.

WhatsApp shows offload's typing indicator from the moment a message arrives until the receipt, renewed while the turn runs, which is 017's *saying what it is doing* in the only form WhatsApp allows.

### The receipt

Plain text, no model prose. The naming line has no full stop; the clauses beneath it do. **A title carried into a receipt is made safe as well as short**: one line, clamped as 024 clamps every string a person did not write for offload, with control characters, anything shaped like a link and anything shaped like a phone number taken out, because a title can be derived from a forwarded message and a receipt arrives looking like offload speaking. Links go whole, with WhatsApp's link preview turned off, so nothing is fetched from offload's site to draw one. Examples, with the ids shortened here only:

```
Dentist, Tuesday 15:00, in Health
https://offload.club/threads/4f9a…                     [Undo]

Three into Lisbon trip
https://offload.club/threads/77c1…                     [Undo]
A video was left out.

Three filed
https://offload.club/today                             [Undo]

A question about that in offload
https://offload.club/today

A calendar change is waiting for you in offload
https://offload.club/today

Answered in offload
https://offload.club/today

Nothing filed from that.                               [Try again]

Couldn't file that.                                    [Try again]

That's all for today. Send the rest tomorrow.
```

- **The first line names what landed and where**, built from the turn's result. One row: its title and thread. Several in one thread: the count and the thread. Across threads: the count alone.
- **The link opens what landed**: the thread, or the conversation in Today. On a phone with offload installed it opens in the app; otherwise in the web app. A link is ids only and opens nothing for anybody who is not signed in as a member: signed out, sign-in comes first and then the link's screen; signed in but not a member, Today opens with a one-clause toast, *That thread isn't yours.*
- **A question about that in offload** is the receipt when the turn stopped on one of 018's questions; the link opens the conversation, where the question is.
- **Undo** is a WhatsApp reply button, good for **twenty-four hours**, which is 026's window, and takes back the same things: the content rows, labels, notes and a calendar event the turn wrote, the calendar first. The message stays in the conversation, because it is the dump and Undo reverses the filing. A row changed since is left as it is. Pressing it replies *Undone.*; after a day it replies *Too late to undo here. Change it in offload.* with the link; a second press does nothing. A button only ever acts for the WhatsApp account its receipt was sent to and the offload account that account is linked to. **There is no Undo for it inside offload**, by the owner's choice: the person was in WhatsApp when it happened, and a filing is changed in offload as any row is.
- **When the account checks with the person before a change**, a calendar write waits in offload as it does for any dump, and the receipt says so with a link to Today. Anything that reaches another person always waits.
- **Try again** is 004's: it reruns the turn on the same dump.
- **Limits**: past sixty messages an hour or two hundred a day from one account, or past the daily model budget, messages are not kept, and one receipt a day says so.

**What it costs.** Since 2026-10-01 Meta charges for every message a business sends inside the 24-hour window, at the rate for the person's country. Gathering bursts keeps it to one receipt per thing sent, plus one per Undo or Try again. The impl-spec states the rate, receipts per account per day typical and at the cap, and the strangers' cap's worst day, and the first real invoice is checked against them before the number is offered beyond the owner.

### In the app

**The conversation.** A WhatsApp dump is drawn as the person's own message, since they sent it, with WhatsApp's mark and *WhatsApp* as its meta. A forwarded part is drawn beneath the person's words, marked *Forwarded*. Photos sit beneath it as a dump's photos do, and a voice note is 021's bubble. offload's own reply in the conversation is the turn's reply as for any dump; the receipt is not shown in the app.

**In a shared thread** it lands like any dump, which means the other members read what was forwarded. That is what pasting it would have done, and the privacy page says so.

**Deleting it** in offload deletes offload's copy. It does not delete anything from the person's WhatsApp, and Meta's copy is held as the privacy page states.

**No Activity row and no push.** The person was in WhatsApp when it happened and the receipt was the confirmation.

### Where it lives

**Settings, Connected apps.** A *WhatsApp* group under *Mail*, with one door carrying WhatsApp's mark: the linked number, username or *Linked* as its note, or *Not linked*, or *Unavailable*. It opens **WhatsApp**, on the phones a page one level down as Mail's is, on the web inline in Connected apps as Mail is drawn there.

Not linked:

```
WhatsApp
  Link WhatsApp                                    >
  Or send this to +44 7700 900000         Copy
  Link my offload: K7QM-4XZ2              Copy
  The code works for 9 more minutes.  Get a new code
How it works
  Send or forward a message to offload on WhatsApp and
  it's filed like anything else you dump.
  offload replies with what it filed. Questions are
  answered here, in the app.
```

The code rows appear once Link WhatsApp has been tapped; before that the page holds the one row.

Linked:

```
WhatsApp
  +44 7700 900123                             Linked
  Open WhatsApp                                    >
  Unlink
How it works
  (as above)
```

- **Link WhatsApp** opens WhatsApp with the code typed, through an ordinary `https` link that offload's server returns whole, so no client builds it.
- **Open WhatsApp** opens the chat with offload, with nothing typed.
- **Unlink** is a destructive row and opens 022's confirming sheet with the subject *Unlink WhatsApp? Messages you send there won't be filed.*, **Unlink** and *Cancel*.
- One spinner until the account has loaded, no skeleton.
- The Connected apps page's *Read only* line says offload never sends mail; it gains nothing, because a receipt is a reply to the person themselves, not something sent on their behalf.

**First run** offers it once, on the phones and the web, after Mail's step and before the calendar's, in the same layout: title *Forward from WhatsApp*, WhatsApp's mark, two lines, *Send it a message.* *Forward anything to offload on WhatsApp and it's filed.* and *Linked once.* *Your WhatsApp is the only one it files from.*, with **Link WhatsApp** as the button and *Not now* in the corner. Link WhatsApp leaves for WhatsApp and the step stays; coming back reads the link, and the step shows *Linked* with **Continue** when it is, or the code rows as the Settings page does when it is not. Not now moves on. **The order of first run's offers, and its dots, come from one list** the server returns per account, which both clients read rather than compute, so three offers stay in step on three surfaces.

### Universal links

The phones gain universal links (iOS) and app links (Android) on `offload.club` for exactly two paths: `/threads/<id>` opens that thread and `/today` opens Today at the conversation. Every other `offload.club` path, including every link already sent in a digest, an email or the marketing site, keeps opening the browser as it does today. A link only navigates; nothing is ever done by opening one. Tapped inside WhatsApp, whose own browser can keep an app link from reaching the app on Android, it is tried on both phones on a device.

### Where the code diverges from the design

No kit draws WhatsApp. Logged in `.claude/skills/offload-design/decisions.md` with **Design system impact** in the same change:

- Connected apps gains a *WhatsApp* group and page, drawn as Mail's are, with the code rows.
- First run gains the WhatsApp step, which stays on screen while the person is in WhatsApp and shows *Linked* on return.
- **WhatsApp's own mark** is drawn in the conversation, on the Connected apps row and on the first-run step, because it is what people recognise (owner, 2026-10-02). It is the first brand mark in the set, added as its own asset (`whatsapp.svg`), unmodified, in one colour drawn from the surrounding text alias rather than WhatsApp's green, so every colour stays a token. Checked against WhatsApp's brand guidelines at build time: the mark is not altered, it does not suggest Meta endorses offload, and the name is written *WhatsApp*. It is a filled shape where the set is strokes, so the phones' icon generator and `dead-icons.mjs` are run on it rather than assumed to take it.
- A forwarded part inside a dump's bubble, marked *Forwarded*.

### The privacy page

Approved in direction by the owner on 2026-10-02, before code; made before the number accepts a production message, and told to account holders as section 17 requires. Not made: the feature was not built. Every line below is one the page states today and this feature would make untrue, or one it has to gain:

- **What you give us**: messages you send or forward to offload on WhatsApp and what is kept of them; that offload keeps your WhatsApp id, and your number or username when WhatsApp gives them, to know a message is yours; that for somebody not linked it keeps a one-way hash of their WhatsApp id for a day and nothing from the message.
- **Who carries your words**: the page names three companies; **Meta** becomes the fourth, as the company that runs WhatsApp's Business Platform and carries every message between you and offload, including offload's receipts, which name what was filed and where. What Meta holds and for how long is written from Meta's own statement at the time: messages up to 30 days and media 7 as of 2026-10-02, or less with **No Storage**, which the page names only once it is confirmed on offload's number.
- **The one channel that carries words**: the page says a notification is the only channel that carries words, and only to your own phone. A receipt carries a title and a thread name to your own WhatsApp, through Meta. Reworded to say both.
- Anthropic, AssemblyAI and Voyage receive a WhatsApp message, its photos and its voice note as they receive any dump's.
- **Encryption**: photos and voice notes from WhatsApp are encrypted at rest as any dump's are, and the lines that list what is encrypted name them; their text is not (OFF-2).
- **Links**: *There are no public links* stays true; a receipt's link opens nothing without signing in as a member, and the page says so.
- Forwarding into a shared thread shows what was forwarded to the other members.
- WhatsApp's end-to-end encryption ends at Meta's servers for a business account; Meta reads the message to deliver it to offload.
- Deleting something in offload does not delete it from WhatsApp.
- The updated date and the consent version move.

### States

- **A message that arrives while core-api is down** is retried by WhatsApp; it files once when it gets through, late as above. A message whose photo or voice note can no longer be fetched from WhatsApp files without it, and the receipt says *A photo couldn't be fetched.*
- **A receipt WhatsApp will not deliver** is not retried beyond once; the filing stands and is in the app.
- **A message for an account mid-deletion** is treated as a stranger's.
- **A message while a link code is pending**, from a WhatsApp account that has not linked, without the code, is a stranger's.
- **Meta has turned the number off**: above.
- Every colour on the new rows is an alias and holds in both themes.

## Acceptance criteria

Arriving

- **AC-1** The webhook route verifies Meta's signature on the raw body in constant time before reading it; refuses an unsigned or wrongly signed request, and a payload for a business account or number that is not offload's; answers Meta's verification handshake only with offload's own verify token; captures no body in any log or error report; and acknowledges at once, gathering in the background, so WhatsApp does not retry what was received.
- **AC-2** A WhatsApp message id seen before files nothing, enforced by the database, not a read before a write; ids are kept long enough to cover WhatsApp's retries and then purged. Inside a burst, messages are ordered by WhatsApp's timestamp; a message arriving after its burst closed is its own dump, and one arriving outside the 24-hour window files with no receipt.
- **AC-3** A message from a linked WhatsApp account becomes part of one dump with `source = 'whatsapp'` in that account's conversation; a burst closes after a quiet gap of about three seconds, at thirty seconds, at twenty messages or ten photos, and files as one dump with one turn; a voice note files on its own.
- **AC-4** Text and links become words; a photo goes through 020 with its caption; a voice note through 021; a location becomes words; every other type, contact cards included, is left out and counted by kind for the receipt; reactions, edits and WhatsApp's link previews are ignored and nothing from them is kept.
- **AC-5** Media is fetched only from Meta's own host, with the token sent nowhere else, no redirect followed, bytes capped before buffering and the type sniffed, inside 020's and 021's limits.
- **AC-6** A message from a WhatsApp account that is not linked, holding no code, keeps nothing but the hashed id and time for a day, and gets the fixed reply at most once a day per WhatsApp account and not at all past the daily cap across all strangers.
- **AC-7** Past sixty messages an hour or two hundred a day per account, or past the daily model budget, messages are not kept and one receipt a day says so.

Linking

- **AC-8** Link WhatsApp makes one code per account, from a secure random source, at least forty bits in an alphabet without O, 0, I or 1, stored hashed, valid ten minutes, single use; the server returns the whole `https` link with the message typed; the page shows the code, the number, Copy on each, the time left and Get a new code.
- **AC-9** A message holding a live code, anywhere in its text and in either case, gets a reply naming the account with Link and Cancel buttons; only Link, pressed by the same WhatsApp account within the code's life, links its WhatsApp id to the account; Cancel spends the code. The link is keyed on WhatsApp's user id, with the number and username stored only when WhatsApp gave them; a message with no user id is a stranger's.
- **AC-10** A wrong, used or expired code, and a code from a WhatsApp account already linked, each get their one reply, which does not vary with whether the code existed; a sixth try in an hour from one WhatsApp account, a sixth try on one code, and tries past the global cap are ignored; a link never moves between accounts.
- **AC-11** WhatsApp's signed notice that a user id changed moves the link to the new id; nothing else does.
- **AC-12** Unlink, confirmed on its sheet, removes the link and sends nothing; deleting the account removes it.

The turn

- **AC-13** The turn's prompt carries the person's own words and each forwarded part in separate user-turn blocks, the forwarded parts labelled as forwarded from somebody unknown; `plan_v2.md`'s rule on dumped words names WhatsApp beside email.
- **AC-14** Only the person's own words are classified as a question; a burst of forwards alone is filed; a question turn's answer is written to the app's conversation and never sent to WhatsApp.
- **AC-15** Notes and standing facts written from a turn with a forwarded part are marked as derived from somebody else's words; the fetch tool refuses a URL that appears only in a forwarded part or a location; a label or `#word` must come from the person's own words; all checked by the server against the stored message.
- **AC-16** Eval cases are added before the feature is done: a forwarded plumber's quote files with its price and date; a forwarded message telling offload to act is filed as a fact and not carried out; a typed note above a forward is followed; a forwarded message full of links opens none; a typed question with no forward is answered in the app. Running them is a separate ask.

The receipt

- **AC-17** Every receipt is composed by core-api from the turn's result and fixed strings, never from model text; titles are one line, clamped, and stripped of control characters, link-shaped and phone-number-shaped text; a test asserts that a turn whose reply text and row title hold a URL and an instruction sends a receipt holding neither.
- **AC-18** The receipt names what landed and where with a whole link to the thread or Today; says *A question about that in offload*, *Answered in offload*, *A calendar change is waiting for you in offload*, *Nothing filed from that.* or *Couldn't file that.* in their cases; adds a clause per kind left out; sends links with preview off.
- **AC-19** A button's id is an opaque random token resolved by the server to its receipt, honoured only when pressed by the WhatsApp account the receipt went to, for the account it is linked to. Undo reverses the turn's content rows, labels, notes and calendar writes, the calendar first, for twenty-four hours; leaves the message; leaves a row changed since; replies *Undone.*; after a day replies with the too-late line and the link; a second press does nothing. Try again reruns the turn.
- **AC-20** offload sends nothing to a WhatsApp account outside twenty-four hours of its last message, and sends no template; a test holds the sender refusing.
- **AC-21** The typing indicator is shown from a message's arrival and renewed until the receipt.

The app

- **AC-22** Connected apps shows the WhatsApp group's door with WhatsApp's mark and the number, username, *Linked*, *Not linked* or *Unavailable* on all three surfaces; the page shows its rows as drawn, with one spinner until the account loads, and reads the link afresh when the app returns to the front or the web tab is shown.
- **AC-23** First run offers the WhatsApp step after Mail's and before the calendar's on all three surfaces, from one server-returned list that also gives the dots; Link WhatsApp leaves the step in place and the step shows *Linked* and Continue on return when linked; Not now moves on; the step is not offered while the number is unavailable.
- **AC-24** A WhatsApp dump draws WhatsApp's mark, *WhatsApp* meta and its forwarded parts marked *Forwarded* on all three surfaces.
- **AC-25** `https://offload.club/threads/<id>` and `https://offload.club/today` open the thread and the conversation in the app on both phones when installed, including tapped inside WhatsApp, and in the web app otherwise; no other path opens the app; signed out leads through sign-in to the link's screen; not a member opens Today with the toast; tried on a device.
- **AC-26** WhatsApp's mark exists as `whatsapp.svg` in the design set and both generated icon sets, drawn in one colour from an alias, `dead-icons.mjs` passes, and the four divergences are logged with their impact.

Privacy and logs

- **AC-27** No log line, trace, analytics event, `jobs.last_error` or error report carries a phone number, username, WhatsApp id, profile name, message text, caption, media, link code, receipt text or a body Meta returned on an error, on the way in or the way out; outcomes are enums; analytics carry `whatsapp_received` with the outcome and counts only.

## Done means

Every criterion has a test named in the impl-spec, the suites are green on all three surfaces, the privacy page edits are live and section 17's notice has gone before the number accepts production messages, a real WhatsApp account links from a phone through the confirm, a forward, a photo and a voice note from it land in production and file with a receipt whose link opens the app from inside WhatsApp, Undo from WhatsApp takes it back, a stranger's message gets the one reply and nothing else is kept, the first invoice matches the cost the impl-spec states, and the page and the first-run step are driven and screenshotted in both themes.

## Out of scope

- **offload in a WhatsApp group.** Meta's groups API exists but is capped at eight people, needs a verified badge and lets the business create the group, not join one; and watching a group is a model call per message.
- **Answers, conversation or asking back in WhatsApp.** Filing first, above.
- **A reply that quotes an earlier receipt** read as being about it. Corrections are made in offload.
- **Anything offload sends first**: reminders, digests, a confirmation of something done in the app, and every message template.
- **Documents, video and contact cards.** Nothing in offload reads the first two yet, and a contact card is somebody else's details, which the privacy page does not cover.
- **Edits and deletions in WhatsApp** reaching offload.
- **More than one WhatsApp account per offload account**, and WhatsApp Business app accounts sending as a team.
- **An Activity row, an Undo inside offload, or a push** about a WhatsApp dump.
- **A QR code** on the web for linking; the code rows cover it.
- **Universal links for any other path.**

## Before the build: the owner's

- A Meta business portfolio and an app, with a system user token holding the WhatsApp messaging permissions.
- A phone number that is not on consumer WhatsApp, can receive an SMS or a call, and is kept for good, since it is what people save as offload.
- The display name *offload*, and the business profile carrying `hello@offload.club` and the site, which also serves the escalation path Meta's policy asks for.
- Business verification, which raises the number's limits and is needed before the display name is reviewed.
- Whether **No Storage** is available to the number.

## Decided during planning

- **Linking by a code sent from the WhatsApp account, then confirmed in WhatsApp against the account's name**, not a phone number and a one-time password: it proves control of the WhatsApp account, costs nothing, needs no SMS company, keeps working for a person whose number WhatsApp hides behind a username, and the confirm closes the hijack the security review found. A link never moves; an already linked WhatsApp is refused.
- **Filing first**, after reading Meta's AI providers clause: receipts composed by offload, questions answered in the app, nothing sent first.
- **Bursts gathered into one dump** on a three-second quiet gap, for one turn and one receipt per thing sent.
- **Undo on the receipt for a day**, no Activity row and no Undo inside offload.
- **Photos, voice notes and locations** in; documents, video and contact cards out.
- **Strangers get one fixed reply a day**, capped overall.
- **Discovery in Connected apps and first run.**
- **Meta's Cloud API directly**, not a provider in between: no markup, and one company on the privacy page rather than two.
- **Universal links** on both phones for two paths, so a receipt opens the app.
- **WhatsApp's own mark**, in one colour from a token.
- **The privacy page names Meta**, with No Storage once confirmed on the number.

### Logged at merge

- `docs/tech/decisions.md`: the reversible allowlist names a WhatsApp turn, whose only outward message is a receipt to the sender inside the 24-hour window, whose Undo is on the receipt for twenty-four hours with nothing destroyed while it is offered, and whose linking and unlinking are confirmed and send nothing on the person's behalf. WhatsApp is logged as the first way in another company can close at its own discretion.
- `docs/tech/stack.md`: Meta's Cloud API as the WhatsApp provider.
