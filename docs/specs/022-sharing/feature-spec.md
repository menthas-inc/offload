# 022 Sharing

**Status:** drafted 2026-09-21, revised 2026-09-22 with the product owner's answers and the three reviews
**Surfaces:** web, iOS, Android, the Core API and the agent plane
**Depends on:** 001, whose `thread_members` and `thread_keys` were built for this and have waited since; 002, whose key layers make sharing one small rewrap; 004 and 006, whose model actions this adds one to; 005, whose thread page draws the Share control dead; 010, whose Settings gains My people; 014, whose notes already carry an author and survive them; 018, whose Ask settles which Sam; 019, whose proposal on the reply is how a said share is confirmed; 020, whose fetch-and-cache is how a phone draws a mark

## Why

offload is for organising things alone or with other people, and the second half has never shipped. The thread page has drawn a dead Share control since 005 with a comment pointing here. The schema has had members, invitations that expire and a wrapped thread key per member since the first migration. The privacy policy has described, in public and at length, what happens to a shared thread when somebody leaves it or deletes their account. Everything around sharing exists except sharing.

The design side settled the missing piece on 21 September: how two people become connected in the first place. Sharing invites nobody in, so the only way in is an account that already exists, found by the one handle an account has, its email. From there the pieces that were already designed fall into place: a share sheet, a strip at the top of My threads, a person's page, and a generated mark so that a list of people is scannable before it is read.

## What

### Vocabulary

A **connection** is a person you can share with. It is mutual, and it outlives the thread you made it for. You **request** a connection and they **accept**; the word is never invite, because an invite to somebody who is not on offload cannot be sent. You **share** a thread with a connection and they **add it to their threads**; until then the share is **waiting**, and what the other person sees is an **invitation**, which is the kit's word for the strip and the screen and is used for a thread only. A member **leaves** a thread, or is **taken out** of it. You **withdraw** a request or a waiting share of your own, **remove** a connection, and **block** a person. Two different destructions never share a verb. A person's generated picture is their **mark**, `Avatar` in the design system. In schema and code the nouns are `connection`, `connection_request`, `block`, `pending_share` and `thread_member`, and a waiting share is a `thread_members` row in the `pending` state, which 001 already has.

**A person with no display name** is "Someone" wherever a sentence carries a name, which is what a thread member with no name is called today, and their initials are "?". Nothing invents a letter.

### Finding somebody

Accounts have no usernames, so an email address is the only handle there is. **Add a connection** is a screen with one field, "Their email address", and one full address, matched exactly and case-insensitively, returns one account or none. No partial match, no name search, no suggestions: a name search over real people is a directory whether or not it is called one, and an email is something you can only have if they gave it to you. It is reached from the share sheet's last row, New connection, and from nowhere else: sharing starts from a thread, and My people lists people rather than adding them.

- Empty: "You need their offload email", and under it, in one sentence, why there is nothing to browse: "Sharing does not invite anyone in, so there is nobody to look up who is not already here. Ask them which email they signed up with."
- In flight: one spinner in the field. Failed: "That didn't go through." with Try again. Rate limited: the same line, since the screen has nothing else to say.
- Found: one row, their name over the address **as the account stores it**, not as it was typed, with their mark and a **Request** button. Under it: "Priya decides whether to accept. Until then you cannot share anything with her, and she is not told what you wanted to share."
- Not found: "No offload account for that", and "Check the spelling. If they are not on offload, there is nothing here that can add them." A typo and a non-account look identical and no wording can distinguish them; that is the honest limit of the no-invite rule. A deleted or disabled account, and an account you have blocked or that has blocked you, is not found.
- Yourself, somebody already connected, somebody you have already asked, somebody who has already asked you: the row says so in place of Request ("That's you", "Already connected", "Pending since 4 Aug", or Accept and Not now as the card has them).

The lookup answers whether an address has an account, so it is **rate limited, 30 an hour per account**, answered no faster for a hit than a miss, and the found row is all a stranger holding your address can learn: your name and your mark. The privacy policy says so, below.

**A request carries no message and no thread.** One arriving as "wants to share Lisbon trip" would leak the thread's name to somebody who has not accepted yet. Requesting is outward facing (OFF-6): the Request button is the confirmation, and there is no Undo. An account may have **50 requests outstanding** at once.

### Answering

