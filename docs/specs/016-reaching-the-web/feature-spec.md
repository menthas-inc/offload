# 016 Reaching the web, feature spec

**Status:** drafted 2026-09-14
**Surfaces:** web, iOS, Android, and the agent plane
**Research and decisions:** `research.md` in this folder

## Why

offload knows what you dumped in and nothing else. Every question that needs a
fact from outside your own threads is unanswerable, and the failures are quiet
rather than loud.

- "Add a todo on memorial day" files a todo with no date, because offload does
  not know which day that is this year.
- "Will it rain on Saturday" gets an answer about the thread it was typed into.
- You paste an Airbnb link and get a row that says "Airbnb link". The dates and
  the place, which are the two things you kept it for, are in the page nobody
  read.
- You paste a Spotify link and get a row that says nothing about the song.

The last two are the sharper failure. The information was handed to offload, in
a URL the person chose to dump, and the product filed a string.

## What

**Two mechanisms, and they are not the same feature wearing one name.**

- **A question goes to search.** Something that needs a public fact, where the
  answer is not in any thread.
- **A link they dumped goes to the reader.** Structured metadata where the page
  publishes it, the page's own words where it does not.

Neither is a mode, a button or a setting somebody has to find. It is the same
composer and the same dump, and offload decides.

### The scope rule

**offload is a personal assistant, and it reaches the web for the things a
personal assistant reaches for**: what is happening on a day, what somewhere is,
when something opens, how long something takes, what a link somebody kept
actually is. Day to day planning and the activities around it.

It is not a research assistant, a search engine with a chat window, or a way to
ask the world a question. A dump that is not about somebody's own days and plans
gets no lookup, and offload does not explain that it declined: it files what it
can and says nothing about the rest.

**Looking up a person falls outside this rule rather than inside a refusal
list.** Finding out about somebody is not day to day planning, and the scope
rule already excludes it. Their own people are a different thing entirely and
are already in their threads.

### The preference rule

**A lookup is the last resort, not the first.** If a dump can be filed correctly
without one, it is. If a fact is already in a thread, a note or the conversation,
that is the answer. If an answer can be worked out, it is worked out.

This is a rule about cost, latency and exactness in that order, and it is also
the rule that keeps the telemetry honest: a lookup that happens because the model
reached for it reflexively is a lookup nobody can learn anything from.

### What offload does not search for

**A short, closed list, refused without discussion.** offload does not search
for:

- political positions, campaigns, parties or candidates
- violence, weapons, or how to make or obtain either
- suicide, self-harm, or eating disorders
- pornography and sexual content of any kind, and anything sexual involving a
  child under any framing, which is the category the rest of this list is
  generalised from and the one that is never a judgement call

**What happens next depends on whether there is anything to file, and both
halves matter.**

- **There is something to file**: it is filed, and offload says nothing. "Buy a
  hunting knife on Saturday" is a todo somebody wrote and it becomes a todo. The
  lookup simply does not happen, exactly as it does not happen for the hundred
  other dumps a day that do not need one. A refusal is not an event.
- **There is nothing to file**, because the dump was only the question: offload
  says one line and nothing else.

  > I don't search that.

No category is named, no reason is given, no alternative is offered. Naming the
category is an argument about the category, and offload does not have those.

**The boundary that matters is the topic, not the word.** A day is a day: when
the polls are open, when a school term starts, when a march closes the road that
somebody's dentist is on. Those are the diary, and refusing them is refusing the
product. What is refused is the subject matter, not a dump that brushes past it.

**Whose liability this is** is a question for terms of service, which offload
does not have. The product half is here; the legal half is flagged in
"Open, and not mine" below.

### The bounds

Three searches and three page reads in one turn. A turn that needs more says it
could not find it and files what it could. The numbers are per turn rather than
per day because a turn is what a person is waiting for.

### Saying where it came from

A reply built on something from the web carries a **source chip** under it, in
the row that already holds the Done mark and the thread pills: the domain, and a
link that opens it. Same rule as 005's thread links: the chip comes from the
record of what was read, never from the sentence.

This is also a contractual requirement of the search provider, not only a
product preference.

**The chip belongs to the turn, not to the reply.** An ordinary filing turn says
nothing, by the rule 004 settled, and it still read something: the chip sits with
the Done mark and the thread pills, which are also the turn's rather than the
sentence's.

### When the web disagrees with a note

**The note wins, and offload says both.**

> Your note says the 14th. Memorial Day is the 25th.

Somebody's own words about their own life outrank a page about the world, and
the one case where a person most wants to know the machine noticed is the case
where the two disagree.

### The switches

Settings carries two, both on by default, because they are two different
promises:

