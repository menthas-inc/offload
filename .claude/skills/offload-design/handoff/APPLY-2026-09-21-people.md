# Apply: connecting, and the prism avatar

Decided 21 September 2026 with the product owner off `explorations/sharing-and-avatars.html`. Seven
items, decided one at a time. Both themes, all three surfaces.

**One new component, `Avatar`.** No new tokens, and no new glyphs. Start with section 6 if you are
building the avatar, section 1 if you are building the flow.

---

## 1. Finding somebody: email only

**Accounts have no usernames, so an address is the only handle there is.** One full email, matched
**exactly and case-insensitively**, returns one account or none.

- **No partial match, no name search, no suggestions.** A name search over real people is a
  directory whether or not it is called one.
- The field says **"Their email address"**.
- **The found row shows the address as the account stores it**, not as it was typed. That is what
  confirms the match was case-insensitive rather than lucky.
- Empty state: **"You need their offload email"**, and the reason there is nothing to browse, in one
  sentence.
- Not found: **"No offload account for that"**. A typo and a non-account look identical and no
  wording can distinguish them, which is the honest limit of the no-invite rule.

## 2. The word is request

**Not invite.** An invite to somebody who is not on offload cannot be sent.

**This breaks a shipped group.** `SettingsDetail.jsx`'s `people` page has:

```
Group label="Invites"  →  "Priya Raman · Invited on 4 Aug, not accepted"  ·  Resend
```

Becomes:

```
Group label="Pending"  →  "Priya Raman · Pending since 4 Aug"            ·  Remove
```

- **Remove stays a `value` label**, not a control with its own target, so the row's own tap is the
  action as on every other settings row.
- **The row gains a 32px `Avatar`.** The shipped one has no lead, and every other person row here
  has one.
- **This group is the only place your own outstanding requests are listed.**
- **A request carries no message and no thread.** One arriving as "wants to share Lisbon trip" would
  leak the thread's name to somebody who has not accepted yet.
- **Nothing tells you a request was declined.** A decline looks exactly like silence, which is the
  only version that does not turn a no into a notification. Rate-limit re-requests on the server.

## 3. Answering: on the card, no screen

`PendingInvite` gains two chips **on their own line**, so the sentence keeps its full measure and
both clear 44px:

| | |
| --- | --- |
| Accept | `Chip` moss, `--moss-600` on `--text-on-solid` |
| Not now | `Chip` outlined, transparent over `--border-strong` |

- **A connection request is answered on the card; a shared thread still opens.** A thread has content
  to preview first and a connection has nothing beyond what the card already says.
- **Not now is not No and not a block.** It leaves the request pending. **`Blocked` already exists**
  on the `people` page at `value="None"`, so the escalation has a home and a decline does not need to
  become one.

## 4. The dot: two places, and it is a prop you already ship

**There is no Settings tab.** Settings is a gear `IconButton` in the `AppBar`, beside the bell, so
the dot goes there and on **My people** inside Settings.

```jsx
<IconButton icon="settings" label="Settings" badge={pendingRequests > 0} onClick={onOpenSettings} />
```

**That is `IconButton`'s own badge**, 8px `--clay-600` inside a 1.5px `--paper` border at
`top:5 right:5`, which the bell beside it already passes as `badge={unread}`. The My people row's
lead takes the same 8px clay dot. **One signal in two colours on one screen would read as two
signals.** Clay is the component's choice, not a new decision: it is the danger hue elsewhere and
here it means unanswered.

- **Only a request needing your answer dots anything.** Your own pending requests do not, because
  nothing is waiting on you, and a shared thread arriving is already the bell's job.
- **No notifications page.** A third place to read the same two facts would be a page that exists to
  hold a dot.

## 5. Every avatar is a door

**Tapping a person anywhere opens `PersonScreen`**: their avatar in a row's meta, in the share sheet,
on a pending card, in a mention. The kit routes there from My people only.

That rule is what makes the Settings location right rather than merely tidy, you almost never go to
the list, because you go to the person. **An avatar is never decoration.**

## 6. `Avatar`, and the two numbers not to relax