A request arrives as a card, the kit's `PendingInvite` with two chips on their own line, **Accept** (moss) and **Not now** (outlined): "Behrooz A wants to connect". It sits at the top of Settings and at the top of My people, and nowhere else. A connection request is answered on the card; there is nothing to preview beyond what the card already says. The card's mark opens the person's page, where More holds Block, so the one person you may need to block is one tap from the card.

- **Accept** connects you both, at once. The card goes. A failed Accept: "That didn't go through." on the card with Try again.
- **Not now** takes the card away and leaves the request pending. It is not No and it is not a block. The person who asked sees nothing change, and the card does not come back on its own: only a fresh request from the same person brings it back.
- **Nothing tells anyone their request was declined.** A decline looks exactly like silence, which is the only version that does not turn a no into a notification.
- A request that is not accepted **expires after 30 days**, silently on both sides.
- **One request per pair at a time.** While one is pending the client shows "Pending since" in place of the button and the server refuses a second. After it expires or is withdrawn the same person may ask again, and never sooner than **seven days** after their last request, so the card can return at most once a week and only if the requester keeps withdrawing and asking, which is the bound the server enforces rather than the design.

### The dot

One signal, in two places: the gear in the app bar, beside the bell, on the screens that draw that bar, and the My people row inside Settings. It is the 8px clay dot the design gives `IconButton`, inside its 1.5px paper ring, at the top right of the glyph; the code's bar draws bare glyphs and gains the dot on the gear glyph in the same place. The My people row's lead takes the same dot. On the web it is the sidebar's Settings item and the same row.

**Only a request needing your answer dots anything.** Your own pending requests do not, because nothing is waiting on you, and a waiting share is the strip's job. A request you answered Not now to does not dot anything either. There is no notifications page.

### My people

A Settings page, in the You group beside My account, as the kit ships it, with the count of your connections as the row's value when there are any and no value when there are none. On it:

- The incoming request cards, if any.
- **Connected**: every connection, one `PersonRow` each, 32px mark, their name, and the threads you share with them as the note ("Lisbon trip, Berlin in March", the two most recent and "and 3 more"), or "Nothing shared yet" for a connection who shares nothing, which is a common state since a connection outlives the thread you made it for. The kit labels this group *Sharing with you* and gives such a person no row at all; the design's own note asks for the second label.
- **Pending**: your own outstanding requests, "Priya Raman · Pending since 4 Aug", with the mark the shipped row lacks and **Withdraw** as the row's value. Tapping the row opens one confirmation, "Withdraw the request to Priya?" with Withdraw; the other person's card goes with it, silently. The kit's value is *Remove*, and Remove now ends a connection, so the row takes the verb for what it does. This is the only place your outstanding requests are listed.
- **Blocked**: the row the kit ships at `value="None"`, with the count as its value once there is one, opening a list of people you have blocked with Unblock on each row.

The kit's *Defaults* toggles are not drawn. "Let people add to my threads" would be a second permission in a product that has exactly one, and "Tell me when someone opens a shared thread" is a notification, which does not exist yet.

### A person

**Every mark is a door.** Tapping a person anywhere, a row's lead on My people, a face on a thread's pane head, the lead of a row in the share sheet, a request card, a row in the @ list, opens their page, the kit's `PersonScreen`: their mark at 52px beside their name, "Shares 3 threads with you" under it, and **Shared with Ana**, the threads you are both in, each opening the thread. A connection who shares nothing gets the honest empty state in place of the list: sharing starts from a thread, not from a person, so "Open a thread and tap Share to bring Ana into it."

The kit's *Waiting on you*, *Waiting on Ana* and *What offload knows* sections are not drawn: nothing writes who a row is waiting on and nothing writes a memory about a person yet. They arrive with those features and cost a section each.

The page opens for anybody you can see: a connection, somebody with a request open in either direction, a member of a thread you are in, who need not be a connection of yours, and somebody you have blocked. For a person who is not a connection the line under the name says what they are to you: "In Lisbon trip with you", "Asked to connect", "You asked to connect", "Blocked". A face whose person can no longer be seen, because they removed you a moment ago, opens nothing and the row says "Not here any more." **More** holds what applies and nothing else, because nothing else on the page is destructive: **Remove connection** for a connection, **Block** for anybody not blocked, **Unblock** for somebody blocked.

### Removing a connection

From the person's page. A confirmation, and the copy is load-bearing:

