# 040 The Memories tab, feature spec

**Status:** drafted 2026-10-06 from the design system's *The Memories tab* and the owner's answers of the same day, and revised the same day after the project-lead, client and security reviews (what changed is under Review). The design sources:
- `decisions.md`, the 2026-10-06 entry;
- the readme's **The Memories tab**;
- `handoff/APPLY-2026-10-06-memories.md`;
- the kit, `ui_kits/memories_tab/`;
- `handoff/memories-standalone.html`.

**Surfaces:** iOS, Android, web, the Core API, the agent.
**Depends on:** 038 (memories), 014 (notes and the embed sweep), 009 and 031 (the tab bar and the web sidebar), 030 (a thread's List | Map switch, map tokens), 022 (shared threads).
**Ships in four parts**, one PR each, in the handoff's order. One spec (owner, 2026-10-06), with the ACs grouped by part:

| Part | What | ACs |
| --- | --- | --- |
| A | Five kinds, the routes, the 300 cap, edits and forgets | AC-1 to AC-9 |
| B | The tab, the list and the editor, on three surfaces | AC-10 to AC-17 |
| C | Embeddings, and the memories a model is given | AC-18 to AC-23 |
| D | The nightly layout and the map | AC-24 to AC-30 |

**Part B ends OFF-1's exception, without waiting for the map.**

**Amends:**
- **038's classes.** Six become five: *Their words* folds into About.
- **038's reach** (section 4, AC-14):
  - the newest fifty become the relevant fifty, in an order that keeps the person's own before offload's;
  - the cap becomes 300 an account;
  - rules are capped at twenty.
- **038 section 5, seeing and correcting.** It moves to the tab, and **OFF-1's dated exception ends** with Part B.
- **038's out of scope.** Memories are embedded, on their own row, never in the search corpus.
- **`docs/tech/context-and-memory.md`.** The per-account block is two parts: rules, stable and cached; and the relevant memories, chosen each turn and not cached.
- **The Notes tab.** It becomes Memories on all three surfaces, and its identifiers rename.
- **The privacy page and the companies page,** before any code that embeds a memory (Part C), and the privacy page's memory bullet before Part A ships. Both are listed in AC-31.
- **`docs/tech/decisions.md`,** which gains an entry.

## Why

038 shipped what offload knows about a person with no screen for it. The only ways to see a memory were asking, the export, and the reply that named one as it was written, and OFF-1's dated exception holds until there is a screen. Meanwhile:
- the Notes tab is an empty screen on the phones and a disabled row on the web;
- there is no way to type a memory, fix a wrong one, or see what offload learned overnight.

Two more things come with it:
- **Volume.** Typing makes it easy to keep more than the fifty a prompt carries, and the newest fifty are the wrong fifty for most turns.
- **Their words.** It was a class nobody could tell apart from About.

## What

### 1. Five kinds

People, Things, About, Rules, Patterns. *Their words* becomes part of About: what a name or a shorthand someone uses means is a durable fact about them. Existing *words* memories become About.
- **The nightly pass writes four:** People, Things, About, Patterns. It has never been able to write a rule.
- **The `memory` tool and the tab write all five.**

### 2. Writing from the tab

Typing in the tab is the person, so it is held to less than the live turn (no ask words, no grounding in a message) and to the same never-list.

**Add.** A sentence and a kind, origin *stated*, no source message. The editor says *You added this.*
- **The refusals:**
  - empty, or over 200 characters;
  - the never list (ID, account and card numbers, passwords, immigration status);
  - on People, an email, a phone number or a street address.
- **The sensitive list is allowed:** typing it is asking.
- **The kind is preselected,** so nobody has to choose before they can put something down. It is About, or the kind of the map's cloud when added from a zoomed map. Save needs text, never a choice.
- **Stored exactly as typed** (owner, 2026-10-06). "My sister is Rina" stays in the first person, and the model is told that a first-person memory is the person speaking.

**Change.** The sentence, the kind, or both, held to the same refusals.
- **A changed learned memory becomes the person's own** (*stated*). Its source message is recorded so the overnight pass cannot learn the old words again from it, and is then cleared, since they are no longer the words it came from. The editor says *You changed this.*
- **An answered memory keeps its calendar link while only its kind changes.** Changing its sentence severs the link (owner, 2026-10-06): offload cannot know the renamed sentence still means that calendar. It becomes the person's own (*stated*) with no calendar and no name it settles on, and the next "with Meera" asks again. The editor says so before Save: *Changing the words means offload asks which calendar again.*
- **A change to words another memory already says is refused:** *That's already a memory.* It is checked before writing, never by catching the database's refusal, whose detail would carry the words.

**Rules** are followed in every turn, so they are held to more:
- at most **twenty active rules**; a twenty-first is refused: *That's twenty rules. Forget one to add this.*
- turning another kind into a rule is a change like any other, and the sentence is in the request, so the person has seen the words they are making an instruction.

**Forget.** It leaves every prompt at once and the conversation it came from stays. When it had a source message, the words cannot be learned again from it. A typed memory has none, so the pass may learn the fact again later; that is the cost of keeping nothing of a forgotten sentence. Eight seconds of Undo on the toast, as with threads, with no confirmation.

**The cap is 300 active memories an account** (owner, 2026-10-06). It sits beside 038's twenty-five learned:
- **At the cap, the oldest learned memory gives way to a new one of the person's own,** since offload may delete only what it wrote. Only when all 300 are the person's own is an add refused: *That's 300. Forget one to keep this.*
- **The turn's remember** refuses the same way with its own line: *Memories are full. Forget one in Memories first.*
- **The overnight pass** adds nothing at the cap.
- **The tab says so** at the top of the list while the cap stops anything: *Memories are full, so offload has stopped learning new ones.*

**Every memory route takes the account from the session,** resolves the memory through `scope = 'account'` and that account as its subject, and answers 404 for anything else. That covers a thread note's id, another account's memory, and a memory under any thread grant. Writes are JSON POST, PATCH and DELETE only, which is what keeps the cookie and CORS defences real.

### 3. Which memories a model is given

**The relevant fifty, not the newest fifty** (owner, 2026-10-06). Relevance is a quality choice, not an OFF-8 requirement (the 300 cap already bounds the prompt): a profile of 300 lines buries what matters to the turn in front of it. The order:
1. **Every active rule** (at most twenty), the person's standing instructions. This part changes only when a rule does, so it stays cached.
2. **The person's own (asked, answered, typed) nearest the turn's words**, then **offload's learned ones nearest**, to fifty in all. A learned memory never pushes out one of the person's own: corrections beat inference.
3. **Fifty or fewer active memories:** all of them, in that order, and nothing is looked up.

**What the nearest are measured against** is the person's own words in the turn and nothing else:
- the dump's typed or spoken words, or a forwarded email's note, never its body;
- never a page, a photo's text or another member's words;
- at most 2,000 characters.

Mail, pages and other people's words never go to the embedding provider as a query, and never choose which memories a prompt carries.

**One query, once per turn.** One embedding, with a hard limit of 300 milliseconds and no retry. A timeout or a failure is *unavailable*: the turn gets the rules and then the newest of the rest, as today, and goes on. Each query is billed as a search query is, in the Voyage bill the admin panel pulls; nothing prices a single query (*corrected while building, 2026-10-06: the first draft said each was metered, and no search query is either*). *Amended while building, 2026-10-06: a cold connection to Voyage took 302ms and a warm one 209ms, so the query starts as soon as the turn's words are read, runs while the rest of the context loads, and the turn waits at most 300ms after that load. The passes, which nobody waits on, allow it two seconds.*

**The passes:**
- **The overnight memory pass** is given at most fifty held memories: those nearest the day's own messages it is shown (one query of their words joined, the same 2,000-character bound), the person's own before learned. It is the same set it may read, built by the Core API.
- **The thread pass** is given at most fifty, nearest the thread's name and its own trusted notes, in single-member threads only, as 038 has it.

### 4. The tab

As drawn in `ui_kits/memories_tab/` and the handoff, on all three surfaces, with what follows.

**The tab:**
- **Notes becomes Memories,** with the `cloudy` glyph. The phones' tab key, route and screen are renamed to memories; `/notes` redirects for anyone holding the old link. The web sidebar row opens it.
- **The phone bar** shows the title **Memories** where the other tabs show the wordmark, as drawn; that divergence is logged.
- **Empty:** the empty line becomes *Nothing kept yet. Tell offload something to remember, or add it here.* with the plus. No switch and no search.
- **Loading:** one spinner, no skeleton.
- **A read that fails:** *Couldn't load your memories.* beside **Try again**.
- **A write that fails:** the toast's failure form, *Couldn't save that · Retry*.

**The app bar** carries the title, **List | Map** (`Segmented`'s icon variant, opening on List), search and plus.
- **The glyphs** are the same on all three surfaces: `list` and `map`. The web's 030 switch uses `map-pin`, and this one matches the phones; logged.
- **Targets** are 44px, with hit slop where a glyph is drawn at 40.
- **The web pane** uses `PaneHead`: search and plus as its two tools, the open editor as the right-hand pane.

**Search** filters the list as you type, client side, over the list already loaded.
- An empty result reads *Nothing kept says "…".*
- On the map, what does not match fades to 18%; when nothing matches, the same line is shown.
- Closing search clears it.

**The list:** **By kind | Newest**.
- By kind is one section per kind in the kind order, each with its dot and count; an empty kind is not drawn.
- Newest is *This week* and *Earlier*.

**A row:**
- the sentence in full, then *You said · 3 Oct*, *Your answer · 2 Oct* or *✦ Learned · Yesterday*;
- tap opens the editor;
- on the phones, a swipe parks the row over **Forget** at the shipped 88px;
- on the web, Forget sits in the editor; there is no swipe.

**Forget** gives the toast *Memory forgotten* with **Undo** for eight seconds on all three. That is a change from the web's confirm-inline for threads, and it is logged.

**The editor:**
- **Container:** `DragSheet` with `keyboard="lift"` on the phones (focused after the sheet arrives, a drag is Cancel, predictive back on Android); the right-hand pane on the web.
- **The field:**
  - the sentence, with an `n/200` count;
  - the return key and Enter save, and a newline is refused;
  - Escape cancels on the web;
  - the placeholder is *Something offload should know, in your words*.
- **The kind:** the five as a grid, preselected (section 2).
- **Where it came from:**
  - *You asked offload to remember this*, said in a thread;
  - *Your answer to "Which calendar is shared with Meera?"*. The question's own words, with no calendar name anywhere in the row or the response.
  - *offload learned this*, from what you said in a thread;
  - *You added this*;
  - *You changed this*.

  The thread is named only while the person is still in it, and the default thread reads *Not in a thread*. When the source is gone, the line is the same with no *in* clause. On an answered memory the severing line shows (section 2).
- **Forget**, last; not on a new one.
- **A refused add or change** keeps the editor open with the reason under the field.

**Colour is the kind, never the origin.** People `--label-2`, Things `--label-1`, About `--label-6`, Rules ink, Patterns `--label-5`; a learned memory carries the spark in `--text-noticed`. The row is a new memory row; `MemoryRow`, the thread note's row, is not reused for it.

### 5. The map

The same memories in space: each kind a cloud of its colour, and inside it memories that mean similar things near each other. The handoff's section 6 is the drawing, with these changes:
- **A kind with no memories is not drawn,** and has no label and no zero.
- **Under ten memories** the map opens at a zoom that shows sentences, not dots.
- **Dark:** the light ground and clouds are multiplied onto the paper; in dark they are screened onto it at lower strength (owner, 2026-10-06). Screenshotted on all three surfaces for the owner, and logged for the designer to confirm or redraw.
- **The kind centres, the world sizes and the cloud radii** are one shared module the three clients import, never typed three times.
- **Durations** are motion tokens: the flight is the map camera's `--duration-slow`, and the sheet is `--duration-sheet` on `--ease-out`. Point shadows are 030's `--shadow-point` tokens.
- **Reduced motion** jumps instead of flying, owned where it already is (`cameraMs` on the phones, the `prefers-reduced-motion` block on the web).
- **The phones draw the map with Skia,** as the prism field and the thread wash already blend. **On-device checks:** pan and pinch against the back gesture and the tab bar, and frame rate at 300 memories.
- **The list is the accessible view.** On the map every dot, pill and label is a real button named by its sentence and kind, or "Go to People", never a span.

**Where each memory sits is decided on the server,** so the map is the same every time it opens:
- **Embeddings.** Each memory's embedding is kept on its own row. They are made by the embed sweep within a minute of a write or a change, and never enter the search corpus.
- **Nightly.** At the start of each account's daily run, the Core API lays each kind out from the distances between its memories, computed by the database. Nearer meaning is placed nearer, one row per memory, no two rows in a kind closer than the row pitch, and the same input always gives the same layout. The result is each memory's offset from its kind's centre.
- **Between nights.** A new memory, or one whose kind changed, is drawn beside its nearest neighbour in its kind, or on the first free row when it has no embedding yet.

### 6. Seeing and correcting

The tab is where memories are seen and corrected. Asking and the export still work. With Part B shipped, **OFF-1's dated exception of 2026-10-05 ends**, and `principles.md` says so.

## Acceptance criteria

**Part A: kinds, routes, the cap, edits and forgets**
- **AC-1** After the migration no memory has kind *words*; the account-scope check allows the five; the pass's schema and the Core API's pass route allow four (no *rules*, no *words*); the `memory` tool and the tab routes allow five.
- **AC-2** `GET /v1/memories` returns every active memory of the session's account, unpaginated: id, kind, text, origin, day, and source (message, note, answer or none, with a thread only while the account is in it, the default thread as not in a thread). It returns no calendar name.
- **AC-3** `POST /v1/memories` adds a *stated* memory with no source after section 2's refusals, accepting rules and sensitive subjects, with the kind defaulting to About.
- **AC-4** `PATCH /v1/memories/:id`:
  - changing a learned memory makes it *stated*, records its source message as forgotten, and clears it;
  - changing only an answered memory's kind keeps its link;
  - changing an answered memory's sentence makes it *stated* with no calendar and no name, and the next "with <name>" asks;
  - a sentence another active memory already says is refused with no write.
- **AC-5** `DELETE /v1/memories/:id` forgets as 038 does, with or without a source message, and `POST /v1/memories/:id/restore` within the window puts it back; neither takes the source message.
- **AC-6** At twenty active rules a twenty-first is refused.
  - At 300 active memories, an add takes the oldest learned memory's place when there is one, and is refused when there is none.
  - The turn's remember refuses with its line.
  - The pass adds nothing.
- **AC-7** Every memory route resolves the memory by account scope and the session's account and answers 404 for a thread note's id, another account's memory, or anything else; the routes accept only JSON bodies on POST, PATCH and DELETE.
- **AC-8** No route, log line, analytics event or error carries a memory's text: ids, kinds and outcomes only.
- **AC-9** A first-person memory is read by the model as the person speaking: the block says so, and an eval case holds it.

**Part B: the tab, the list and the editor**
- **AC-10** On iOS, Android and web the tab reads Memories with `cloudy`. The phones' tab key and route are `memories` and `/notes` redirects there. The web sidebar row opens it.
- **AC-11** With no memories the tab draws its empty line and the plus; while loading, one spinner; a failed read draws its line and Try again.
- **AC-12** The list shows every active memory:
  - By kind, with sections in kind order, empty ones not drawn, and counts;
  - Newest, with This week and Earlier;
  - each row with its sentence, its origin and its day.

  At the cap the list carries its line.
- **AC-13** Search filters the list client side, says so when nothing matches, and clears on close.
- **AC-14** The editor adds, changes and forgets as section 2 says, preselects a kind, refuses a newline, and stays open on a refusal with the reason. Where the memory came from reads as section 4 has it, with no calendar name.
- **AC-15** A forget from a phone swipe or the editor shows *Memory forgotten* with eight seconds of Undo on all three surfaces, and a failed write shows the failure toast with Retry.
- **AC-16** The phone editor is a `DragSheet` with the keyboard lifting it, checked on a device with the keyboard up on both phones, and the bar checked at 200% text.
- **AC-17** OFF-1's exception is ended in `principles.md`.

**Part C: embeddings, and what a model is given**
- **AC-18** Every active memory has an embedding within one sweep of its write or change, on its own row. The search corpus and its reads never hold a memory.
- **AC-19** With more than fifty active memories, a filing or answering turn is given every rule, then the person's own nearest the turn's own words, then learned ones nearest, fifty in all. With fifty or fewer it is given all, and no embedding is requested.
- **AC-20** The query text is the person's own words only (no email body, page, photo text or other member's words), at most 2,000 characters. A query that fails, or has no vector 300ms after the rest of the context is loaded, gives the rules then the newest, and the turn goes on.
- **AC-21** The memory pass and the thread pass are given at most fifty, chosen as section 3 says, from the sets they may already read.
- **AC-22** The rules part of the block keeps its cache breakpoint; the chosen part does not carry one.
- **AC-23** A cast case shows a relevant old memory reaching a turn ahead of 250 newer, unrelated ones.

**Part D: the layout and the map**
- **AC-24** The daily run lays out each kind once a day. The same embeddings always give the same offsets; no two offsets in a kind are closer than the row pitch; a fixture distance matrix gives a fixture order.
- **AC-25** A memory with no offset is placed beside its nearest neighbour in its kind, or on the first free row.
- **AC-26** The map draws only kinds that have memories, with their labels and counts. Below zoom 0.55 memories are dots, and from 0.55 sentences. Kinds off screen dock in one row along the top.
- **AC-27** Under ten memories the map opens at a sentence zoom.
- **AC-28** The kind geometry is one shared module the three clients import; durations and shadows are tokens.
- **AC-29** In dark the clouds and ground are screened, not multiplied, and screenshots of all three surfaces in both themes go to the owner.
- **AC-30** Every dot, pill and label on the map is a button named by its sentence and kind, in list order; reduced motion jumps.

**Docs and claims**
- **AC-31** Before Part A ships:
  - the privacy page's memory bullet lists typing in the tab as a fourth way a memory is kept;
  - section 16 names the Memories tab as where they are seen, changed and forgotten.

  Before Part C ships:
  - the companies page's Voyage row *does* reads "Makes what offload holds searchable, lays out your memories by meaning and finds the ones a message needs";
  - its *receives* reads "The text being indexed, your memories, the words of a search inside offload, and your own words in a message or a thread's name and your notes in it, to find the memories it needs".

  Both pages' dates move. Also amended: the 038 spec, the 029 eval principle and the cast (five kinds), `CLAUDE.md`'s vocabulary note on the phones' route, `context-and-memory.md`, and `docs/tech/decisions.md`.

## Out of scope

From the handoff, not taken:
- chips and a review queue for what was learned;
- a portrait grouped by subject;
- dragging between clouds to change kind;
- a vessel to drop into to forget;
- second-person display.

Also out:
- memories in search results;
- a notice when the overnight pass learns something;
- refusing a near-duplicate the pass proposes by its distance to an existing one. A good next step, once there are numbers on how often it happens.

## Privacy

What leaves offload changes in two ways, both said on the companies page before Part C ships:
- **Memories go to Voyage to be embedded.**
- **The person's own words in a message go as a query.** Only their own: never a forwarded email's body, a page, a photo's text or another member's words.

What is kept grows by an embedding and two numbers on each memory's own row. They go with the row when a memory is forgotten and purged, and with the account when it is deleted. The export carries neither. The 300 cap bounds all of it. `GET /v1/memories` keeps the app's `no-store`, and no client keeps the list offline.

## Constitution

- **OFF-1's dated exception of 2026-10-05 ends with Part B.** Corrections beat inference again in what reaches a prompt: the person's own before learned.
- **OFF-6:** a forget is reversible for eight seconds. A change is the person's own edit, like a renamed thread, with no Undo. The one that severs a calendar link says so before Save.
- **OFF-8:** at most fifty memories in a prompt, from at most 300.

## Review, 2026-10-06

**Changed after the reviews.**
- **Four parts and four PRs,** ACs grouped by part, with OFF-1's exception ending at Part B (project lead).
- **The person's own memories before offload's** in what reaches a prompt (all three reviews). The first draft's pure relevance would have let a learned sentence push out a correction.
- **The query is the person's own words only, bounded, with a 300ms limit and a defined fallback** (security). Mail bodies, pages and other members' words never go to Voyage as a query or steer which memories a prompt carries.
- **Embeddings live on the memory's own row,** never in the search corpus (project lead, security), so search cannot return one and a forgotten memory cannot come back through a stale chunk.
- **The layout runs in the Core API** at the start of the daily run, from distances the database computes, so `store.ts` stays the one write path (project lead, security).
- **Rules are capped at twenty, and the 300 cap retires learned memories before it refuses the person** (project lead, security). The first draft refused the person while keeping offload's own.
- **Edits close their holes:**
  - an edited learned memory records its source so it is not re-learned;
  - an answered memory's severed link clears both the calendar and the name, and says so before Save;
  - a duplicate is checked before writing.
- **The tab's forget has its own restore by id** (all three): 038's restore keyed on a turn's message, which a tab forget does not have.
- **The states the design does not draw:** empty with a plus, loading, a failed read or write, the cap line, search on the map, a gone source, a severed answer.
- **The phone editor is `DragSheet`, with the return key saving** (client). The handoff's timed sheet would have reopened the keyboard trap DragSheet's comment records.
- **The design divergences, each logged:**
  - the title in the phone bar;
  - the toast on the web's forget;
  - the switch glyph;
  - the plus on empty;
  - the 88px swipe;
  - the dark map.
- **Routes and identifiers.** Every route is scoped by the session's account; the phones' route and tab key rename.
- **Claims.** The companies page's *receives* cell, and the privacy page's fourth way a memory is kept.
- **The design bundle is not synced wholesale** (client). It would drop thirteen decision entries, three map tokens, the wash tokens, a brand mark and three handoff files, and add C2PA blobs to 74 icons. Only the memories files, the readme section and the decision entry are taken.

**Not changed, deliberately.**
- **The map stays in 040,** as the owner asked, as the fourth PR.
- **Relevance stays** (owner), stated as a quality choice.
- **No near-duplicate refusal by distance yet;** see Out of scope.
