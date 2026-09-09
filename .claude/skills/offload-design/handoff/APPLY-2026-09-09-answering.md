# Apply: answering a question, and the follow-up that comes after it

Design for 013, drawn against the server that is already built, plus the shape of the
multi-turn spec that follows it. Read in order. The first four points are the ones every
other decision hangs off.

Source of the design: `explorations/answering-options.html`, sections 1 to 7. It is drawn at
real size on a 844pt phone, so anything about room can be measured rather than argued.

New in the design system, both compiled into the bundle and both drawn in all three kits:

| Part | Where | What it is |
| --- | --- | --- |
| `AnswerResult` | `components/answering/` | One read: header, rows, one tail |
| `QuickReplies` | `components/answering/` | A question offload asked, answered with a tap |

---

## 1. A result is a card, and the thread is its header

One read is one result and one result is one card. The header row is moss, carries the
lasso glyph, the thread's name and the count, is at least 44px, and is the **one link out**
of that result. Rows sit beneath it.

The header is a new part. It is not `Chip`, and `Chip` is still how a thread is named
everywhere else in the product. This is the only place a second way of naming a thread is
allowed, and the reason it is allowed is the count.

Two results in one answer are two cards. Never one blended list, because which trip is which
is most of the answer.

## 2. Results go below the bubble; controls go inside it

**This is the rule the fill forces, not a preference.** A row's hover and press fill bleeds
to the pane's padded edge with `margin: 0 calc(-1 * var(--space-5))`, and a turn's own
horizontal padding is that same step. Inside a bubble the two cancel and a square fill runs
out under a rounded corner.

So: 012's calendar proposal stays inside the bubble, because it acts on the sentence above
it and it is one fixed control. A result is an unbounded list of live rows with a surface of
its own, and it goes below, at the log's gutter, full width.

## 3. ROWS_SHOWN is 5 on the phones, 8 on web

Eight was the guess in the brief and it is too many on a phone. `Conversation.tsx` caps the
sheet at 78% of the screen, leaving about 446pt of log on a 844pt device. Eight rows plus
the header and the control overrun that by roughly 165pt, so a new answer lands on rows with
the sentence that answers the question already above the top edge. At five, the sentence,
the header, all five rows and the control are in view together.

Web keeps 8: the pane has roughly twice the height.

`AnswerResult` takes `shown`. Do not hardcode one number for both surfaces.

## 4. The tail is one thing or the other, never both

- **More in hand than drawn:** `Show N more`, expanding in place, never fetching. `N` is the
  honest remainder of what arrived. 23 found, 20 delivered, 5 drawn reads **Show 15 more**.
  Once expanded there is no Show less.
- **The read was cut short:** no Show more, because what was not read was not sent. The tail
  is the thread, with the count it actually saw, and the header says `20 of 46`.

## 5. A finished row is never dimmed, and this is a correction to the kits generally

Tertiary ink, a 1px strike, the moss tick. Never opacity. `WThing.jsx:38` drew `opacity: 0.5`
and it is gone; both shipping components already refuse it in a written comment, and the meta
line is what fails the contrast floor first.

While you are there: the web kit's checkbox border was `--ink-300`, which is 2.5:1. It is now
`--border-strong`, the 3:1 floor for anything outlining a control.

## 6. Ticking is the only write a result row can do

No delete, no archive, no rename. On the phones the row's own `Gesture.Pan` and its long
press both come off inside an answer, because the conversation is itself a drag-driven sheet
and nesting a horizontal swipe in it is a conflict nobody has tested.

The tick is 21px drawn inside a 44px target. **Its name carries the thread:** "Book the
airport transfer, Lisbon trip". Today the phones announce "checkbox, not checked" with no
idea what it belongs to, and web has no tickable row at all.

The tap re-checks permission on the server at the tap, and the way back is the ordinary
per-row Undo, not the turn Undo.

## 7. Three things a turn already carries, and what answering does with each

Learned by reading `Conversation.tsx`. All three would be wrong by default.

1. **The Done mark must not appear.** It is `turn.state === "answered" && turn.did`, and an
   answering turn writes nothing, so `did` stays false. The reply is the receipt. 👀 is
   unchanged and matters more here, because retrieval takes longer than filing.
2. **`turn.threads` is empty.** The filed chips answer "where did this go", which is a
   question about a write. Beside a result they name one thread twice in two components.