> **Remove Ana Duarte?**
> You will not be able to share anything new with her, and she will not be able to share with you. The 3 threads you already share stay as they are.
> *the two most recent, listed, and "and 1 more"*
> Leave a thread from its own More menu if you want out of it.
> Cancel · Remove

**Removing a connection leaves shared threads untouched.** A thread with three people in it has nothing to do with whether you and one of them are connected. The threads are listed so you leave knowing exactly what is still shared, and the second sentence must not be cut: "removed" does not mean "no longer shares things with me". A waiting share between you, in either direction, is withdrawn, since it was a promise the connection made.

Removal is **mutual and silent**. Her copy goes at the same moment and she is not told; what she sees is that you are no longer in her list, which is what a decline looks like too. It is confirmed, as everything outward facing is, and it has **no Undo**, because an Undo would reach into somebody else's account.

**Leave**, which that sentence points at, joins a shared thread's More menu on every surface, confirmed, and does what the swipe on My threads already does: your membership and your key go, the other members' view is untouched, and the toast offers the Undo it offers today. It is drawn only on a thread with more than one member; on a thread you are alone in, the swipe's Delete is the whole story and More is as it was.

### Blocking

Block is Remove with a memory. It removes the connection if there is one, withdraws any request or waiting share in either direction, and from then on their requests never arrive: the server writes the request for them exactly as it would, with its date, its 30 days and its seven-day rule, and never delivers it, so nothing on their side tells them. Shared threads are untouched, as with Remove, and the confirmation says the one thing Remove's does not:

> **Block Ana Duarte?**
> She will not be able to ask to connect with you again. The 3 threads you already share stay as they are, and she can still be in a thread you share if somebody else brings her in.
> Cancel · Block

Blocked people are listed on the Blocked page, and their page stays reachable from there and from a shared thread with Unblock in More. Unblock lifts the block and does not reconnect. A block is on the account: somebody who deletes their account and signs up again with the same address is a new account, and the block does not follow them.

### Sharing a thread

The thread's Share control comes alive on every surface, exactly where it is drawn: the bar on the phones, the pane head on the web, with the faces of whoever else is in beside it on the web, as the kit's `WFaces` draws them, without you. Nothing smaller than a thread can be shared, and there is no public link. **The default thread cannot be shared**: every dump with no obvious home lands there, so sharing it would share whatever arrives next, and the control is not drawn on it, as Delete refuses it today.

The sheet, the kit's `ShareSheet` and `WShareModal`: "Share Lisbon trip", "Everyone in here sees everything in it.", then the rows.

- **The people already in are lifted to the top**, so the answer to "who sees this" is the first thing in the sheet: accepted members with "in since 2 Aug", then anybody the thread is waiting on with "waiting", each with an **x**.
- Then your connections who are not in, each with a checkbox. The row ticks; the lead, at a 44px hit area, opens the person, as the design's rule asks and the kit's row does not. A pending connection is not listed: until they accept you cannot share anything with them. Blocked people are absent.
- **New connection**, the last row, opens Add a connection.
- The line a person reads before sharing, unchanged since 5 September: "A shared thread belongs to everyone in it. If somebody leaves offload, the thread and everything they added stay with the rest of you."
- The footer is **Done**, and becomes **Share with Ana and Tom** once somebody is ticked, "Share with Ana, Tom and 2 more" past two. Pressing it is the confirmation (OFF-6), and there is no Undo: the share is a message to a person. A failed share keeps the sheet up with "That didn't go through." and Try again.
- **No search field when every connection fits.** The field appears only once the list is long enough that searching beats scrolling, past eight rows, and on the phones it is lifted with the keyboard as the move sheet's is; with three people, which is always, a field over a list that already fits is a control asking to be used for nothing.
- **No connections yet**, the state everybody hits once: "You have no connections yet. A connection is somebody already on offload. You need the email they signed up with.", then New connection and Done.

Sharing puts a waiting membership on the thread and nothing else: no key, no content, no name beyond the thread's reaches the other person until they accept. **At most three shares from one person to another may be waiting at once**; a fourth is refused in the sheet with "Sam already has three waiting from you." A waiting share **expires after 30 days**.

### Receiving a shared thread

An invitation arrives as the kit's `PendingInvite`, "Ana shared Lisbon trip" with **Look**, one moss strip at the top of My threads, and on the web at the top of the threads pane. It stays when the list is otherwise empty. A shared thread opens instead of answering on the card, because a thread has content to preview and a connection does not.

