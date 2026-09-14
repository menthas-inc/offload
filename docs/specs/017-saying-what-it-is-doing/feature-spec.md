# 017 Saying what it is doing, and stopping it

**Status:** drafted 2026-09-14
**Surfaces:** web, iOS, Android, and the agent plane
**Depends on:** 016, which is what makes turns long enough for this to matter
**Research and decisions:** `../016-reaching-the-web/research.md`

## Why

A turn takes between two and thirteen seconds today, from the worker's own logs.
With a lookup in it, ten seconds stops being the tail and becomes the middle.

Jakob Nielsen's thresholds have not moved in thirty years: a tenth of a second
feels instant, a second keeps a train of thought, and **past ten seconds
attention is gone**. Past that, the work needs to say what it is doing and offer
a way out. offload has three dots and no way out.

The three dots are also a lie of omission. They say the same thing whether
offload is filing a shopping list, reading a page, or sitting in a retry. A
person watching them cannot tell a slow turn from a stuck one, and the only
information they get is that something is happening.

## What

### One line, and it is the last one

While a turn is working, offload says what it is doing now, in one short line,
**in its own voice**:

> Looking up when Memorial Day is

> Reading the Airbnb page

> Filing three things

**The last step only.** No list, no history, no timestamps, no expandable
activity pane. When the next step starts, the line is replaced. The product's
own rule about replies applies here too: somebody watching a screen does not
want a log of what a machine did, they want to know it is doing the right thing.

**It never explains a failure and never names a mechanism.** No vendor, no tool
name, no "retrying", no "the model is slow". If something went wrong, the turn's
own result says so when it settles, next to the control that acts on it. That is
CLAUDE.md's rule and this is the surface most likely to break it.

**It never echoes anything it read.** A page's title is written by whoever owns
the page, and a line saying "Payment failed, verify your card" in offload's own
voice, in offload's own progress line, is a phishing message the product drew
itself. The brief may name what offload is doing and the domain it is doing it
to, because a domain is a fact about where a request went. It may not contain
anything from inside a page or a search result.

**It does not appear immediately.** Under a threshold, around a second and a
half, nothing is drawn and the existing writing indicator is the whole of it. An
ordinary two-second filing turn should look exactly as it looks today, and a
line that appears and vanishes inside a second is noise.

**It is not stored and not logged.** The line exists for the length of the turn,
and it is the only place in the product where a model-written sentence describing
somebody's content is shown without also being written down. That is allowable
precisely because it is shown to the person whose content it is and goes nowhere
else, which is the distinction OFF-1 actually draws.

### A way to stop it

**At ten seconds, a way out appears** beside the line.

Pressing it:

- **Gives the screen back immediately.** The line goes, the composer is theirs,
  the conversation stops waiting. This happens on the client's own say-so and
  does not wait for the server to agree.
- **Stops the work**, not just the watching. The turn's job is cancelled and the
  worker stops, including the call it is in the middle of.
- **Keeps everything that landed.** Anything already filed stays filed. Cancel is
  not undo, and undo already exists for that.
- **Says one short thing.** "Stopped.", and the pills for anything that landed,
  so the turn is honest about what it did before it was stopped.
- **Does not offer to finish.** Stopped means stopped. The dump is still in the
  conversation if they want to send it again.

**A cancelled turn is not a failed turn.** It does not retry, does not count
against any failure measure, and reads differently from "offload could not finish
that".

**Cancel never loses a write.** If the work has already finished and is being
written down when cancel arrives, the write wins. A cancel that lands in the
middle of filing something waits for that one thing rather than interrupting it.

### Catching up

A client that reconnects mid-turn, or one that fell back to asking rather than
streaming, sees the step that is current right now. Not the ones before it.

## Acceptance criteria

- **AC-1** A turn that passes the threshold shows one line describing what is
  happening, written by offload, replaced as the work moves on.
- **AC-2** Only the latest step is ever on screen. There is no way to see the
  previous ones, because they are not kept.
- **AC-3** A turn that settles under the threshold shows exactly what it shows
  today: the writing indicator and nothing else.
- **AC-4** The line is capped in length by the server, not by the prompt, and a
  longer one is cut rather than drawn.
- **AC-5** No step is written to a log, an analytics event, an LLM trace or an
  error report, and none survives the turn it belongs to.
- **AC-6** A client that reconnects or polls mid-turn receives the current step
  and draws it.
- **AC-7** A way to stop appears at ten seconds, on all three surfaces.
- **AC-8** Pressing it returns the screen immediately, without waiting for the
  server.
- **AC-9** Pressing it stops the work: the job is cancelled and the worker's
  in-flight model call is abandoned. A test asserts the worker stops rather than
  finishing quietly.
- **AC-10** Everything filed before the cancel is still there afterwards, and the
  turn names it.
- **AC-11** A cancelled turn says "Stopped." and offers no way to finish.
- **AC-12** A cancelled turn does not retry and is not counted as a failure.
- **AC-13** A cancel that arrives after the work finished does not undo it: the
  result stands and the turn settles normally.
- **AC-14** The line never contains a vendor name, a tool name, a mechanism or an
  explanation of a failure. The eval covers this alongside the reply rules.
- **AC-15** No text from a fetched page or a search result reaches the line. A
  page whose title is written to look like a system message produces a brief that
  does not contain it, and the test uses exactly such a page.

## Out of scope

- **An activity pane, a step list, or a transcript of what offload did.** The
  research is clear that its value fades during routine work, and this product
  says less rather than more.
- **Percentages and time estimates.** Neither is knowable and both are a promise
  that gets broken on the slow turn where it matters.
- **Cancelling anything other than a turn in progress.** Not a daily job, not a
  sync, not an upload.
- **Pausing.** Stop is stop.
- **A brief on quick add or a note**, which write straight through and are not
  turns anybody waits on.
