# Apply: the turn footer, the source chip, and the voice

Design for 016, from `handoff/DESIGN-2026-09-14-reaching-the-web.md`. Drawn in
`explorations/reaching-the-web-options.html`, decided with the product owner on 14 September.

017's progress line and Stop are drawn in section 5 of that exploration but are **not** folded
into the kits yet and are not in this note beyond the one rule they share with the footer.

New in the design system:

| Part | Where | What it is |
| --- | --- | --- |
| `TurnFooter` | `components/conversation/` | The row under a turn: state, threads, sources |

---

## 1. The footer belongs to the turn, and the Done mark moves

One row, on offload's side, **left aligned at the log's own gutter**. Not inside the sent bubble's
84% and not inside the reply's 92%: it is not a bubble and nothing in it is a quotation.

It is drawn whether or not offload wrote a sentence. That is the whole reason it exists: 004
settled that an ordinary filing turn says nothing, and 016 gives that turn a page it may have read.

**`StatusChip` comes out of the sent bubble.** Both phones positioned it 10px up and 6px into the
bubble's bottom left corner, and the web positioned it at `left: -15, bottom: -16`. That is also
why it could not simply gain chips where it was: a row growing sideways from inside a corner runs
back under the bubble it is tucked into. 👀 moves into the same slot.

**Order is fixed: state, then threads, then sources.** What happened, where it landed, where it
came from. Not sorted, not by count, the same on all three surfaces.

**Geometry:** wraps rather than scrolls, `min-height` never `height`, `--space-2` between chips.
No fill, no hairline, no card. An empty footer is no footer rather than a 26px gap.

**An answering turn passes no state and no refs.** It wrote nothing and filed nothing, so no Done
mark and no filed chips; the result card's header stays the one link to the thread. It may still
carry sources.

## 2. The source chip

A `source` kind joins `LIVE_REF_TONE` and `LIVE_REF_ICON` in all three kits: **`tone="outline"`,
`link` glyph.**

- **The label is the registrable domain and nothing else.** No path, no title, no scheme, no
  `www.`, at a **22ch max-width** so only a genuinely long host truncates, from the end.
- **Three chips, then a count**, and the count is tertiary text rather than a fourth chip: there is
  no screen listing what a turn read, and a chip would promise one.
- **It is an anchor, not a `Chip`**, because it leaves the app and `Chip` has no `href`. It uses the
  outline tone's own values so it stays the same object. Worth knowing `Chip` cannot be a link
  today; this is the second component to want one.
- **A read that failed leaves no chip and no mention.** A chip is a record of where something came
  from, and there is nothing to record.

**Why it is allowed to be external at all, when a reply's link may not be.** The markup rule bans
external links in a reply because the words are page-authored and a link in offload's voice is a
phishing surface. A source chip's label comes from the record of what was read and its target is
the URL that was read, so it is a fact about where a request went. The distinction is the source of
the string, and it should be read that way rather than as an exception.

## 3. The two switches

Both in Privacy beside "Let offload notice patterns", drawn with `SettingsDetail.jsx`'s own Group
and Row and the real `Switch`: a **44 by 26 track whose on state is `--surface-inverse`**, never
moss.

The notes carry the weight the default no longer does. **First clause is what leaves, second is the
bound:**

> **Search the web** · Sends the words you dumped to a search company when offload can't answer
> from your threads. Your threads and notes are never sent.

> **Read links I paste** · Opens a link you dumped and reads the page. Nothing of yours is sent.

**No "On by default" label.** The existing one labels the off switch, because a label's job there is
explaining why something is off; a label saying a switch is on reads as an apology for it.

Both second clauses are true because of AC-24: a query is built from the words of the dump and
nothing else.

## 4. The voice, which is a bigger change than the one line

**In what offload says, the sentence starts with the verb and names no subject.** Neither "I" nor
"offload".

| Was | Is |
| --- | --- |
| I don't search that. | **Can't search that.** |
| I could not find that. | **Couldn't find that.** |
| I do not know. Theme is set on this phone and the server has never held it. | **Theme is set on this phone and was never held on the server.** |
| offload did not finish that one. | **Didn't finish that one.** |
| Could not look that up. | Couldn't look that up. |

**The fourth row is shipped copy** in `Conversation.tsx`, its web twin and `readme.md`. It is the
one line in this note that needs a code change to copy somebody already reviewed.

**Scope:** replies, progress lines, empty states, notification copy, onboarding. **Not settings
notes**, where offload is the subject of the sentence by design, and not the admin panel, which is a
staff tool in a different register.

**Contractions are in**, and this is the wider half: every line before this pass wrote "did not"
and "could not" in full. `can't`, `couldn't`, `didn't`, `won't`, `isn't`.

---

## What is drawn where

| Kit | File | What changed |
| --- | --- | --- |
| iOS | `mobile_app/LiveConversation.jsx` | Mark out of the bubble, refs out of the reply, `TurnFooter` under both; `source` in the ref maps |
| Android | `android_app/M3LiveConversation.jsx` | The same. **Also fixes a real bug:** `AnswerResult`, `QuickReplies` and `TurnFooter` were referenced but never destructured off the bundle, so the sheet threw on any turn with an answer |
| Web | `web_app/WMisc.jsx` | The same, in both the composer's log and the conversation pane |
| Fixtures | each kit's `answerFor`, plus `mobile_app/data.js` | Four reachable cases: one source, five sources and a count, a read that failed, a refusal with nothing to file. Voice sweep across replies, one notification and a memory blurb |
| Copy | both sign-in screens, both phone settings pages | Contractions |

Type "when is memorial day" into any kit's composer for a reply with one source, "what's on over
the long weekend" for five sources and a count, a pasted URL for a read that failed, or "what day
is the gun show" for the refusal.

## Still not drawn

017's progress line and Stop, which are designed but not built into the kits. The older
full-screen `ConversationScreen` in both phone kits and its web twin still draw `StatusChip` inside
the bubble, so the kits show both patterns until those catch up. Dark for the footer: the outline
chip's border is `--border-strong`, which holds in both themes, but nobody has looked at five chips
on a near-black plate.
