# 025 Labels

**Status:** drafted 2026-09-26 against the design handoff of the same day (`handoff/APPLY-2026-09-26-labels.md`, `explorations/labels.html`, the readme's **Labels** section, `LabelMark`, `Chip label`), synced into `.claude/skills/offload-design/` on `main` at `faa9ef6`, with the product owner's answers of the same day and the three reviews (project lead, client, security) folded in
**Surfaces:** iOS, Android, web, the Core API and the agent plane
**Depends on:** 006 and 007, whose `tags` and widget grouping this retires; 014, whose notes carry labels as content does; 015, whose timeline and rail the filter narrows; 016, whose provenance bound the live creation rule borrows; 017, whose turn footer draws the mark; 018, whose tag question goes; 022, whose membership predicate every label read and write goes through; 023, whose person-facing edit route gains `labels` and whose row owns the marks line; 024, whose Activity records what offload labelled and which this amends to carry its first Undo
**Amends:** 024's Activity contract (a row may carry one action, and *Undone* is rendered from a column rather than written into the words); 007's grouping, retired; 018's tag question, retired; 006's AC-8 on tags, retired


*Amended 2026-10-03 by 030: the split pin is built. A point on a thread's map takes its labels' colours, split for two, and the map's points follow the filter bar's pick; the Places section is retired.*

*Amended 2026-10-02 by 032: the nightly sort is deleted, its job, worker, prompt, endpoint and switch. Labels come from people and from live turns. Activity rows it wrote keep their Undo until they age out.*

## Why

A thread can hold more than one subject. A trip across Lisbon, Paris and Istanbul keeps all three cities in one flat list, and on a long trip that list is confusing to read and slow to find anything in. Today a thread's only arrangement is by type: To do, the widgets, notes, the list.

offload already tries to group, invisibly. Since 006 the model writes `tags` such as `city:lisbon` onto a row, 007 lets a widget sub-group by one of those dimensions, and 018 can ask which dimension to group by. None of it can be seen, named, corrected or started by a person, it groups inside one widget at a time, and 007 logged the risk this feature now has to settle: a filter and a grouping shipped side by side is two ways to do one thing. Labels replace it, as the product owner decided on 26 September.

The product's rule is that nobody has to choose a folder before they can put something down. Labels keep that: nothing asks for a label, offload applies them when it can tell, and a person can make, apply and correct them afterwards.

## What

### Vocabulary

A **label** is a named, coloured group inside one thread. A row **carries** labels; a person or offload **applies** and **removes** them. The **marks line** is the row's line under the title that holds the date chip and the labels. A **mark** is `LabelMark`, drawn on a row; a **label chip** is `Chip label`, pressed in the **filter bar**. The **label sheet** labels one row; the **label's list** labels many rows at once and is where a label is renamed, recoloured and deleted. A **sort** is one run of offload's labelling, nightly or in a live turn. In schema and code the nouns are `labels`, `content_labels`, `note_labels` and `label_runs`, and a row is still `content`. Nothing a person reads says tag, category, folder, item or thing; a count stands on its own. **Label, not tag**, is the readme's vocabulary row, and "tag" leaves the codebase with the column (the Lucide glyph keeps its slug, `tag`, since a glyph slug is not our word).

**Two readings of one label, stated once.** For permission a label is **arrangement**: it belongs to the thread, like its name and its widgets, so any member may change it and OFF-3's author rule for deleting content does not reach it. For privacy a label's name is **content**: a person or offload wrote it from what was dumped, so it stays out of every event, trace, log and error, and it is purged on the page's stated window.

### A label

- **Belongs to one thread.** Lisbon in a trip thread and Lisbon in a work thread are two labels. Every accepted member sees every label, applies any of them, and may rename, recolour or delete any of them. A member who leaves or is removed leaves their labels and their applications with the thread, as their content stays.
- **Name:** 1 to 24 characters after trimming, inner whitespace collapsed to one space, a leading `#` dropped, no control characters. Unique per thread ignoring case among labels that are not deleted: creating or renaming to a name the thread already has is refused as `label_taken`. Case is kept as typed. Enforced by the server on every path, person and model.
- **Colour:** one of ten, `--label-1` to `--label-10`, stored as the number, never derived from the name. A new label takes the lowest number its thread is not using, so a thread's first three are cerulean, rose and leaf. **One label per colour.** The Colour picker shows all ten with the taken ones marked by the label that holds them; **picking a taken colour swaps** the two labels' colours in one write, so the picker is never inert, even at ten. The same solid in both themes, words always `--text-on-solid`, never moss whoever applied it.
- **Ten per thread.** An eleventh is refused as `label_limit`, and every surface draws New label disabled at ten with the line *A thread holds ten labels.*
- **Several per row.** The flight to Paris is both Lisbon and Paris. Content rows and thread notes both carry labels. A note that is superseded or folded is not listed, not counted and not filtered (a muted note is listed, as the thread page lists it); an account-scope note can never carry one.
- **Order:** a thread's labels are listed in the order they were created, everywhere.
- **Deleted, then gone.** A deleted label is kept, with its joins, for thirty days, which is what Undo restores from and what stops offload re-creating it; then it is purged. That is the window the privacy page already states for anything deleted.

### Applying one row: the marks line, the tag tool, the label sheet

- **The marks line.** 023's chip line under the title becomes the marks line: the date chip first, then each label the row carries as `LabelMark` at 20px, wrapping. A row with neither has no line. The meta and the body follow unchanged. The row draws it from a `labels` prop of its own on both clients, never through the caller's meta slot, so the thread page and Today draw the same line. On iOS and Android (`ContentRow.tsx`) and the web (`ContentRowView.tsx`), in the thread's list, in every widget, in the archived list and on Today.
- **The tag tool.** A row carrying **no** label draws `tag` as its first tool, before the pencil and the way out, **on every such row regardless of who wrote it**, including another member's row that has no pencil, an archived row, and a link row, where it sits before `arrow-up-right`. It opens the label sheet. Today draws none, having no thread to label under. On the phones it is 17px in `--icon-on-well`; on the web it is the web row tool's own treatment, 15px in `--text-secondary`. **A stated exception to "two controls, never three"**, and the only one: a labelled row draws its marks and its usual tools. On the web the row's tools stay 32px and take a 44px hit area with no paint; on the phones the tools sit 16px apart, so their slop is 8 either side, where two targets meet without overlapping, and 14 above and below, 45 tall by 33 wide (they were 33 by 33).
- **Tapping a mark** opens that label's list (below).
- **The label sheet.** Title *Labels*, the row's title as the sub, each of the thread's labels with its dot, name, count and a tick for whether this row carries it, then *New label*, which opens a name field in place and adds the new label ticked. Cancel and Done. Done is one write; the toast names the result, *Packing list is under Istanbul*, or for several *Packing list is under Istanbul and Paris*, or for none *Packing list has no label*, with Undo. Cancel writes nothing, including a label made with New label inside it. On the phones a sheet that rises above the keyboard while the name field is focused; on the web a popover anchored to the tag tool or the mark, with focus moved into it, Escape to close and focus returned to the control that opened it.

### Many rows at once: the label's list

- **Reached** from the `plus` chip at the trailing end of the filter bar (New label, then name it), from *+ Group with labels* (the same), from tapping a mark (that label), and from holding a label chip. **On the web** holding has two equivalents: the chip's context menu (right click, the context menu key or Shift+F10) and, on a picked label chip, a trailing `pencil` inside it.
- A name field led by the colour's dot; *Tick what goes under it.*; every row in the thread, content and listed notes, grouped under the thread's own section headings, one tick each, a row's other labels drawn beside its title as 20px marks. Footer: Cancel and **Label N**, N the ticked count, disabled at zero for a new label.
- **Large threads.** The list is virtualised on the phones (`MoveSheet.tsx`'s list is the precedent) and on the web, reads its rows page by page from the server, and shows one spinner until the first page arrives, never a skeleton. Ticks made before a later page arrives are kept.
- **For an existing label** the foot adds Rename (the name field becomes editable), Colour (the ten, taken ones marked, a pick swaps) and Delete. Label N becomes **Save** and is one write of the name, the colour and the rows ticked and unticked.
- **Done is one write and one Undo.** The toast: *Seven under Istanbul* with Undo, which writes the previous set, name and colour back in one request through the same checks.
- **Delete** asks once in place, *Delete Istanbul? It comes off seven. Nothing else is deleted.*, then deletes; the toast *Istanbul deleted* offers Undo for eight seconds, which restores the label with its name, its colour and every row it was on, from what the server kept, by the label's id alone.
- Full-height sheet on iOS with the keyboard pushing the footer up, Material bottom sheet on Android (edge to edge, so the footer is placed above the keyboard's inset explicitly rather than trusting `adjustResize`), a modal on the web with focus trapped, Escape as Cancel and focus returned.

### Saying it

- **`#` in the composer, on a thread,** lists the thread's labels filtered as typed, three rows, as `@` lists people: the token is the one at the end of the draft, and the list is suppressed while a pin or a held note is up, as the `@` list is. It is its own list, not `MentionList`, because it has an unmatched state: a `#` that matches nothing offers one row, *New label "Ferry"*. A draft ends in one token at a time, so the two lists never show together. A pick resolves the token to that label and travels with the message as a label id; the words stay in the message as typed. A new label is sent as a name and created when the message is sent, inside that turn. The server resolves every id and name against the thread the message is filed into, under the same rules as every other write, and refuses what does not resolve. Everything the turn files carries the picked labels. Undoing the turn takes off what it applied and deletes any label it created that nothing else now carries.
- **`#` on Today** lists nothing, since no thread is known yet. The typed `#word` stays in the words, and once the dump is filed into a thread the Core API applies the label of that name there, creating it if the thread has none by that name and has room. If it cannot, the turn footer shows the thread pill without a mark and nothing else is said.
- **Telling offload.** "Put the ferry and the palace under Istanbul" works, through the model's label tools, inside the turn's own Undo.
- **The turn footer** draws, after the thread pill, a mark for each label the turn applied, in the order it applied them, **at the footer's own 30px height** (a third `LabelMark` size, logged) so the row keeps one height, and **capped at three plus a count** as the footer's sources are.
- **Who set it is decided by the route, never by the request.** Everything that arrives through a person's session, the sheets, the list and a `#` pick or `#word` in their own message, is set by the person. Everything that arrives through the model plane is set by offload, including what the model does because somebody asked in words. No request body carries the field.

### Filtering

- **The filter bar** sits under the app bar on the phones and under the pane head on the web, **sticky** while the page scrolls under it. `Chip` throughout: **All**; each label as `<Chip label={colour}>` with its name and count as children, the count omitted at zero; **No label** in outline; and a `plus` chip **pinned to the trailing edge**, drawn on an opaque ground with the chips scrolling under it (no gradient: the phones have no gradient primitive outside Skia, and a fade is not worth one). The phones gain a `Chip` of their own with a platform branch: iOS takes the design's pill, Android the M3 filter chip's shape from the Android token set, both on `min-height`, never a fixed height.
- **Either logic.** Two picked shows every row carrying one or both. A picked label chip fills with its `--label-N` and `--text-on-solid` words; All, when picked, is ink. Picking All clears the others; clearing the last picked returns to All. No label shows rows carrying none, and may be picked with labels.
- **The pick lives on the device, the read on the server.** The filter is kept per thread on the device and is never stored on the server, but the thread's lists are paged, so a narrowed list is asked for: every read that lists rows on the thread page takes the picked labels as a parameter, and the counts on the chips come from the server, from one grouped count over the thread. A client never filters a page it already holds and calls the result the thread.
- **What narrows:** everything on the thread page that lists rows, the widgets, To do, notes, the list, and the timeline's rail and day lists. The conversation does not narrow. Sections keep their headings with the narrowed count; a section left empty folds away.
- **Nothing matches:** the page draws one line under the bar, *Nothing under Lisbon yet.*, and the bar itself is the way out.
- A kept label that has since been deleted is dropped from the filter; if none remains, All.
- **No labels yet:** a thread with six or more rows (content not archived, and listed notes) draws the bar as one outline chip, *+ Group with labels*, opening the label's list as New label. Under six, no bar.
- Reduced motion: the bar, the sheets, the popover and the toast appear without movement when the system asks, on each platform's own setting.

### Outside the thread

A label outside its thread always travels with the thread's name, because Lisbon alone could belong to any thread.

- **Today:** the row's meta line is the thread's name, and the row's own marks line carries its labels, as on the thread page.
- **The timeline:** offload's own dated rows are drawn on the timeline's day as the thread's rows, so they carry their marks. A calendar's own events (019) keep their anchor in the calendar's colour and carry no labels, and are hidden while a filter is on. Nothing is ever filled with a label colour. (Changed during the build: the spec described an anchor dot on offload's rows, which are not drawn as `EventLine`.)
- **The rail keeps what its dots mean today**, the type of what lands on a day, and its `+N` overflow. It does not draw label dots: one dot meaning two things is worse than either. What labels do for the rail is narrow it: with Lisbon picked, only Lisbon's days carry dots. This is a divergence from the exploration's "up to three dots under a day", logged.
- **The map** is not built in this spec; there is no map on any surface. When one is, its pin rule is already decided: a place with one label is that label's solid with a white glyph, a place with two splits the pin, a place with none is ink, and the filter bar filters it.

### What offload does

- **While filing live**, the model may apply a label the thread already has, remove a label from a row where a person has not set that label, and create a label only when **its name appears in the words of the message being filed**. That check runs in the Core API against the message's own text with 016's word rule, not in the worker and not on the model's say-so. A label the person picked with `#` is applied by the Core API, not by the model.
- **Nightly**, a job of its own, one per thread (not `notes.compact`, which reads notes and runs per account), runs for each thread whose rows have changed since its last sort: offload judges whether the thread holds more than one subject and may create labels and apply labels, existing or new. It **never** removes a label from a row and never deletes, renames or recolours a label. It reads a bounded set: the thread's most recent rows' titles and types up to a fixed budget, the thread's labels, and nothing that grows with the thread's age past that budget. At claim time it checks the thread still has an accepted member and reads nothing otherwise. **Off for now (owner, 2026-09-27).** The nightly sort is built and tested but not booked: `NIGHTLY_LABEL_SORT` in `apps/core-api/src/jobs/handlers.ts` is false, so labels come from people and from live turns only until the sort is reworked. The worker, `/internal/v1/labels-sorted`, the `labelled` Activity row with Undo, and the evals in `26-labels-overnight.json` all stay; Activity's Undo still serves a live turn's labels.
- **offload stops creating at six.** offload may create a label only while the thread has fewer than six, whoever made them, so a person always has room for their own. It may still apply any label the thread has. A person may create up to ten.
- **A person's change is final.** offload never applies a label to a row a person removed it from, never changes a join a person set, never touches a label a person renamed or recoloured, and never re-creates a label a person deleted, by name ignoring case, while the deleted label is kept. The server enforces all four on every model path; the prompt saying so is a request, not the enforcement.
- **Label names reach the model as data.** They travel in the user-turn block under the existing untrusted-data marker, like titles do; the tool definitions carry label ids and never a name, so nothing a member typed sits in the cached system side.
- **Nothing in the thread announces it**, and nothing is pushed. Live filing already shows what it applied in the turn footer.
- **Activity records it.** One row per sort that labelled anything, in the record of every accepted member of the thread, **never sent** (`sent` false, so no words reach a push service): a hollow lead with `tag`, *Sorted Europe, October into Lisbon, Paris and Istanbul. Seven labelled.*, or for a live turn *Labelled three in Europe, October under Istanbul.*, the time, and **Undo** for the row's thirty days. The row carries its thread, so 024's purges on leaving and removal already reach it. Tapping the row opens the thread; Undo is its own 44px control outside the row's press. Undo checks the pressing member is still in the thread, then reverts only what that sort set and nobody has touched since, and deletes a label that sort created if no live join from anyone else, a person or a later sort, is under it and nobody has renamed or recoloured it. After Undo the row reads *Undone* in its tag slot, for every member; the words stay as written.

### Tags retire

Labels are the one way a thread is grouped.

- `set_thread_preference` loses `group_by`; the widget preference loses `groupBy`; any `groupBy` already stored in `threads.attrs` is removed by the migration rather than tolerated; widgets draw one flat list as they do for a thread with no dimension today.
- The model's `add_content` and `edit_content` lose `tags`; the filing prompt stops asking for them; the evals that assert on tags are rewritten to labels or removed.
- 018's tag question goes, with its field in the question grammar.
- The web widget row stops drawing bare tags in its meta.
- `content.tags` is dropped, with `threads/tags.ts` and the tag helpers in `@offload/widgets`. No vector carries a tag, so nothing re-embeds. Nothing a person typed is lost: tags were only ever written by the model, and no screen let anyone set one.
- Existing tags are **not** converted into labels. The nightly sort sees every thread that holds more than one subject and labels it from what is there, recorded in Activity with Undo, which is the reversible path; a migration that invented labels would be offload acting with no record and no Undo.
- `docs/tech/decisions.md` gains an entry amending 007's grouping entries and 006's tag decision, and the OFF-6 reversible allowlist gains labels (below).

### Undo, once for everything

- Every person write, the label sheet, the label's list, rename, recolour and delete, is drawn first and written second, with Undo in the toast for eight seconds. Undoing a set, a rename or a recolour is the same write with the previous values, through the same checks. Undoing a delete restores from what the server kept, by id. Nothing is destroyed while the toast is up.
- A live turn's labels are inside 004's whole-turn Undo.
- A nightly sort's labels are undone from Activity.
- **A label another member deleted** can be undone only by that member, inside their eight seconds. Anyone may re-create it; the rows it was on are not restored for them. That is the shared-thread trade 022 already makes and the privacy page already states: a shared thread is only as safe as its members.
- **Moving a row to another thread** takes its labels off, since labels belong to a thread; undoing the move puts them back.
- **Deleting a row** takes nothing from any label; undoing the delete brings the row back with its labels.
- **Compaction folding notes into one** gives the new note the labels of every note it replaced, so a fold never quietly unlabels something.

### States

- **Loading:** the sheets open with what the thread page already holds; the label's list shows one spinner until its first page arrives.
- **A refused or failed write**, including one with no connection, puts the previous state back and says *Couldn't save that* with Try again, beside the control. `label_taken` says *Istanbul is already a label here.* under the name field and keeps the sheet open; `label_limit` says *A thread holds ten labels.*
- **Two members at once.** The label's list writes what was ticked and unticked, not a whole set, so two members labelling different rows do not undo each other; two members renaming the same label, the later wins, as a thread rename does. A label deleted while another member has its sheet open: the save is refused as `label_gone`, the sheet closes, and the toast says *That label was deleted.*
- **A label and a row in different threads never meet.** Every write resolves the label and the row together and refuses unless both are in the same thread and the caller is a member of it; a note must be a thread note of that thread. The server never returns a label on a row whose thread is not the label's.

### The privacy page, as it will read

"The **threads** what you upload is sorted into, and the tags, dates and amounts pulled out of it" becomes "The **threads** what you upload is sorted into, the **labels** it is grouped under, and the dates and amounts pulled out of it." The updated date moves. No new company receives anything, no retention window moves, but the retention list gains a line of its own, after review: a deleted label is kept hidden for thirty days rather than leaving the live database at once, and taking a label off leaves a record with no name in it until the label or the row is deleted, so offload never puts it back; the plain delete line becomes "Anything else you delete". **Amended 2026-09-28 after the second security review:** the shared-thread line "nobody deletes what somebody else wrote" gains "a label belongs to the thread, so any member can rename or delete one", the label line says Undo is the moment of the delete and the thirty days are the keeping, and the date and consent version move to 28 September. An Activity Undo counts as a person taking the label back, so offload does not make it again while it is kept, Activity's label rows are never pushed, and label names stay out of every event, trace, log, error report and job error as titles do. This is flagged to the product owner before any code, as `CLAUDE.md` asks.

## Acceptance criteria

Labels

- **AC-1** A thread has at most ten labels that are not deleted; creating an eleventh is refused as `label_limit` on every path, person and model; every surface draws New label disabled at ten with its line.
- **AC-2** A name is trimmed, collapsed, stripped of a leading `#`, 1 to 24 characters, with no control characters, unique per thread ignoring case among labels not deleted; a clash is refused as `label_taken` on create and rename, on every path; case is kept.
- **AC-3** A new label takes the lowest free colour 1 to 10; a colour is unique per thread; picking a taken colour swaps the two labels' colours in one write; the picker marks taken colours by their label.
- **AC-4** Every label read and write resolves through 022's membership predicate server-side; a non-member gets 404 for a label, its rows and its writes; any accepted member may create, rename, recolour, delete and apply any label in the thread.
- **AC-5** Every write that joins a label to a row resolves both in one statement and is refused unless they share a thread the caller is a member of; a note join also requires a thread note of that thread; a label id from another thread, an account-scope note, or a note of another thread is refused, on the person routes, the `#` path and every model path.
- **AC-6** `set_by` is written from the route: person on session routes, offload on the model plane; no request schema accepts it.
- **AC-7** Deleting a label soft-deletes it and its joins and deletes no row; Undo by id within eight seconds restores the label, name, colour and joins; a deleted label and its joins are purged after thirty days.
- **AC-8** A member who leaves or is removed leaves their labels and their applications in place.

The row

- **AC-9** Every row on the thread page, in the widgets, in the archived list and on Today draws its labels as 20px `LabelMark`s after the date chip on the marks line, from the row's own `labels` prop, wrapping; a row with neither draws no line; on iOS, Android and the web, both themes, 200% text.
- **AC-10** Every row on the thread page with no label draws the `tag` tool first among its tools, whoever wrote it, including archived and link rows; a labelled row does not; the web's tools have 44px hit areas and the phones' are 45 by 33; tapping a mark opens that label's list.
- **AC-11** The label sheet lists the thread's labels in creation order with dot, name, count and tick, and New label; Done writes the row's labels in one request and toasts the result with Undo; Cancel writes nothing, including a label made inside it; on the web it is a popover with focus in, Escape out and focus returned; on the phones the name field stays above the keyboard.

The label's list

- **AC-12** The list is reached from the `plus` chip, *+ Group with labels*, a mark, holding a label chip, and on the web a chip's context menu and a picked chip's `pencil`; it lists every row and listed note under the thread's section headings, virtualised and paged, with one tick each and other labels as 20px marks; Label N writes the label and the ticked and unticked rows in one request; Undo writes the previous state back in one request.
- **AC-13** For an existing label the list offers Rename, Colour and Delete; Delete asks once in place with the count and says nothing else is deleted; the web modal traps focus and returns it.

Saying it

- **AC-14** `#` at the end of a thread composer's draft lists matching labels three at a time, suppressed as `@` is; an unmatched `#` offers New label; a pick travels as a label id, a new one as a name; the server resolves both against the filing thread under AC-1, AC-2 and AC-5, and the turn's filed rows carry them set by the person; undoing the turn removes what it applied and deletes a label it created that nothing else carries.
- **AC-15** A `#word` sent from Today is applied by name by the Core API in the thread the dump is filed into, creating the label if the thread has room, set by the person; when it cannot, the footer draws no mark.
- **AC-16** The turn footer draws a 30px mark after the thread pill for each label the turn applied, in order, capped at three plus a count, on all three surfaces.

Filtering

- **AC-17** The filter bar is sticky and draws All, each label as `Chip label={colour}` with name and count (no count at zero), No label and a pinned `plus` chip on an opaque ground; either logic; a picked label chip fills with its colour and `--text-on-solid`; All clears the rest; No label combines with labels; Android chips use the M3 shape and `min-height`.
- **AC-18** Every read that lists rows on the thread page accepts the picked labels and No label and returns the narrowed page; chip counts come from one grouped count on the server; the widgets, To do, notes, the list and the timeline's rail and day lists narrow, and the conversation does not; sections keep headings with narrowed counts and fold when empty; nothing matching draws *Nothing under Lisbon yet.*
- **AC-19** The pick is kept per thread on the device and never stored on the server; a deleted label drops out of it; with none left it is All.
- **AC-20** A thread with no labels and six or more unarchived rows and listed notes draws only *+ Group with labels*; under six, no bar.
- **AC-21** With reduced motion on, the bar, the sheets, the popover and the toast appear without movement on each platform.

Outside the thread

- **AC-22** Today's rows draw their labels as marks after the thread's name on the meta line, as the design draws it, and no tag tool.
- **AC-23** On the timeline offload's dated rows carry their marks; a calendar's own event keeps its calendar colour, carries no labels and is hidden under a filter; the rail's dots and `+N` are unchanged apart from narrowing with the filter.

offload

- **AC-24** A live turn's label tools can apply an existing label, remove a label a person has not set on that row, and create a label only when the Core API finds its name in the message's own text by 016's word rule and the thread has fewer than six labels; tool definitions carry ids, and label names reach the model only in the user-turn data block.
- **AC-25** The nightly sort is its own job per thread, runs only on threads whose rows changed since their last sort, checks an accepted member at claim time, reads at most a fixed budget of rows, creates and applies and nothing else, creates only below six, and crosses into the Core API only through a validated schema (OFF-5). Whether it labels well is judged by eval cases under a new principle, not by a unit test; writing them is part of this feature, running them is a separate ask.
- **AC-26** On every model path the server refuses applying a label to a row a person removed it from, changing a join a person set, renaming, recolouring or deleting a label, touching a label a person renamed or recoloured, and creating a label named as one a person deleted that is still kept.
- **AC-27** Each sort that labelled anything writes one Activity row per accepted member, `sent` false, carrying its thread and its sort, with the words above.
- **AC-28** Undo on that row checks the pressing member's membership, reverts only joins and labels that sort set and nobody has touched since, deletes a label it created that holds nothing a person set and nobody renamed or recoloured, and sets the row *Undone* for every member from one column without rewriting its words; it is refused once the row is past thirty days or already undone.
- **AC-29** Folding notes gives the new note the union of the replaced notes' labels.

Retirement and the edges

- **AC-30** `group_by`, `groupBy` (including stored values in `threads.attrs`), the model's `tags`, 018's tag question and its field, the web meta's bare tags, `content.tags`, `threads/tags.ts` and the widgets package's tag helpers are gone; no label is created by the migration; the tool definition guard passes at its current number, with the label tools behind `defer_loading` if the measured set needs it.
- **AC-31** Moving a row to another thread removes its labels and undoing the move restores them; deleting a row and undoing it keeps its labels.
- **AC-32** A save against a deleted label is refused as `label_gone`; a refused, failed or offline write puts the previous state back with *Couldn't save that* and Try again; two members ticking different rows of one label both land.
- **AC-33** No label name, row title or note text reaches an analytics event, a trace, a log line, an error report or `jobs.last_error`; those carry label ids, counts, error codes and outcomes only.
- **AC-34** The privacy page line reads as above and its updated date moves (since 2026-10-05 the policy is general and no longer names labels; the date still moves with the consent version); `docs/tech/decisions.md` carries the OFF-6 allowlist entry for labels and the entry retiring 007's grouping and 006's tags; the design log carries the entries below, each with its Design system impact.

## Out of scope

- **The map.** No map exists; the pin rule above is what a map spec inherits.
- **Label dots on the rail**, deliberately (above).
- **Labels across threads**, moving a label between threads, or merging two labels.
- **Filtering the conversation**, search by label, and labels in notifications or digests.
- **Converting existing tags** into labels.
- **A synced filter.** The pick stays on the device.
- **Suggestions in the row's sheet** and the eight-second repeat, both dropped by the design.
- **The kits' screens** catching up with the row, Activity and Today; they are reference drawings (the handoff's own note).

## Decided during planning

- **Label, not tag** (design, 26 September).
- **The map is out of scope** and its rule is recorded for later (product owner, 26 September).
- **offload creates only below six**, so a person always has room (product owner, 26 September).
- **One spec, offload last**: the person's path is built and shippable first, offload's labelling is the last track (product owner, 26 September). The project lead recommended splitting offload's part into its own spec; not taken, since the owner chose this, and the tasks keep the seam so it could still be cut.
- **Labels replace tags and group-by**, and the column is dropped (product owner, 26 September).
- **One label per colour stays**, as designed; a pick of a taken colour swaps rather than being refused, so the picker works at ten. The project lead's alternative, colours free to repeat, is not taken because two Lisbon-coloured labels in one filter bar cannot be told apart.
- **Nightly sort only creates and applies.** Removing is a person's act or a live turn asked in words; a job that runs unattended never takes a label off.
- **Live creation is bounded by the dump's words**, 016's provenance idea applied to a name, in the Core API.
- **A deleted label is kept thirty days**, the page's existing window, rather than remembered forever.
- **Activity goes to every member** of the thread, never pushed, because the labels are the thread's and any member's Undo is the thread's.
- **Filtering reads from the server**, because the thread's lists are paged at thirty and a client filtering its first page would show a partial thread as the whole one.
- **Undo of a person's set or rename is the same write backwards**, as 023's is, rather than a server-held token, because every write already passes the same-thread and membership checks; only delete restores server-side, because it is the one write that removes something.

### Design system impact, to log in `decisions.md`

- **The copy says no noun.** The handoff's *Seven things labelled.* and *Packing list is Istanbul* become *Seven labelled.* and *Packing list is under Istanbul*: "thing" is retired from anything a person reads, and "is Istanbul" read as a rename. **Design system impact:** the readme's Labels section and the handoff wording change to match.
- **Nightly sort never removes.** **Design system impact:** the readme's "What offload does" gains the sentence; no component changes.
- **The empty filter line** *Nothing under Lisbon yet.*, not drawn in the exploration. **Design system impact:** the readme's Filtering paragraph gains it.
- **The timeline's anchor dot takes the label colour**, up to three dots, rather than a dot leading a neutral block, which is not what `EventLine` draws. **Design system impact:** the readme's Outside the thread paragraph describes the anchor.
- **No label dots on the rail**; the rail keeps its type dots and narrows with the filter. **Design system impact:** the readme's rail sentence is withdrawn.
- **The turn footer's mark is 30px, capped at three plus a count.** **Design system impact:** `LabelMark` gains `size={30}`.
- **The tag tool sits first among the row's tools**, on every unlabelled row including another member's and a link row, and every row tool is raised to a 44px target. **Design system impact:** the readme's Applying paragraph says "first among the tools" rather than "beside edit".
- **No fade under the pinned `plus`**; it sits on an opaque ground. **Design system impact:** the `Chip` prompt's filter bar line drops the fade.
- **A taken colour swaps.** **Design system impact:** the readme's colour paragraph gains the swap.
- **Holding a chip on the web** has a context menu and a picked chip's `pencil` as equivalents. **Design system impact:** `Chip` gains an optional trailing action on a picked label chip, web only.

## Amended 2026-09-29

**On the phones the row draws no tag tool**, nor any other trailing tool: a tap opens the edit sheet, which carries a Labels row, and somebody else's row opens the action sheet, which gains Labels. A link row keeps its tap for its page and draws an `ellipsis` that opens the sheet. The web's row tools are unchanged. **AC-20 is superseded and AC-12's entry point changes on every surface:** a thread with no labels draws no bar and no *+ Group with labels*; instead a `tag` sits in the head (first among the phones' bar glyphs, among the web pane's tools), named *Group with labels*, opening the label's list as New label, at any number of rows. **A note's labels are drawn as dots** at its row's trailing edge on the phones. The label sheet's foot is Clear, Cancel and Done. The label's list keeps its name field in view with the keyboard up. Logged in both decision logs under 2026-09-29.

## Amended 2026-10-02 by 028

Nothing is labelled in the account's default thread, which 028 draws as *Not in a thread* rather than as a thread: a label there would be drawn nowhere and removable nowhere. `label_content` reports such rows done without labelling them, and the nightly sort never takes the default thread.