**Look** opens the kit's `InviteScreen`: their mark at 56px, "Ana shared Lisbon trip with you", a line with the count and what you can do ("14 in it. You can add to it, and you cannot delete anything of Ana's."), who is already in it by name, a preview of two rows, and **Add it to my threads** over **Not now**.

**The preview is taken once, when the share is made**, and it is the sharer's own two most recent rows, titles only, with the count as it was then. It is stored with the waiting share and read from there, so a person who has not accepted never reads the thread, never sees a row somebody else in it wrote, and cannot be shown a changing feed by a share made and withdrawn.

- **Add it to my threads** makes you a member and wraps the thread key for you. The thread appears in My threads where its activity puts it and the strip goes. It is checked again at the tap, in one transaction: the share is still waiting and unexpired, the thread is live, the person who shared it is still in it, and you are still connected. If any of that has changed the strip goes with "Not here any more."
- **Not now** closes the screen. It is not a decline: the strip waits at the top of My threads, never becomes an inbox, carries no badge and no counter, and expires after 30 days, at which point it goes without a word to either side.
- A strip whose thread was deleted, whose sharer left it or was taken out, whose share was withdrawn, or whose sharer and you are no longer connected goes on its own, and Look on one that has just gone says "Not here any more."

Everything in a shared thread already works the way 014 and the privacy policy describe: any member adds, only the author deletes while they are in it, and what somebody left becomes the thread's when they go.

### Taking somebody out

The **x** on a lifted row in the share sheet. On a waiting row it opens "Withdraw the share with Sam?" and withdraws it: his strip goes. On a member it opens the confirmation the design drew, and what it shows is what stays, because that is the surprising half and the product's own rule:

> **Take Ana out of Lisbon trip?**
> She loses the thread. What she added stays, because a shared thread belongs to everyone who was in it.
> *her two most recent rows, listed, and "and 12 more"*
> Cancel · Take out

**Any member can take any other member out.** There are no roles, so there is no one who may and one who may not; the creator has no more standing than the last person in, and nobody takes themselves out this way, since that is Leave. Taking somebody out is what leaving is, done to them: their membership and their wrapped key go in one transaction, with the calendars they had picked for the thread, their view of the thread goes with it, and what they left becomes the thread's, which any remaining member may edit or remove, exactly as when they leave. Two members taking each other out at the same moment cannot both succeed: the server locks both memberships and checks the actor is still in before it acts, and a thread that would be left with nobody in it dies as it does when the last member leaves. The row keeps who took them out, as ids, so support can answer a question the product itself never raises. It is confirmed, as everything outward facing is, it sends nothing to the person taken out, and it has **no Undo**, because their copy of the key is what an Undo would have to give back. It does not touch the connection, which is the mirror of Remove and the reason both are coherent.

**This changes two documents, and the product owner signs the words before any code.** The privacy policy says today that no role can throw anyone out, and OFF-3's amendment names exactly this as the change that must be reconsidered together with the leftovers rule. Both are rewritten in the same change as the feature, with the text in *Decided during planning*: a shared thread is only as safe as the people in it, and what bounds that is that everybody in one was brought in by somebody already there.

### Saying it

The composer is a tool rather than a chat, and sharing is the first UI task offload does when told: "share Lisbon trip with Sam", "add Ana to this", said in the composer, on a thread or off it.

**A said share is proposed, never done.** Sharing reaches a person, so it is outward facing whoever asks for it, and the model is told that rather than deciding it: the share tool records a proposal and the reply carries it as its own control, the way 019's calendar proposal does, "Share Lisbon trip with Sam?" with **Share** and **Not now** on the reply, and under it the same line the sheet shows, since the policy promises that line at the moment of sharing. The tap is the confirmation and the server checks everything again at the tap, as it did when the proposal was made: that the thread is one the person is in and not their default, that Sam is an accepted connection, that he is not already in or waiting, that fewer than three are waiting. A proposal nobody answers expires in an hour, unanswered, having changed nothing. Nothing about it is undoable because nothing happened until the tap, and what the tap does is not undoable because it is a message to a person. The readme says a said share is "answered in offload's voice with an Undo"; a proposal is the OFF-6 shape and the divergence is logged.