- **Search the web.** Off, and no query derived from anything they wrote leaves
  for a search company.
- **Read links I paste.** Off, and no URL is opened, including one they dumped
  themselves.

Two rather than one because somebody can reasonably want the second without the
first: reading a link they chose sends nothing of their own words anywhere, and
searching sends a sentence to a third party. Collapsing them would make the
quieter of the two impossible to have on its own.

### What is kept

**The derived fields and the source, never the page.** An Airbnb page read for
dates leaves behind a row with the dates and the link. The page's text is not
stored anywhere, not as content, not as a note, not on the message. This is
OFF-4's rule applied to a new source: process and forget, keep the reference.

## Acceptance criteria

- **AC-1** A dump that needs a public fact to be filed correctly gets one, and
  the fact reaches the row: "add a todo on memorial day" produces a todo dated
  the correct day.
- **AC-2** A dump that can be filed correctly without a lookup does not cause
  one. The suite covers at least: a plain todo, a note, a question answerable
  from a thread, and a dump naming a date in words.
- **AC-3** A URL somebody dumped is read, and what the page publishes about
  itself reaches the row. A Spotify track link produces a row naming the track
  and the artist; an accommodation link with dates produces a row with the dates.
- **AC-4** offload fetches only a URL that a person put in the conversation, or
  one that a search returned. A URL the model composed is refused by the server,
  not by the prompt, and the refusal is covered by a test that tries it.
- **AC-5** A dump on a refused topic causes no lookup. If the dump also contains
  something to file, it is filed and offload says nothing; if it does not, the
  reply is the single line "I don't search that." and no category is named.
- **AC-6** A dump that brushes a refused topic while asking a diary question is
  not refused: polling hours, a school term, a road closure.
- **AC-7** Nothing fetched or searched reaches an analytics event, an LLM trace,
  an application log or an error report. A test asserts the log surface for a
  turn that did a lookup.
- **AC-8** Page text and search results never reach the part of the turn that
  can write. What the writer receives is a validated object with typed fields
  and its sources.
- **AC-9** Page text is never stored. After a turn that read a page, the message,
  the content rows and the notes hold the derived fields and the URL, and no
  page body.
- **AC-10** Three searches and three reads per turn hold. A turn that wants more
  is refused the fourth, files what it has, and says it could not find the rest.
- **AC-11** A reply that used the web carries a source chip with the domain and a
  working link, on all three surfaces.
- **AC-12** With search off, no request leaves for a search provider, and a link
  they paste is still read. With link reading off, no URL is opened, including
  one they dumped. With both off, the dump is filed exactly as it would have been
  before this feature existed.
- **AC-13** A lookup writes one telemetry row carrying a closed label, an
  outcome and a cost, and no query text and no account-linked URL.
- **AC-14** A lookup that fails, times out or returns nothing costs the turn
  nothing else: what could be filed is filed, and the reply says one short
  clause.
- **AC-15** When a thread note and a lookup disagree on a fact, the row is
  written from the note, and the reply names both.
- **AC-16** A lookup happens the same way inside a shared thread as inside a
  private one, and nothing another member wrote can cause a fetch of a URL they
  wrote into the thread.

## Out of scope

- **Progress and cancel.** The brief that says what offload is doing, and the
  way to stop it, are 017. This spec assumes a turn can take longer and does not
  say what the screen does about it.
- **Browsing.** No JavaScript rendering, no clicking, no forms, no logging in to
  anything. The reader reads what a server returns to an anonymous request.
- **Sending anything to a site.** No posting, no booking, no purchase. Every
  outward request is a GET that a person's dump caused.
- **Per-provider integrations.** Weather, holidays and the rest are the point of
  the telemetry in AC-13, and they are the next spec after this one earns them.
- **Images.** No reading an image on a page, no screenshots of pages.
- **MCP.** Recorded in `research.md` with the reasoning, so it is not
  relitigated: it is the right protocol for tools people connect themselves,
  which is a different feature.
- **A research mode.** No multi-step investigation, no report, no activity pane.

## Open, and not mine

- **Terms of service do not exist.** "We should not be liable for what somebody
  asks for" is a promise a privacy policy cannot make and a product cannot
  enforce. It wants terms, and terms want a lawyer. The product commitments in
  this spec, a closed refusal list and a query that is never stored beyond the
  dump it came from, are what engineering can offer.
- **The privacy policy changes with this feature**, and the change is not
  cosmetic: a site somebody linked to receives a request from us, and a search
  provider receives a query derived from what they wrote. Neither is a company
  they picked. Section 6 of the policy, the companies that help us run offload,
  and section 5, what the AI does with what you upload, both move.
