# Design brief: answering a question

**Direction:** code to design, which is the unusual one. Everything else in this folder hands a
finished design to the codebase. This asks for a design that does not exist, and it comes with
constraints already discovered by building the half that does.

**Status:** 013's server is built and tested. The clients are deliberately not started, because
`find-kit.sh search` and `find-kit.sh answer` find nothing and building from a readme is how the
web gate, the refusal and the no-invite screen each came out wrong.

---

## What the screen is

You type a question into the same composer you dump into. Nothing about the interface changes
and nothing asks you to declare which you meant. offload reads what it has and answers.

Three shapes of answer, and the design has to hold all three:

| The question | The answer |
| --- | --- |
| "Where am I staying in Istanbul?" | A sentence. Sometimes one row under it. |
| "What is left to do from Lisbon?" | A sentence plus the actual rows, with checkboxes that work. |
| "Did I already add butter to the groceries list?" | A sentence. Yes and the row, or a plain no. |

And two it refuses, which need a treatment rather than an error: a question it cannot answer,
and a read that was cut short so it will not claim the rest.

## What the server hands the client

One reply, plus **results**. A result is one read, so two subjects is two results.

```ts
reply: string
found: Array<{
  threadId: string | null      // null when a search crossed threads
  threadName: string | null
  truncated: boolean           // there was more than a page
  rows: ContentRow[]           // the same type the thread page draws
}>
```

`rows` are whole `ContentRow` values, so a result row can render exactly as the thread page
renders one: body preview, author, due date, done state, the lot. They are resolved when the
conversation is read, not frozen into the message, so a row ticked or deleted elsewhere is never
stale inside an old answer.

Up to 3 results per answer, up to 20 rows each.

## The constraints, and where each came from

These are not preferences. Each one is something the code already settled or something the kits
currently get wrong.

**Results sit below the reply bubble, not inside it.** A pane row's hover and selected fill
deliberately bleeds to the pane's padded edge with `margin: 0 calc(-1 * var(--space-5))`. An
offload turn's own horizontal padding is `var(--space-5)`, so inside a bubble the two cancel and
a hovered row's fill runs under an 18px rounded corner. Everything put inside a turn until now
has been one small fixed control: 012's calendar confirmation, and the thread chips.

**The thread is named by the existing moss chip, above a group of rows.** Not on the row.
`WRow`'s `meta` is plain text so it cannot be a link at all, and it already carries who and
when, which matters more in an answer than anywhere else because a result from a shared thread
can be somebody else's row. One chip per result rather than one link per row.

**A completed row is never dimmed.** `WThing.jsx:38` draws one at `opacity: 0.5`. Both shipping
components reject that in a written comment: *never opacity, because dimming a row on a warm page
reads as a rendering fault and takes the label under the contrast floor.* They use the moss fill,
tertiary ink and a strikethrough. **This is a correction to the kits generally**, not something
answering invented.

**An answer can never destroy anything.** Ticking is the only write a result row can do. No
delete, no archive, no rename, and no swipe or long press that reaches them. On the phones the
row's own `Gesture.Pan` also has to come off, because the conversation is itself a drag-driven
sheet and nesting a horizontal swipe inside it is a conflict nobody has tested.

**The checkbox needs semantics that do not exist yet.** The phones' checkbox has
`accessibilityRole` and `accessibilityState` and no `accessibilityLabel`, today, on the thread
page: it announces "checkbox, not checked" with no idea what it belongs to. Web has no tickable
row at all. Both need a name, and in an answer the name should carry the thread. The tap target
is sized independently of the mark, 44px minimum.

## What the kits need to gain

1. **A tickable row.** `WRow`'s `check` is a bordered span with no behaviour.
2. **A result group**: the moss thread chip, with its rows beneath it.
3. **A Show more control** on a result longer than a reply should draw.
4. **The corrected done state**, replacing opacity in `WThing` and its mobile twin.

## The open question, which is the one I most want a mock to answer

`ROWS_SHOWN = 8`. Under it a result draws whole; over it, eight draw and **Show more** expands
the rest of what arrived. If the read was `truncated` the tail is the thread chip, because the
thread is where the rest actually live.

**Eight is a guess.** Twenty rows is a reasonable amount to hand a model and an unreasonable
amount to end a sentence with, and which of those a given result is depends on the screen rather
than on the query. It is the number most likely to move once there is something to look at.

## The copy, which is settled and worth not redesigning

Short, friendly, to the point. Not emphatic, not apologetic. Sentence case. No dashes.

- **A fact is a sentence.** "The Alfama flat, 14th to the 17th."
- **A set says what it adds up to and lets the rows speak.** "Three left." Never a list in prose
  above a list of rows.
- **No and cannot-answer are different sentences.** "No, butter is not on the list" describes the
  groceries. "I could not find that" describes offload, and is only honest when it is true.
- **A truncated read says what it saw and claims nothing about the rest.** A wrong no means
  somebody does the thing twice.
- **Theme and text size are not knowable.** They live on the device and the server has never held
  them. offload says it does not know rather than guessing.

## What is not in scope

Attachments, because photos and voice notes cannot be stored yet. Counting and totalling across
threads. What you are waiting on from somebody. All three are recorded as not built in
`docs/specs/013-answering/feature-spec.md` rather than left as gaps to rediscover.