**The model names a person and the server resolves them, against the person's accepted connections and nobody else.** The tool takes a thread and a name or a mention; the server matches the name, case-insensitively, against the connections it may see, and answers the model with one of three things: the proposal, "nobody by that name", or the two or more it could be, which the model turns into 018's question ("Which Sam?", with them as the options). No list of connections reaches the prompt, so a turn costs the same however many people somebody knows (OFF-8), and a name that is not a connection is never looked up by email: saying it cannot do what the sheet cannot. The tool has no field that skips the proposal. Unsharing, taking out, removing and blocking are not said: each has a sheet that shows what stays or what is listed, and the sheet is the only way to it.

### @ picks a person

Typing **@** in the composer, on every surface, opens the connection list above the composer, filtered as you keep typing, three rows at a time so it never covers what you wrote, each row a mark at 28 and the name, above the keyboard on the phones. Picking one puts their name in the text and **resolves it to the person, not to a string**: the message carries the mention as who it is, and the server keeps a mention only if it names an accepted connection of the sender, dropping any other silently, so the share tool acts on an id the server vouched for and never on a spelling or on a client's say-so. An @ that matches nobody stays plain text and sends as typed. A mention with no share in the sentence is filed like any other words, name included.

### The mark

`Avatar`, the design system's new component, drawn on every surface as the stored picture with the initials over it. Nobody uploads a photo, so the mark is generated: a prism, two fields split by a hard edge. The server draws it **once, the first time anybody asks for it, as a 176px PNG stored with the account, and never regenerates it**: a prism that changes is not an identity, and somebody will notice. Drawing on first read rather than at signup is invisible, since the picture is a function of the id alone, and it means the accounts that exist on the day this ships need no backfill: each gets its picture the first time it is seen, and keeps it. **The initials are not in the picture.** They are drawn by each surface over it, in the product's type, from the display name as it is now, so renaming changes the letters and never the prism, which is what the policy promises and what the kit's `Avatar.jsx` does with its span.

The arithmetic is the design system's and the numbers are not to be relaxed: seeded from the account's immutable id, never the name or the email, both of which change; hue off a twelve-step wheel; one of eight facet angles; lightness between 0.42 and 0.52 at chroma 0.13, which is what keeps white initials above 4.5:1 on every hue the generator can produce. The mark is the same in both themes.

It is drawn at 28 on a card and in the @ list, 32 on a `PersonRow`, 36 in the share sheet and on a face, 52 on a person's page and 56 on an invitation, and never below 28. Every surface draws the stored picture rather than its own arithmetic, so one person is one mark everywhere, and the faces on a thread's pane head, which today are two grey letters, become it. The picture is served to the person and to anybody who may see them, with not found for anybody else and for an id that does not exist alike; the phones fetch it and draw it from a cached file, as they draw a photo, and since it never changes the cache never expires. It is not content: it is derived from an id and says nothing about the person.

### On the web

The same screens as panes and modals. My people is a settings page with the three groups and the cards, since the web kit's people page predates the design and draws neither marks, Pending nor Blocked, and its receiving pick is the setting that is out of scope. The person's page is the kit's `WPerson` without its Message tool, which has nothing behind it, and with "Shared with Ana" for the heading the kit calls *Things you share*. The share modal and invitation modal are the kit's, with marks at 36 and 56 where the kit draws 34 and 40, which are not sizes the design gives. The strip sits at the top of the threads pane and says "Ana shared Lisbon trip with you", as `WPendingInvite` does. The @ list sits above the composer as `WMentions` draws it.

### On Android

The Material kit's sharing sheet, `M3Sharing.jsx`, has the same rows and the same copy: a 52dp field, 56dp rows, the card at Material's radius, the primary filled blue. Each Android screen takes those from the `--a-*` tokens as every Android screen does, and nothing is flattened to one layout with a platform switch inside it.

### What is said, and not said

A connection request carries nothing but who asked. A share carries the thread's name, the count and the sharer's own two titles, taken once. No event, trace or log carries an email address, a display name or a thread name, and an event about two people carries the actor's pseudonym and counts, never the other account (OFF-1). "Pending since 4 Aug" and "in since 2 Aug" are dates the product already holds.

**Deleting an account**, which 001 specifies and nothing builds yet, takes its connections, its requests in both directions, its blocks in both directions, its waiting shares and proposals, and its mark with it, by the schema rather than by a list somebody has to remember; a mention of it in somebody else's message keeps its words and points at nothing.