```js
seed  = fnv1a(account.id)          // the immutable id. Never the name or the email.
hue   = (seed % 12) * 30           // 12 buckets, 30° apart
angle = (xorshift(seed) % 8) * 45  // 8 facet angles
L     = 0.42 … 0.52   C = 0.13     // constants, not seeded
```

**The lightness ceiling is measured, not chosen.** At `L 0.56` the lightest hue in the wheel put
white initials at **4.16:1**, one person in twelve with a monogram that fails and no way to fix it
after the fact. At 0.52 the worst case is **4.88:1**.

**Hue off a 12-step wheel, never a continuous hash.** At 36px a 15° difference is no difference,
which is the failure mode of every hash-to-hue avatar.

**The facet is part of the identity.** Twelve hues alone is not enough: **twelve accounts land on
eight distinct hues**, so a third of a list of twelve shares a colour. The hard edge is the only
structure that survives 36px, and it takes that list from **8 distinct avatars to 12**. 12 × 8
buckets before two people collide, and the collision is not graceful, they are identical, not
similar.

**Sizes: 28, 32, 36, 52, 56**, which is every size the product draws: a pending card, `PersonRow`,
the share sheet, a person's page, a request. **Three of the five are at or under 36, so the mark is
scanned and never studied.** **Below 28 do not draw it**, the edge is marginal at 24 and the
initials alone are more honest.

**Server side:** generate one 176px PNG at signup, store it with the account, **never regenerate**.
A prism that changes is not an identity and somebody will notice. `Avatar.jsx` is the same arithmetic
so a mock and the real thing agree.

## 7. Removing a connection leaves shared threads untouched

Of three options drawn, this is the only one that does not lie about what a thread is.

```
Remove Ana Duarte?

You will not be able to share anything new with her, and she will not be able to
share with you. The 3 threads you already share stay as they are.

  [ the threads, listed, not acted on ]

Leave a thread from its own More menu if you want out of it.
```

- **The threads are listed, not acted on**, so you leave knowing exactly what is still shared.
- **The second sentence is load-bearing and must not be cut.** "Removed" does not mean "no longer
  shares things with me", and without that sentence the word does more than it should.
- **Removal is mutual and silent.** Her copy goes at the same moment and she is not told; what she
  sees is that you are no longer in her list, which is what a decline looks like too.
- **It is the one action in the product with no Undo**, because an Undo would have to reach into
  somebody else's account.

**Rejected:** removing and leaving every shared thread, which destroys things you never chose to give
up, a three-person thread lost because of one of them, one tap from a face you tapped by accident,
and not undoable by re-connecting. And blocking removal until you leave them yourself, which is the
only place in offload that would refuse an action outright rather than doing it and offering Undo.

## 8. Unsharing shows what stays

```
Take Ana out of Lisbon trip?

She loses the thread. The 3 things she added stay, because a shared thread
belongs to everyone who was in it.
```

- **What stays is the surprising half**, and it is the product's own rule, so it is what the sheet
  shows.
- **"Take out", not "Remove".** Two different destructions should not share a verb.
- **Unsharing does not touch the connection**, which is the mirror of section 7 and the reason
  section 7 is coherent.

## 9. The share sheet loses its search field

**When every connection fits, there is no field.** With a handful of people that is always, and a
field over a list that already fits is a control asking to be used for nothing. Keep it only once a
list is long enough that searching beats scrolling.

The people already in are lifted to the top, above where the field was, so the answer to "who sees
this" is the first thing in the sheet. Their `x` is how a thread is unshared.

---

## Owed, and larger than this note

1. **The kits' five hand-rolled initials circles** want replacing with `Avatar`.
2. **`SettingsDetail.jsx`'s Ana row is hardcoded and wrong.** It says "Lisbon trip, Berlin in
   October" with a badge of **2**; `data.js` gives Ana **three** threads and the month is **March**.
   Wiring the page to real data surfaces both. The fixture is the one to believe.
3. **A connection who shares nothing has no row** on the `people` page, because the group is labelled
   *Sharing with you*. That is a common state, since a connection outlives the thing you made it for,
   so the group needs a second label or a fourth empty one.
4. **Nobody has seen a 36px prism at a real phone's pixel density**, which is the one thing the
   exploration cannot honestly show.
