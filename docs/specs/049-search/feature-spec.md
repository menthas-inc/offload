# 049 Search, feature spec

**Status:** drafted 2026-10-30 from the design system's *Search* and the owner's answers of the same day (the group heading, what it reaches, recent searches on the device, one spec; then hard limits, no conversations, accents folded; then meaning from four letters after a pause, results free to reorder as it lands), and revised the same day after the project-lead, client and security reviews (what changed is under Review). The design sources, from the bundle of 2026-10-30:
- `decisions.md`, the 2026-10-30 entry, *Search, as its own tab and page; My threads becomes Threads*;
- the readme's **Search**;
- `handoff/APPLY-2026-10-30-search.md`, which is the design: no kit draws Search yet, and its sizes, radii and colours are the build's, not repeated here;
- `handoff/search-standalone.html`, the final interactive review;
- for the web window's surface, the web kit's `WPalette` (`ui_kits/web_app/WMisc.jsx`), whose tokens it takes.

**Surfaces:** iOS, Android, web, the Core API.
**Depends on:** 013 (what offload can find: `search_text` on content and notes), 014 (thread notes), 028 and 037 (Not in a thread, loose), 038 and 040 (memories, the Memories tab and its field), 009 and 031 (the tabs and the web sidebar), 023 (the mark a thread page draws on what arrived), 046 (the plate's keyboard rule), 048 (live updates: Search holds no live connection and reads again on each keystroke).

**Amends:**
- **The tabs**, on the phones and the web sidebar: Today, Threads, Search, Memories.
- **The word "My threads"**, renamed **Threads** everywhere a person reads it: the tab, the sidebar, the page title, the web's crumbs, the shared-thread notification (*Waiting in Threads.*) and the planner prompt's line on where a thread is deleted, which is a prompt change. Routes and code names stay.
- **The thread page, on both clients,** can be opened at one row or one note: it shows archived rows when that row is archived, opens the fold or section holding it, reads back far enough to reach it, and marks it.
- **The design system's handoff**, in five places the owner settled on 2026-10-30. This feature's design sync applies the bundle on its own branch and logs each in the design `decisions.md` as code leading, with **Design system impact** filled in:
  - the middle group is headed **In your threads**, not *Things*, because thing is retired in copy and Things is a kind of memory on the same page;
  - the placeholder is **Search everything**;
  - Search also finds **thread notes**, as a fourth group, **archived rows**, after the live ones, and **rows in Not in a thread**;
  - the query travels in a request's body, not its address (the handoff's `GET /search?q=`);
  - from four letters, the page also finds by **meaning** after a short pause, which the handoff ruled out ("never embeds the query");
  - the readme takes only the bundle's **Search** section, its tab glyph line and its vocabulary row, since the rest of the bundle's readme is older than `main`.
- **offload's own search** (013) folds accents as this page does, since both read the same indexes (owner, 2026-10-30). Every query that matched before still matches; accented and unaccented spellings now match each other. It changes what the model's search tool finds, so it gains an eval case.
- **The privacy policy**, section 18: the device keeps recent searches as well as display preferences (owner, 2026-10-30). Nothing else in it changes: the companies page already says Voyage receives "the words of a search inside offload", which a query embedded here is.

## Why

Finding something today means asking offload in the composer. That is a model turn: seconds, a cost, and an answer in prose when the person wanted the row. The only other search on any client is Memories' own filter, which reads memories and nothing else.

Most finding is not a question. It is *the Lisbon flight* or *wifi password*: a few letters of something the person put in themselves, which an index answers in milliseconds. Search is that, on its own page, and the composer stays the way to ask.

## What

### 1. The tabs and the rename

- **Phones:** four tabs, **Today, Threads, Search, Memories**, in that order. Glyphs `sun` / `moon`, `lasso`, `search`, `cloudy`. Four fit the plate's row as it is.
- **Web:** the sidebar reads **Today, Threads, Search, Memories**, then Activity and Settings as built. Threads keeps its glyph as built; Search is `search` and carries a key cap, **⌘K** on Apple and **Ctrl K** elsewhere.
- **My threads becomes Threads** wherever a person reads it (Amends lists every place).

### 2. The page, on the phones

**Getting there.** Tapping the Search tab opens the page with the field focused and the keyboard up. Tapping it again while on Search focuses the field again and keeps what is typed. Leaving the tab and coming back keeps the query and the results until the app is closed.

**The bar** is titled *Search*, as Memories draws its bar, with no tools.