**One rule for who may see whom**, written once and read by the lookup, the share sheet, the @ list, My people, the person's page, the mark and the tool: an active account that is a connection, has a request open in either direction, is in a thread with you, or is blocked by you; never an account that has blocked you, is deleted or is disabled.

## Acceptance criteria

Finding and requesting

- **AC-1** Looking up an address returns the one active account whose email matches it case-insensitively, showing the name, the stored address and the mark, or nothing; a partial address, a name, a deleted or disabled account, and an account blocked in either direction return nothing.
- **AC-2** Requesting creates a pending request from the caller to that account, carrying no message and no thread; the requester sees the row under Pending with the date; the other side gets a card and a dot on the gear and the My people row.
- **AC-3** A second request while one is pending is refused; after expiry or withdrawal a new one is accepted only seven days or more after the last one's creation, and then the card returns.
- **AC-4** Looking up your own address, a connection, somebody you have asked and somebody who has asked you shows the matching state instead of Request; the last of these offers Accept and Not now.
- **AC-5** Lookups are refused past 30 an hour per account, the server's answer time does not distinguish a hit from a miss, and an account may not have more than 50 requests outstanding.

Answering

- **AC-6** Accept makes the two accounts connections at once, in both lists, and removes the card and the dot.
- **AC-7** Not now removes the card and the dot and leaves the request pending; the requester's row is unchanged and the card returns only on a new request.
- **AC-8** A request 30 days old is expired by the server: the card, the dot and the requester's Pending row go, and nothing is sent to either side.
- **AC-9** Withdrawing under Pending is confirmed, removes the other side's card and dot, and is silent.
- **AC-10** The dot shows only when a request is waiting for the viewer's answer and has not been answered Not now; never for the viewer's own requests or a waiting share.

People

- **AC-11** My people lists every connection under Connected with the shared thread names or "Nothing shared yet", own requests under Pending, and blocked people under Blocked; the Settings row's value is the count of connections and absent at zero.
- **AC-12** Tapping a mark anywhere it appears opens the person's page, and the page lists the threads the viewer and that person are both in, each opening the thread, with the empty state for none and the relationship line for a non-connection.
- **AC-13** The person's page, and their mark, are reachable only under the one visibility rule; any other account id, and one that does not exist, are not found alike.
- **AC-14** A person with no display name is "Someone" in every sentence and "?" in every mark.

Removing and blocking

- **AC-15** Removing a connection lists the shared threads in the confirmation, two and a count, deletes the connection for both sides, withdraws any waiting share between them in either direction, leaves every thread membership and its keys untouched, sends nothing to the other person, and offers no Undo.
- **AC-16** Blocking does what Remove does and, from then on, a request from the blocked account is written for them exactly as pending and never delivered; Unblock lifts that and does not reconnect; a blocked person can still be brought into a thread by another member.
- **AC-17** Leave appears in a shared thread's More on every surface, is confirmed, and does what the swipe does today, Undo included.

Sharing

- **AC-18** The share sheet lists accepted members first, then waiting shares, each with an x, then the viewer's accepted connections not in the thread; pending connections and blocked people are absent; the lead opens the person and the row ticks; the search field appears only past eight connections.
- **AC-19** Sharing with a ticked connection creates a pending membership that expires in 30 days with the sharer's two most recent titles and the count stored on it, wraps no key, and is refused for a person who is not an accepted connection of the sharer, for the default thread, and past three waiting shares to the same person.
- **AC-20** The x on a waiting row is confirmed and withdraws the share; the invitee's strip goes.
- **AC-21** With no connections the sheet shows the empty state and New connection.
- **AC-22** The x on a member opens the confirmation listing two of the rows they added and a count; Take out deletes their membership and their wrapped key and their calendar picks in one transaction, leaves every row they added in place with its author protection lifted, records who did it as ids, sends nothing, offers no Undo, and leaves the connection between the two untouched. Any accepted member may do it to any other and not to themselves; two doing it to each other at once leaves exactly one in, and a thread left with nobody in dies as on leave.
- **AC-23** The person taken out no longer reads or writes the thread, their next read of it is not found, and a waiting share they had made on it is withdrawn.

Saying it

