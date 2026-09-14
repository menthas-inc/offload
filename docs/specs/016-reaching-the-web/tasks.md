# 016 Reaching the web, tasks

Ordered. Each cites the acceptance criteria it satisfies and the principles it
has to keep. Tracks are API, Agent, Mobile, Web and Design, and the feature is
closed only when all five pass.

## Blocking, before anything ships

- [ ] **T-1 The privacy policy names what leaves and where it goes.** Sections 5
  and 6 both move: a search company receives a query derived from a dump, and a
  site somebody linked to receives a request. Section 6's table names neither
  today. *AC-22. CLAUDE.md's rule that the page is a claim surface, so this
  ships before or with the code and never after.*
- [ ] **T-2 The design system answers three questions before a client is
  touched**: the `source` chip kind and its `outline` tone in all three kits, the
  turn footer that exists whether or not offload wrote a sentence, and the
  amendment to the voice rule that lets offload say "I" about its own limits.
  Each is an entry in `decisions.md` with the Design system impact field filled
  in. *AC-11, OFF-7.*

## Setup

- [ ] **T-3 Migration**: `turn_sources`, `lookups`, `domain_reads`, and the two
  account columns, with the suppressing view over `domain_reads`. Recreate any
  `select *` view over `accounts` in the same migration, which is 0028's lesson
  and has caught us twice. *DATA-1.*
- [ ] **T-4 The switches end to end**: read in `GET /v1/settings`, written by its
  update path, read **server-side in the worker** at call time. A test asserts a
  flag on the dump request cannot enable a lookup. *AC-12, AC-30, SEC-2.*

## Agent plane

- [ ] **T-5 `reader.py`**, through the shared masked harness, with the basic tool
  versions, `use_cache: false`, `max_content_tokens` 10,000, the blocked-domain
  backstop, a forced tool call for output and one repair retry. *AC-8, OFF-5.*
- [ ] **T-6 Bounds as state, not as prose**: three searches per turn carried
  across every `look_up` in it, one fetch per pasted link. A test uses a page
  that asks to be followed and asserts no second fetch. *AC-10, AC-25.*
- [ ] **T-7 What crosses back**: `Found` with fields, sources of `{domain, url}`
  only, `unsure`, and a label coerced to `other` when it is off the list. A test
  feeds a citation carrying a title and quoted text and asserts neither appears
  anywhere downstream. *AC-26, AC-28.*
- [ ] **T-8 Validation-failure logging** carries the field name and the error
  type. A test asserts the completion is absent from the log surface. *AC-27,
  OFF-1.*
- [ ] **T-9 `look_up` in the planner's toolset**, sent only when the relevant
  switch is on, with the tool definition budget re-measured, since it fired at
  1,544 against 1,500 once already. *AC-12, OFF-8.*
- [ ] **T-10 The prompt**: the scope rule, the preference rule, the refusal list
  and what happens on each. Then `/test-llm`, which is what this repo has
  instead of an opinion about prompts. *AC-1, AC-2, AC-5, AC-6, AC-17.*

## Core API

- [ ] **T-11 Provenance checks on the tool call**: the URL must appear as a link
  in the dump, and every token of the question must appear in the dump. Refused
  with a reason the model can act on, never silently. *AC-4, AC-16, AC-24,
  SEC-1.*
- [ ] **T-12 `turn-result` carries sources and lookups**, written in the same
  transaction as the rest of the turn, and `domain_reads` incremented with no
  account attached. *AC-13, AC-23, OFF-1.*
- [ ] **T-13 Sources on the read paths**: `GET /v1/messages/:id` and the SSE
  `done` event, one shape. *AC-23.*
- [ ] **T-14 Nothing is stored from a page**: a test reads a fixture page with a
  long body and asserts the message, the content rows and the notes hold the
  derived fields and the URL and no page text. *AC-9, OFF-4.*

## Clients, all three

- [ ] **T-15 The turn footer**, per T-2's contract, holding the Done mark, the
  thread pills and the source chips, on a turn with no reply as well as one with.
  *AC-11.*
- [ ] **T-16 Source chips**: up to three, then a count, outline tone, domain as
  the label, opening the URL. *AC-11, AC-21.*
- [ ] **T-17 The two switches** in the Privacy group beside "Let offload notice
  patterns", titles without full stops, each with its note. *AC-12.*

## Tests that are the feature rather than about it

- [ ] **T-18 The refusal set**, as an eval with a held-out half: the case table
  in the feature spec is the tuning set and a fresh one is written without
  looking at it. Reported as a pass rate. *AC-5, AC-6, AC-17.*
- [ ] **T-19 The scope set**: general knowledge that is not about anybody's day,
  asserted to cause no lookup. *AC-17.*
- [ ] **T-20 The injection set**: a shared thread holding a note that reads like
  planning and names a third party, a note holding a URL, and a page that asks to
  be followed. None of them causes a lookup or a fetch. *AC-16, AC-24, AC-25.*
- [ ] **T-21 The log surface**, for a turn that looked something up, that failed
  a lookup, and that refused one. Nothing anywhere. *AC-7, AC-29, OFF-1.*
- [ ] **T-22 The unused-lookup rate** is queryable and reported. *AC-18.*

## Not in this spec

017 is the brief and the cancel. A weather tool, a holidays tool and anything
else per-provider waits for T-22's numbers to argue for it.