**The field** is Memories' field, unchanged: the `search` glyph, the text, an `x` to clear. Placeholder *Search everything*. The search key is a search key; there is no autocorrect. It takes up to 128 characters.

**The keyboard covers the plate**, as it does for every field that is not the composer's. The results scroll clear of the keyboard, so the last row, Ask, can always be reached above it, on Android edge to edge as on iOS. The search key or a scroll puts the keyboard away, and the composer and tabs come back.

**Results show as the person types**, with nothing to press:
- **Nothing waits.** There is no spinner and no placeholder. Thread names the phone already holds match on the first letter and draw at once; the rest follow as the server answers. Keystrokes close together are read once, after the last.
- **One letter** matches thread names only. From two, everything, by its words (three if the impl-spec's plan check says two is too slow).
- **From four letters, meaning too.** When typing pauses for a moment, the query is read once more by meaning, and what that finds joins the results: *boiler* finds the row about the heater. The results may reorder as it lands (owner, 2026-10-30). Typing again before the pause ends asks nothing.
- **A slow answer leaves the previous results standing** until the new ones arrive, and an answer to an earlier keystroke never replaces the answer to a later one.

They come in groups, each drawn only when it has something, in this order, as the handoff draws them:

| Group | Up to | A row shows | Opens |
| --- | --- | --- | --- |
| **Threads** | 5 | the thread's icon, its name, its line (what Threads already says under it) | the thread |
| **In your threads** | 6 | the kind's glyph, the title, then the kind or the date, a dot, the thread's icon and name | the thread, at the row |
| **Notes** | 3 | the glyph the thread page draws for a note, the note's text, the thread's icon and name | the thread, at the note |
| **Memories** | 3 | `cloudy`, the memory's text, *Memory* | Memories, with that memory's editor open |

- **Threads** includes **Not in a thread** when *not in a thread* matches, and it opens Not in a thread.
- A row in Not in a thread shows *Not in a thread* where a thread's name goes, and opens Not in a thread at that row.
- **An archived row** comes after every live one and says *Archived* where its kind or date goes.
- **The matched letters are semibold**, the rest regular.

**At the row.** Opening a row or a note opens its thread with that row on screen and marked for a moment, with the mark the thread page already draws on what arrived (023). Wherever it is: an archived row opens the thread with archived rows shown, a row inside a closed section or a folded widget opens that fold, and a row further back than the first page is read back to. A row or note that no longer exists opens its thread at the top, with nothing marked and nothing said. Back returns to Search with the same query and results.

**Ask offload about "…"** is the last row whenever there is a query. It puts the words in the composer **without sending them**, puts the keyboard away and stays on Search, with the results still there. Sending them is an ordinary dump, answered as today.

**Nothing found:** *Nothing matches "…".* centred, then the Ask row.

**Empty field:**
- *Recent*: up to five searches, newest first, each with `clock` and an `x` that removes it.
- *Threads*: every thread as a chip, its icon and name, in the person's own order from Threads. The chips wrap and scroll with the page.
- A search becomes recent when a result is opened, Ask is pressed, or the search key is pressed. Typing alone records nothing. The same words searched again move to the top rather than appearing twice.

**When the read fails:** thread names the phone already holds still match, and in place of the rest one clause and a retry, the pair Memories already uses: *Couldn't search.* **Retry**. No explanation.

### 3. The web

- **⌘K or Ctrl K** from anywhere, and **/** when focus is not in a text field (an input, the composer, anything editable), open a window over the page. The sidebar's Search opens the same window.
- **The window** is `WPalette`'s surface at the handoff's size: a large input, the same groups and rows as the phones, and a footer naming the keys: *↑↓ move, ↵ open, ⌘↵ ask offload, esc close* (Ctrl in place of ⌘ off Apple). Narrower than the window, it fills the width less the page's gutter.
- **Keyboard:** the arrows move a selection through every row including Ask, and through Recent and the chips when the field is empty. Return opens the selection, ⌘Return runs Ask whatever is selected, Escape or a click outside closes the window and puts focus back where it was. Escape closes only the window, never what is under it. Typing while a row is selected keeps typing in the field.
- **Opening a result** closes the window and goes to the thread at the row or note, Not in a thread at the row, the thread, or Memories with that memory open.
- **Ask** closes the window and puts the words in the composer, unsent and focused.
- **Recent searches on the web** are kept by the browser, apart from the phones'.
- Loading, one letter, a slow answer and a failure behave as on the phones.

### 4. What it finds

- **As typed.** *lisb* finds Lisbon trip and its rows before the word is finished. Every word typed narrows: *lisb fl* finds the Lisbon flight. Case does not matter.
- **Accents do not matter** (owner, 2026-10-30): *sao paulo* finds São Paulo and *cafe* finds café, in names, rows, notes and memories.
- **Thread names match any run of letters**, so *bon* finds Lisbon trip. Rows, notes and memories match from the start of a word, so *bon* does not find a row about Lisbon, and *lis* does.
- **Punctuation and symbols are ignored**: they separate words and never change what matches.
- **Only what the person can see:** threads they are an accepted member of, rows and notes in them, and their own memories, while each exists. A thread deleted or left, a row or note deleted, a note superseded or muted, and a memory forgotten are gone from Search at once.
- **Archived rows are found, after live ones** (owner, 2026-10-30), as offload's own search has found them since 17 October.
- **Words, and from four letters meaning** (owner, 2026-10-30). Under four letters nothing typed leaves offload. From four, once typing pauses, the query goes to Voyage, the company that already embeds what offload holds and the words of offload's own search, and comes back as a vector; nothing else leaves. No model reads it. If Voyage is slow or down, the word matches stand and nothing is said.
- **What meaning reaches:** rows, notes and memories. Thread names match by their letters only.
- **The query is never in an address**: not the request's, not the page's, so it is in no server, proxy or browser history.

### 5. Recent searches

- Kept **on the device** (owner, 2026-10-30): the phone's own storage, and the browser's on the web. They never reach the server.
- At most five. Each can be removed with its `x`.
- **They belong to the account signed in.** Signing out clears them, and deleting the account signs out. Another account signing in on the same device never sees them.
- The privacy policy's section 18 says the device keeps them.

### 6. Accessibility

- The tab is a tab named *Search*; the field is named *Search*.
- After typing pauses, the count is announced once: *4 results*, or *No results*.
- A row is read as one sentence: *Flight to Lisbon, TP1351, event, Fri 7 Nov, in Lisbon trip*. An archived row adds *archived*. Removing a recent search reads *Remove wifi password*.
- On the web the input is a combobox, the results a list box whose groups are named by their headings, and the selection is announced as it moves.
- Every row, chip, Ask and `x` has a target at least 44 by 44, and grows with larger text rather than clipping.
- With reduced motion, the window appears without rising and the mark on a row appears without fading.

### 7. The composer does not change

A question typed in the composer is answered as it is today, by the model, with its own search; the only difference it sees is accent folding.

## Acceptance criteria

**Tabs and rename**
- **AC-1** The phones' tabs read Today, Threads, Search, Memories, in that order, with `sun`/`moon`, `lasso`, `search`, `cloudy`. The web sidebar reads Today, Threads, Search, Memories, Search with `search` and a ⌘K (Ctrl K) cap.
- **AC-2** *My threads* appears nowhere a person reads it: no screen, crumb, notification, or prompt line that tells the model what to say.

**The page**
- **AC-3** Tapping Search opens the page with the field focused and the keyboard up; tapping it again on Search refocuses the field and keeps the query.
- **AC-4** Typing *lisb* shows Lisbon trip under Threads and its rows under In your threads before the word is finished; *lisb fl* narrows to the flight; *bon* finds Lisbon trip by name and no row.
- **AC-5** *sao paulo* finds a thread named São Paulo and *cafe* a row titled Café Lisboa. A question in the composer about *cafe* finds the same row, and every query that matched a row before the change still matches it.
- **AC-6** No keystroke, result or Ask on the page makes a model call. An embedding call is made only from four letters, only after typing pauses, at most once per pause, and to Voyage only; under four letters nothing leaves offload.
- **AC-6b** From four letters, *boiler* finds a row titled *Heater replaced* after the pause; with Voyage unreachable, the word matches stand and no failure is shown.
- **AC-7** Results are grouped Threads (≤5), In your threads (≤6), Notes (≤3), Memories (≤3), each only when it has something, the matched letters semibold. One letter matches thread names only.
- **AC-8** A row opens its thread with the row on screen and marked, including a row past the first page and a row inside a folded widget or a closed section; Back returns to Search with the same query and results.
- **AC-9** An archived row is listed after every live row, says *Archived*, and opens its thread with archived rows shown and the row on screen and marked.
- **AC-10** A row in Not in a thread says *Not in a thread* and opens Not in a thread at that row; Not in a thread appears under Threads when *not in a thread* matches.
- **AC-11** A note opens its thread with the note on screen and marked, its section opened if folded; a memory opens Memories with that memory's editor open.
- **AC-12** A result whose row or note was deleted since opens its thread at the top with nothing marked.
- **AC-13** Ask puts the query in the composer unsent, puts the keyboard away and stays on Search; sending it is answered as any dump.
- **AC-14** A query that matches nothing shows *Nothing matches "…".* and the Ask row.
- **AC-15** An empty field shows up to five recent searches, newest first, each removable, then every thread as a chip in the person's order.
- **AC-16** A search becomes recent only when a result is opened, Ask is pressed, or the search key is pressed; repeating one moves it to the top.
- **AC-17** Thread names held on the device draw before the server answers; a failed read keeps them and shows *Couldn't search.* with Retry, and nothing else.
- **AC-18** An answer to an earlier keystroke never replaces the answer to a later one, and a slow answer leaves the previous results standing.
- **AC-19** With the keyboard up on iOS and on Android, the Ask row can be scrolled into view above it.

**Who sees what**
- **AC-20** Search returns only threads the person is an accepted member of, rows and notes in them, and the person's own memories. A thread deleted or left; a row or note deleted; a note superseded or muted; a memory forgotten; another account's memory; and another account's Not in a thread are never returned.
- **AC-21** Rows in a thread shared with the person are found, whoever added them.
- **AC-22** Any text typed, including `& | ! : * ( ) ' % _ \`, returns results or none, never an error; a query over 128 characters is cut to 128 and searched.

**Web**
- **AC-23** ⌘K or Ctrl K from any page, and / when focus is not in a text field, open the window; the sidebar's Search opens it too; / typed in the composer is typed.
- **AC-24** The window is fully usable by keyboard: arrows through results, Recent and chips, Return, ⌘Return, Escape; focus returns where it was, and Escape closes nothing under the window.
- **AC-25** The input is a combobox, the results a list box with named groups, and the selection is the active descendant.

**Device and privacy**
- **AC-26** Recent searches are kept only on the device and never sent to the server; signing out clears them on that device, and another account on it never sees them.
- **AC-27** No query text appears in any address, log line, analytics event, trace or error report.
- **AC-28** The privacy policy's section 18 says the device keeps recent searches, and nothing else in it is made untrue.

**Accessibility**
- **AC-29** The result count is announced once when typing pauses; each row is read as one sentence with its kind, date and thread; every target is at least 44 by 44.

**Unchanged**
- **AC-30** A question typed in the composer is answered as before, by the model; the only change it sees is accent folding (AC-5).

## Out of scope

- **Typo tolerance.** A misspelling matches only when meaning happens to find it (trigram matching was offered and not chosen).
- **Conversations**: what the person or offload said in a dump is not searched here (owner, 2026-10-30).
- **Showing more than a group's limit** (owner, 2026-10-30). The groups are short on purpose; another letter narrows, and Ask is the way to everything.
- **Filters** by kind, date, label or person.
- **People and connections, labels, settings, commands.** The web kit's command palette (`WPalette`) is not built; this window takes its surface and is search only.
- **Recent searches across devices.**
- **Search inside one thread.**
- **A live page.** Results are read on each keystroke, not pushed.
- **Meaning under four letters**, and thread names by meaning.

## Edge cases

- **A thread renamed, deleted or left while results are up:** the next keystroke reads it fresh. Opening a stale result opens what the thread page shows for a thread you cannot see.
- **The same row matching several words** is listed once.
- **A memory and a thread note with the same words** are listed in their own groups.
- **A query of only spaces or punctuation** is an empty field.
- **Offline:** as a failed read.
- **Another account on the device:** its own recent searches, never the last account's results.

## Review, 2026-10-30

Project lead, client and security, in parallel, on the first draft. Changed:
- **The query moved out of the address** (security, and the project lead): a request body, not `?q=`, since an edge, proxy or browser history records an address whatever our own logger does. AC-27 covers addresses.
- **Opening at a row is specified, not asserted** (all three): no client can do it today. The thread page gains it as an amendment, with archived, folds, history and paging named, and a deleted row's fallback (AC-8, AC-9, AC-11, AC-12).
- **What the person can see** names superseded and muted notes, another account's memories and another account's Not in a thread (AC-20), and any typed text is safe (AC-22), from the security review's injection, wildcard and scope findings.
- **Loading, one letter, a slow answer** are stated (client), from the handoff's local-first drawing.
- **Ask on the phones stays on Search** (project lead), and on the web fills the one composer.
- **The Android keyboard** cannot hide Ask (client, AC-19).
- **Thread names and the rest match differently**, and the spec says which (project lead).
- **The web window takes `WPalette`'s tokens** rather than the handoff's literal ring colour (client), and narrows on a narrow window.
- **Web keyboard details**: / never steals typing, Escape closes only the window, groups are named, the arrows reach Recent and chips (client).
- **Meaning from four letters** (owner, after the reviews): words on every keystroke, one embed per pause from four letters, fused into the results. The reviews saw the words-only draft, so the tech lead review of the impl-spec covers this.
- **Accent folding** names the model's eval case and the guarantee that nothing that matched stops matching (project lead).
- **Recent searches belong to the account signed in** (security).
- **Visual numbers cut**: the handoff owns sizes, radii and colours; behaviour stays (project lead). The mark on a row is the existing one, no new colour (client). Reduced motion stated.
- **Depends on** gains 023 and 048. *Item* became *the sidebar's Search*.

Not changed, on purpose:
- **The project lead's "notes have no index"**: they do. 0027 gave `memories` a `search_text`, and 0033 renamed the table to `notes`; `search/read.ts` already queries it.
- **A minimum query length on the server above two characters**: one letter is answered on the device from thread names, which is what the person sees first anyway.
- **"Every thread as a chip" stays uncapped**: a thread count is what Threads already draws in full, and the chips wrap.
- **The design log entry is not written on `main`** (client): the owner's rule of 2026-10-02 is that a feature's design bundle is synced on its own branch when other sessions carry design too, and it is a task here.
- Rate limiting, statement timeouts and query bounds are the impl-spec's.

## Constitution gate, 2026-10-30

Read fresh from `docs/constitution/principles.md`, against this spec as revised.

| Principle | Verdict | Evidence |
| --- | --- | --- |
| DEV-1 (MUST) | Compliant | One route, one migration, one thread-page parameter, a page per client. The groups, field, mark, fusion and composer fill are existing pieces; no filters, paging or commands. |
| DEV-2 (MUST) | Compliant | Every change to an earlier spec or to the design is under Amends, and the design divergences are logged by the design sync task. |
| DEV-3 (SHOULD) | Compliant | Postgres full-text search with `unaccent`, pgvector and Voyage, all already in use. |
| QUAL-1 (MUST) | Compliant | Every AC is testable; the tasks open each with a failing test. |
| QUAL-2 (SHOULD) | Compliant | Search is a read with no side effects; recent searches are the device's own. |
| SEC-1 (MUST) | Compliant | Any typed text is data (AC-22): tokenised before it reaches a query, wildcards escaped, bound as parameters. Ask is an ordinary dump, a user turn. The Voyage key stays in the environment. |
| SEC-2 (MUST) | Compliant | The server decides what is returned from the session's account (AC-20); the client never sends a thread or account to search within. |
| DATA-1 (SHOULD) | Compliant | The migration and every read are in the impl-spec before code. |
| OFF-1 (MUST) | Compliant | The query is in no address, log, event, trace or error report (AC-27); a log line carries route, outcome and length. Recent searches stay on the device. Nothing durable or derived is written. |
| OFF-2 (MUST) | Compliant | No encryption is claimed for recent searches or anything else. |
| OFF-3 (MUST) | Compliant | Membership through the readable views; memories by the account's own scope; shared rows found by membership, not authorship (AC-20, AC-21). |
| OFF-4 (MUST) | Not applicable | No connector content is fetched or kept; calendar rows already in a thread are found like any row. |
| OFF-5 (MUST) | Not applicable | No model output crosses a boundary: no model is called. |
| OFF-6 (MUST) | Not applicable | offload takes no action. Ask fills the composer and sends nothing; removing a recent search is the person's own act on their device. |
| OFF-7 (SHOULD) | Compliant | Tokens only; the five divergences are logged with Design system impact by the design sync task. |
| OFF-8 (MUST) | Compliant | Nothing enters a prompt. Accent folding changes which rows the model's search finds, not how many: `ANSWER_RESULTS` and `ANSWER_SETS` still bound it. |

Watched specifically:
- **OFF-1:** the query is content. It travels in a JSON body, Fastify's request serialiser logs the route only, a Voyage failure logs the status and never the body (as the agent's client does), and there is no search event.
- **OFF-3:** the memory arm reads through `active()`, never `notes` by scope alone, because `readable_notes` holds thread notes only.
- **OFF-6:** nothing automatic.

GATE: PASS
