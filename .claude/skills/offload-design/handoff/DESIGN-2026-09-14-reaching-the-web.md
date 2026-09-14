# Design brief: reaching the web, and saying what it is doing

**Direction:** code to design, the unusual one. This asks for designs that do not exist, with the
constraints already discovered by specifying the half that does.

**Status:** specs are written, reviewed and gated. `docs/specs/016-reaching-the-web/` and
`docs/specs/017-saying-what-it-is-doing/`. The server work starts now; **no client is being touched
until this comes back**, because `find-kit.sh` finds nothing for any of it and building a screen
from a readme is how the web gate, the refusal and the no-invite screen each came out wrong.

Four things are needed, in the order they block work.

---

## 1. The turn footer, which is the real one

**This is not a new chip. It is a new home for chips that already exist.**

What the kits draw today, checked rather than assumed:

- `StatusChip` (the Done mark) is absolutely positioned on **the person's own sent bubble**.
- The reference pills come from `t.refs` and render **inside offload's reply bubble**, gated on
  `t.from === "offload"`.

They are two elements in two different bubbles. That has been fine because everything that needed
saying was said by one or the other.

**It stops being fine here, because of a rule 004 already settled: an ordinary filing turn says
nothing.** No sentence, no reply bubble. And that turn may now have read something, which it has to
be able to say. There is no container for it, on any of the three surfaces.

So: **one footer belonging to the turn rather than to either bubble**, holding

- the Done mark,
- the thread pills,
- the source chips (below),

and drawn whether or not offload wrote a sentence. When there is a reply, the footer sits under it.
When there is not, the footer is the whole of offload's side of the turn.

What we need from design: where it sits relative to both bubbles, how it aligns, what it looks like
carrying one chip and carrying five, and what happens at 200% text size when a long domain, a long
thread name and the Done mark are all in it at once. `min-height`, never `height`.

This is a divergence from what the kits draw, so it owes an entry in `decisions.md` with the
**Design system impact** field filled in, whichever way it lands.

## 2. The source chip

A reply built on something read from the web has to say where it came from. It is also a
contractual requirement of the search provider, not only a product preference.

**It is a kind in a contract that already exists.** `LiveConversation.jsx`:

```js
const LIVE_REF_TONE = { thread: "accent", time: "attention", money: "warning" };
const LIVE_REF_ICON = { thread: "lasso", time: "clock", money: null };
```

A `source` kind joins those maps, in `mobile_app`, `android_app` and `web_app`, all three.

Decided already, and the reasoning matters more than the decision:

- **`tone="outline"`, not `accent`.** Moss means "offload did this, you didn't" everywhere in this
  system. A citation is the opposite: it is evidence of where a fact came from, and reusing moss for
  it blurs a legend the system otherwise guards. `MemoryChip` already reserves `outline` for the
  external and non-inferred, which is exactly this.
- **The label is the domain**, `timeanddate.com`, and tapping it opens the URL.
- **Up to three chips, then a count.** Six reads are possible in one turn and six chips under a one
  sentence reply is a footnote section.
- The server hands over `sources: [{ domain, url }]` and nothing else. No page title, no quoted
  excerpt: both are written by whoever owns the page, and putting either on somebody's screen is the
  quarantine leaking through the one door nobody was watching.

## 3. Two switches in settings

Both in the Privacy group, beside "Let offload notice patterns", which is where the switch about
what offload may do with somebody's content already lives.

| Title | Note |
| --- | --- |
| Search the web | needs copy: a search sends words from what you dumped to a search company |
| Read links I paste | needs copy: opens the link, and nothing else |

No full stops on the titles, per the readme and per every existing `Toggle` and `SToggle`.

**Both default on, and that inverts a line this system already drew.** `SettingsDetail.jsx` defaults
"Let offload notice patterns" on because it stays inside offload, and defaults "Improve offload with
my data" off, labelled "Off by default", because that content goes further. A search query goes to a
third party, which is the second category by that test. The product owner has called it and it is
recorded as a deliberate departure rather than an oversight. **Design's call to make is whether the
note carries that weight in words**, since the switch itself no longer does.

## 4. The voice rule needs amending, or the line needs rewriting

The refusal line is:

> I don't search that.

`readme.md` line 35 says offload refers to itself in the third person, "never I". Two precedents
already exist, in `handoff/DESIGN-2026-09-09-answering.md` and in `mobile_app/data.js`, and neither
is logged as the deliberate exception an absolute rule would require.

So 016 would be the third feature quietly widening it. The product owner has specified this line
twice, so the plan is to amend rather than rewrite: a `decisions.md` entry that says offload speaks
in the first person when it is talking about its own limits, and in the third person otherwise.
**If that is the wrong amendment, this is the moment to say so**, because the alternative is one
sentence of copy and no rule change.

---

## And then 017, which is smaller and has no mock at all

While a turn is working, offload says what it is doing, in one line, in its own voice:

> Looking up when Memorial Day is

- The **last step only**, replacing itself. No list, no history, no expandable pane.
- After a threshold, around 1.5 seconds. An ordinary two second filing turn looks exactly as it
  looks today.
- Capped at 80 characters by the server.
- It never explains a failure and never names a vendor, a tool or a mechanism.

**At ten seconds a way to stop appears beside it.** Pressing it gives the screen back immediately,
stops the work rather than the watching, keeps everything that landed, and settles the turn as

> Stopped.

with the pills for whatever did land, and no offer to finish.

Both live in the conversation area above the composer, which on a phone is the sheet the pinned
composer already uses. Neither exists in any kit.

## What design does not need to decide

These are settled and are constraints rather than questions: the chip's two fields, the three chip
cap, the outline tone, the copy of the refusal line, the copy of "Stopped.", the disagreement line
("Your note says the 14th. Memorial Day is the 25th."), and the fact that both switches default on.

## What we would most like back first

The turn footer. Everything else is a chip, a row and a line, and all three are blocked on having
somewhere to live.