3. **The partial and failed treatments do not apply.** Nothing was filed, so there is nothing
   half done.

## 8. A refusal is a sentence, not an error state

No warning colour, no apology, no suggestion to try other words. The three sentences are
different on purpose: "I could not find that" describes offload, "No, butter is not on the
list" describes the list, and a truncated read says what it saw and claims nothing about the
rest. A device preference is not answerable and offload says so plainly.

## 8a. Dark needs one line of code, and it is in the buttons

The card, the header, the tick and the tail all hold: the plate is #0F0F11, `--surface-raised` is
#212121, so in dark the card is the lighter object, and moss keeps its value in both themes.

**The one defect is a filled primary written as a ramp value.** `bg-ink-950` with white on it is
white on #EDEDED in dark, because the ink ramp flips. Use `--surface-inverse` with
`--text-inverse`. `Conversation.tsx`'s calendar control has the same shape in it today and should
be checked at the same time.

---

# The follow-up, ahead of the multi-turn spec

Drawn in section 7. Nothing here blocks 013; it is the shape 014 should land in.

## 9. It is 012's control generalised, not a new pattern

`QuickReplies` is the same thing the calendar proposal already does: a because-line and
buttons inside the reply bubble. Three options at most, and **every one of them is
answerable by typing**, so the labels have to be the words somebody would say.

- **A proposal has one primary and one plain way out.** "Add it" and "No".
- **A choice among equals has no primary.** Dark ink means offload is recommending, and on a
  disambiguation offload does not know. Object options carry the object's own colour, so a
  picker of threads is drawn in moss with the lasso.
- **No option destroys anything**, same rule and same reason as a result row.
- The composer's placeholder holds the open question while it is open, so typing is never a
  worse path and voice needs no second design later.

## 10. Picking is a turn, and the tools arrive with it

The tap writes your turn into the log exactly as typing it would, and the chips go.
Conversations are searched now, so a log full of questions with no visible answers is a
corpus that cannot say what happened.

**The turn that asked carries no write tools. The turn your tap creates does.** That is what
keeps a sentence in a shared thread from talking offload into a write: the tools arrive with
a human tap rather than with the model's own question.

**One open question at a time.** The next turn closes the last one whatever it says, and the
sentence stays in the log while the chips do not, because a yes arriving four turns later is
a yes to something else.

## 11. Ask only what Undo cannot cover

The fastest follow-up is the one that is never asked. A reversible write already sits behind
the eight second toast, so asking first charges somebody a decision the toast is already
insuring.

**Ask when** the write is not reversible, when it reaches somebody else, or when the guess is
a genuine coin flip. **Otherwise act and report it.**

Two more that remove questions rather than speeding them up:

- **Offer to remember a disambiguation that keeps recurring.** "Always file trips there"
  after the pick, never instead of it, and only when the same question has been asked before.
  It deletes next week's question rather than this one, and 008 already has somewhere to put
  the rule.
- **Answer a "which of these" on the rows.** The tickable row already exists; what is new is
  the sentence inviting it. Each tick is its own write with its own Undo, so there is nothing
  to confirm.

---

## What is drawn where

| Kit | File | What changed |
| --- | --- | --- |
| iOS | `ui_kits/mobile_app/LiveConversation.jsx`, `App.jsx` | Results below the bubble at `shown={5}`, quick replies inside it, tick and pick handlers, six answer fixtures |
| Android | `ui_kits/android_app/M3LiveConversation.jsx`, `M3App.jsx` | The same, with the card on a low container fill rather than paper with a hairline |
| Web | `ui_kits/web_app/WMisc.jsx`, `WApp.jsx` | The same at `shown={8}`, in both the composer's log and the conversation pane |
| Web | `ui_kits/web_app/W.jsx`, `WThing.jsx` | `WRow` gains `done` and `onToggle` and a real checkbox; the opacity is gone |
| Fixtures | `ui_kits/mobile_app/data.js` | `OFFLOAD_DATA.answers`: a set, a fact, a cut-short read, a proposal, a disambiguation, a device preference, and nothing found |

Type any of these into a kit's composer to see it: "what is left to do from Lisbon", "where
am I staying", "did I add butter to the groceries list", "did I save anything about knife
sharpening", "which trip", "what is my theme".

## Still not drawn

Two results under one sentence, which is two cards below one sentence and is mostly a check
that the sentence still governs both. And the web pane at its widest, where eight rows and a
700px measure have not been seen together.