- **AC-24** "Share Lisbon trip with Sam" in the composer produces a reply carrying a proposal with Share and Not now and the co-ownership line, and creates no membership; Share at the tap creates the pending membership as the sheet would, after the server re-checks everything AC-19 checks; Not now and an hour's silence leave nothing behind.
- **AC-25** The tool resolves the name server-side against the sender's accepted connections only; two matches yield 018's question with both as options; none yields a reply saying so; no email lookup runs from a said share, and no list of connections is in the prompt.
- **AC-26** The proposal survives a reload of the conversation and is answerable once.
- **AC-27** Typing @ opens the connection list, three rows at a time, filtered as typed; picking one inserts the name and the sent message carries the mention as an account id; the server drops a mention that is not an accepted connection of the sender; an unmatched @ sends as plain text.

Receiving

- **AC-28** A waiting share shows as one strip at the top of My threads and the web threads pane, including when the list is otherwise empty, opening the invitation with the sharer, the thread name, who is in it, the stored count and two titles, and no blob; nothing on it reads the thread.
- **AC-29** Add it to my threads re-checks, in one transaction, that the share is pending and unexpired, the thread live, the sharer still an accepted member and the two still connected, then makes the invitee an accepted member, wraps the thread key for them, and lists the thread in My threads; from then on the thread reads and writes for them as it does for any member.
- **AC-30** Not now leaves the strip in place; the strip goes when the share expires, is withdrawn, the thread is deleted, the sharer leaves or is taken out, or the connection between them is removed; Look on one that has gone says so.

The mark

- **AC-31** An account gets one 176px PNG mark the first time it is read, seeded from its id by the design system's arithmetic and carrying no letters, stored, and the same bytes are served for the life of the account; renaming changes the initials drawn over it and not the bytes; an account that predates this feature gets one the same way.
- **AC-32** Every place the product draws a person, the request card, `PersonRow`, the share sheet, a face, the person's page, the invitation and the @ list, draws the stored mark at the kit's size for that place with the initials over it; the phones draw it from a cached file.

Cross-cutting

- **AC-33** No analytics event, log line or error report carries an email, a display name, a thread name or a second account's id for any action in this spec.
- **AC-34** Deleting an account row removes its connections, requests, blocks, waiting shares, proposals and mark with it, by the schema, since deletion itself is 001's and not built; the suite proves it by deleting a row.
- **AC-35** Every failed action in this spec, lookup, Request, Accept, Share, Add it, Take out, Remove, Block, shows "That didn't go through." beside a Try again, and never a diagnosis.
- **AC-36** Every state above is reached and tested on iOS, Android and the web.

## Out of scope

- **Removing a connection, blocking, taking somebody out, or leaving by saying it.** Each has a sheet, and the sheet is the only way to it.
- **The receiving setting** (Put it straight in / Ask me first). Everything arrives as an invitation; a toggle with one working value is not drawn.
- **Notifications** of any kind: no push, no bell activity. The bell stays as it is.
- **Waiting on** and **What offload knows** on the person's page. They arrive with the features that write them.
- **Usernames**, partial matching, contact import, links that invite, adding a connection from My people.
- **Photos as marks.** The stored `accounts.image` from a provider stays unused.
- **Declining a waiting share.** The schema's `declined` state stays unwritten; Not now waits, as the design says, and the cap of three bounds the nuisance. The security review asked for a silent decline instead; if three strips from one person turns out to be too many in practice, that is the change to make.

## Decided during planning

Asked 2026-09-21, answered 2026-09-22.

- **Take out is built, and the two documents change with it.** The alternative, no member removal and the x withdrawing only a waiting share, was recommended for keeping the privacy policy true as written; the product owner chose the design as drawn and the rewrite. The words below go to the product owner before any code, per the privacy policy rule in `CLAUDE.md`.
- **Saying it and @ are in.** The proposal on the reply is 019's mechanism, so the cost is one tool, one table, and the mention on the wire.
- **Block is in**, as Remove with a memory.
- **The numbers stand:** requests and waiting shares expire after 30 days, a re-request is allowed after 7, the share sheet's search field appears past 8 connections, a said share's proposal expires after an hour. Added by the reviews: 30 lookups an hour, 50 requests outstanding, 3 waiting shares per pair.

### What the reviews changed

