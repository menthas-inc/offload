# 013 Answering, feature spec

**Status:** drafted 2026-09-09
**Surfaces:** web, iOS, Android, and the agent plane

## Why

offload files things and cannot find them. The model reads exactly one thread,
the one it just wrote to, and nothing else: there is no search across threads, no
search of memories, and no way to answer a question about anything filed more
than one turn ago.

So the product is an inbox. "What is left to do from Lisbon" and "where am I
staying in Istanbul" are the questions somebody has the moment a thread has
anything in it, and today both are unanswerable by the thing that filed the
answer.

## What

**One question, one turn, no mode.** You type a question into the same composer
you dump into. Nothing about the interface changes and nothing asks you to
declare which you meant. That is the product's whole premise applied to reading
as well as writing.

**Asking files nothing.** A question is not a note, and putting it in a thread
is putting rubbish in the one place somebody is meant to trust. The prompt
already has the shape of this rule for a dump with nothing to file; this widens
it and makes the ambiguous case explicit, below.

**It searches everything the server knows about you**, in one pass:

- **Content**, across every thread you can see: titles, bodies, tags, and the
  thread's own name.
- **Memories**, the standing rules a thread carries.
- **Facts about your account**: your name, the calendars you have connected and
  where each one files, your default thread, a thread's own preferences.

**And answers in the shape the question deserves.** A single fact gets a
sentence. A question whose answer is a set gets the set: "what is left to do from
Lisbon" returns the actual rows, in the reply, with their checkboxes, and ticking
one there completes it for real.

### Two things it cannot search, and one is not obvious

**Photos and voice notes.** They cannot be stored yet: there is no `blobs`
table, no upload, no transcription, and both composers have the camera and the
microphone deliberately undrawn. Searching their descriptions and transcripts is
a real want and it is **its own spec**, because storing them is most of a feature
on its own and touches OFF-2's key hierarchy. When it lands, the description and
the transcript are just more text and this feature extends to cover them without
changing its shape.

**Your theme.** "What is my theme now" cannot be answered and will not be. The
theme is a device preference held in `SecureStore` on the phones and
`localStorage` on the web, deliberately, so it can be read before first paint
with no frame of the wrong colour. The server has never known it and giving it a
copy to answer a question would be a second source of truth for a value that
already has one. The same is true of text size. **offload says it does not know
rather than guessing**, and that is the honest answer rather than a gap.

### How a question is told from a dump

The model decides, and the rule is written down rather than left to taste:

- **A question with a clear answer in what you have is answered**, and nothing
  is filed.
- **Anything that could be either is filed.** "Dentist after the 20th?" is a
  note with a question mark on it. The mistake that costs somebody something is
  losing what they wrote, and the mistake that costs them nothing is a row they
  can archive.
- **A question with no answer in what you have gets one short sentence saying
  so**, and still files nothing. Not an apology, not a suggestion to try
  different words, and never a guess.

### What the reply looks like

**A fact is a sentence.** "The Alfama flat, 14th to 17th." Not a paragraph, not
a list of one.

**A set is the set.** The rows come back in the reply as real content rows, the
same component the thread page draws, and they behave the same way: tick one and
it is ticked, with the turn's Undo. The reply already carries its own thread
links and, since 012, its own calendar confirmation; this is the same rule again,
that the thing which acts on an answer sits next to the answer.

**Everything is a link to where it lives.** "Where am I staying in Istanbul"
answers with the row and the row goes to the thread. Nothing is quoted without
being reachable.

### Not built

- **Web search.** Later, and it is a different trust boundary: text from the open
  internet in front of a model that has tools.
- **Anything that writes.** A question answers. If somebody asks offload to
  change something they are dumping, not asking, and the existing tools do it.
- **Answering across accounts.** Only what you can see, which is your own content
  and the threads you are an accepted member of.
- **Ranking that learns.** No click feedback, no personalisation of results.

## Acceptance criteria

**AC-1** A question is answered from what the account can see and files nothing.

**AC-2** Search covers content, memories and account facts in one pass, and only
rows the asking account is allowed to see: their own, and threads they are an
accepted member of.

**AC-3** Anything ambiguous between a question and a note is filed. Losing what
somebody wrote is the expensive mistake; an unwanted row is the cheap one.

**AC-4** A question with no answer gets one short sentence saying so, files
nothing, and neither guesses nor apologises.

**AC-5** An answer that is a set returns real content rows, rendered as the
thread page renders them, and completing one from the reply completes it for
real with the turn's Undo behind it.

**AC-6** Every row in an answer links to where it lives.

**AC-7** A device preference is not answerable and offload says so plainly.
Theme and text size live on the device by design and the server has never held
them.

**AC-8** What reaches the prompt is bounded: a fixed cap on rows and on
characters per row, so a question costs the same whether the account is a week
or a decade old (OFF-8).

**AC-9** Search never decides on distance alone. Retrieval shortlists; the model
reads the candidates and answers. `decisions.md` records why: embedders score
below random on negation, so "not Lisbon" and "Lisbon" are neighbours.

**AC-10** No search text reaches analytics or a log. Counts, latencies and
outcomes only (OFF-1).

## Depends on

- 006 for the extraction that makes a row worth finding.
- 008 for memories, which are searched alongside content.
- 012 for the pattern the reply follows when it carries a control.

## Open

- **How wrong the first answers are is not knowable from here.** There is no
  evaluation set, and the honest way to build this is to ship it, ask real
  questions of real threads, and fix what misses. Worth saying now so the first
  bad answer is expected rather than alarming.