The project lead, the client reviewer and the security reviewer read the first draft on 2026-09-22. Folded in: the invitation preview is a snapshot of the sharer's own titles rather than a live read of the thread; a blocked person's request is written and never delivered, so silence is silence; one request per pair at a time, with Not now as a dismissal that leaves the row; withdrawing is confirmed and named Withdraw; Block is reachable from a request; take-out drops the key and the calendar picks in one transaction, locks both rows, records the actor, and a thread emptied by it dies; Add it re-checks at the tap; the said share resolves the name on the server with no list in the prompt, validates mentions on receipt, and carries the co-ownership line; the default thread cannot be shared; account deletion names its six; one visibility rule; the mark carries no letters; the phones fetch and cache it; Leave joins More; every list in a confirmation is two and a count; "Someone" for no name; the failure line everywhere; web and Android paragraphs; the vocabulary carries waiting, invitation, withdraw and mark.

Deliberately not taken: a silent decline for a waiting share (the design says Not now waits; bounded by the cap instead); a `people.linked_account_id` model from 001's impl-spec (a `connections` table is the mutual fact and is logged in `docs/tech/decisions.md`); drawing the mark from two stored numbers on each surface instead of one stored picture (one renderer, as the design asks, and the phones already fetch and cache a protected image); adding a connection from My people.

### Design system impact, to log in `decisions.md`

One entry, with these lines: the Connected group and its "Nothing shared yet" note; Withdraw as the Pending row's value; Leave on a shared thread's More; the sheet row's lead as the door and the row as the tick; the confirmations listing two and a count; the strip's copy on the phones ("Ana shared Lisbon trip") and the web ("with you") kept as each kit has them; Look kept over the exploration's Open; the said share as a proposal with no Undo; the Defaults toggles, the receiving pick, the Message tool and the person page's two sections not drawn; the mark without letters; marks at 36 and 56 on the web where the kit drew 34 and 40; faces on the web without you, as `WFaces`; the dot drawn on a bare glyph.

### The privacy policy, as it will read

Section 10, replacing "So nobody owns a shared thread, including us":

> **So nobody owns a shared thread, including us.** A thread has members and no owner, and every member has the same standing: being the person who created it grants nothing beyond having been the first one in it. Anyone in a shared thread can bring one of their connections into it, and anyone in it can take another member out. Nobody, including you, can delete what somebody else wrote while that person is still in the thread. That symmetry is the point: the protection you give up over your own contribution is exactly the protection you get over everybody else's, and the same is true of the power to take somebody out. **When somebody leaves a thread, is taken out of it, or deletes their account, what they left in it becomes the thread's.** Anyone still there can edit or remove it. We think that is the right way round: the protection exists so a thread cannot become a place where someone else destroys your work, and once you have gone there is no work of yours left to protect, only a thread other people still use carrying things none of them can tidy. It also means a shared thread is only as safe as the people in it. Somebody in a thread with you can take you out of it, and what you put in stays behind for the others. Everyone in a thread was brought in by somebody already there, from among their own connections, and the sheet shows who is in before anyone new joins; taking somebody out is confirmed on a sheet that shows exactly what stays.

Section 11, replacing "There are no public links":

> **There are no public links.** Nothing in offload can be handed to someone who is not in the thread. The only way into a thread is a member sharing it with one of their own connections, so everyone in a thread was brought in by somebody already there, and you can see who is in it before you add anything.

Section 11, the sentence "your name and the initials taken from it" (what other members see of you) gains a clause:

> your name, the initials taken from it, and the mark offload drew for your account when it was created, which is generated from nothing but the account itself.

Section 11, one new bullet, since the lookup is a new way to be seen:

> **Somebody who knows the email you signed up with can find you**, to ask to connect. They see your name and your mark, and that you are on offload; they cannot see anything you have put in, and they cannot search for you by name. You decide whether to accept, nobody is told when you do not, and you can block them.

The "Deleting your account" paragraph is unchanged, and "Sharing is a deliberate act", which already says a connection is somebody both of you agreed to, stays.

### OFF-3, as it will read

The italic sentence in the 2026-09-04 amendment, "This is only safe because nothing in the product can remove a member ... so the two must be reconsidered together", is replaced by:

> *Reconsidered together on 2026-09-22 by 022, which built member removal. Any member may take any other member out, and what they left becomes the thread's exactly as when they leave. The product accepts that a shared thread is only as safe as its members and says so in the privacy policy, because the alternatives were a member who cannot be removed, which is a role, or a contribution nobody can tidy, which is the leftover this amendment exists to prevent. What bounds it: everybody in a thread was brought in by a member from their own connections, taking somebody out is confirmed on a sheet that lists what stays, and it is never done by the model or by Undo.*
