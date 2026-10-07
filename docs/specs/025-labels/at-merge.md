# 025, at merge

**Landed 2026-09-28 in the labels PR itself**, as the last commit before merge.

The entries below go on `main` in the same change as the merge, per tasks T1.6, T2.30 and T4.8: four in `docs/tech/decisions.md`, one in `.claude/skills/offload-design/decisions.md`. Written here because both logs are shared state edited on `main` only.

## docs/tech/decisions.md

### 2026-09-27 · Labels replace tags and grouping

A thread is grouped by labels a person can see, name and correct, and by nothing else. `content.tags`, the `dimension:value` strings the model wrote since 006, is dropped with `threads/tags.ts` and the widgets package's tag helpers; 007's `groupBy` preference and the in-widget chip filter go, and a stored `groupBy` is stripped from `threads.attrs` by the migration rather than tolerated on read; 018's tag question goes with its field. Nothing a person typed is lost: only the model ever wrote a tag and no screen let anyone set one. **No label is made from an old tag.** A migration that invented labels would be offload acting with no record and no Undo; the nightly sort labels a thread that holds more than one subject, in Activity, with Undo. The tool definitions fell from 1,741 to 1,642 tokens with `tags` and `group_by` gone, which is the room the label tool took.

**Design system impact:** none here.

### 2026-09-27 · OFF-6's reversible allowlist gains labels, on three terms

**A person's label writes** (make, rename, recolour, delete, apply, remove) are drawn first and written second with the eight-second Undo: a set, a rename or a recolour is undone by the same write backwards through the same checks; a delete is soft for thirty days and restored by id. **offload's live labelling** (`label_content`: apply by id, make one only when its name is in the words of the message being filed, remove when asked) sits inside 004's whole-turn Undo. **The nightly sort**, built and switched off for now by the owner (`NIGHTLY_LABEL_SORT` false in `jobs/handlers.ts`, so no job is booked), creates and applies labels only, never removes, renames, recolours or deletes, and is on the list as compaction is (2026-09-10): automatic, on an offload-owned surface, destroying nothing, with no toast and so no eight seconds, and undone instead from its Activity row for thirty days. All three are enforced in `threads/labels.ts`, the one write path: a label and a row meet only inside one thread the caller is in, who set it comes from the route and never the request, and offload is refused anything a person set, took off, renamed, recoloured or deleted.

**As built:** the nightly sort shipped 2026-09-27, switched off the same day, deleted by 032 on 2026-10-02 with its job, worker, prompt, endpoint, switch and evals. What stays is the live-turn labelling, whose `labelled` Activity row keeps its Undo.

**Design system impact:** none here.

### 2026-09-27 · Activity gains its first action, and a record one member undoes for all

024 made every Activity row inert or a door, with its words stored as sent and never re-rendered. A `labelled` row, written today by a live turn that labelled anything and by the nightly sort once it is on, carries one action, Undo, beside the row and never inside its press, and its words still never change: *Undone* is drawn from `activity.undone_at`. Undo writes `undone_at` on **every member's copy** of the same sort, the first write to `activity` across accounts; it is correct because the rows describe one thread-level change and the writer has passed that thread's membership check at the moment of the press. A `labelled` row is never sent (`sent` false, `reason` design), so no label or thread name reaches a push service, and it carries `thread_id`, so 024's purges on leaving and removal already reach it. 024's feature spec is amended in the same change.

**Design system impact:** none here.

### 2026-09-27 · The tool set is at 1,798 of 1,800, and the next tool moves behind defer_loading

`label_content` was paid for by retiring `tags` and `group_by` and fits with two tokens to spare. The number did not move. The 2026-09-11 entry's instruction stands and is now due: whatever next grows the set moves the long tail behind `defer_loading` rather than raising the budget.

**Design system impact:** none here.

## .claude/skills/offload-design/decisions.md

### 2026-09-27 · Labels, as built
**Surface:** iOS, Android, web

**Is:** the handoff of 26 September built on all three surfaces: `LabelMark` on the row's marks line after the date chip; the `tag` tool on every unlabelled row; the label sheet (a popover on the web); the label's list (a full-height sheet on iOS, a Material bottom sheet on Android, a modal on the web) with Rename, Colour and Delete; the filter bar with either logic, a picked chip in its own colour, No label, the pinned `plus`, and *Group with labels* at six rows; `#` in the composer; the turn footer's marks; Today's marks after the thread's name; the `labelled` row in Activity with Undo.

**Where the code diverged, and why.**
- **The copy says no noun.** *Seven things labelled.* is *Seven labelled.*, *Packing list is Istanbul* is *Packing list is under Istanbul*, and the composer's list shows a label's count without "things": "thing" is retired from anything a person reads, and "is Istanbul" read as a rename.
- **The tag tool sits first among a row's tools**, on every unlabelled row including another member's and a link's (before `arrow-up-right`), where the handoff said "beside the pencil": the phones draw no pencil on another member's row, which would have left labels unreachable there. It is not drawn on Today, which has no thread to label under.
- **Targets.** Every label control reaches 44px tall by a hit area with no paint, and across only as far as the gap to its neighbour allows, touching and never overlapping. The web's row tools stay 32px and sit 4px apart: 44 tall by 36 wide. The phones' tools sit 16px apart, so their slop is 8 either side and 14 above and below: 45 tall by 33 wide; they were 33 by 33. A pressed `LabelMark` is 44 tall on both, 2px of reach either side; the web's `pencil` on a picked chip is 44 by 33. The phones' Rename, Colour and Delete are 44. Neither platform reaches 44 across on the row tools without the row's tools spreading apart, which the kit does not draw; that is the open call.
- **The turn footer's mark is 30px**, the footer's own height, where the handoff said 24, and is capped at three and a count as the sources are. `LabelMark` gains `size={30}`.
- **Timeline.** offload's own dated rows are drawn on the timeline as the thread's rows, so they carry their marks; a calendar's events keep their anchor in the calendar's colour and carry no labels. There is no neutral block for a dot to lead, so nothing else changed there. The rail keeps its type dots and narrows with the filter rather than drawing up to three label dots: one dot meaning two things is worse than either.
- **The map is not built**; there is no map provider. The web's Places widget draws its pins as before, not in label colours.
- **Holding a chip** opens its list on the phones; the web has three equivalents: the chip's context menu (right click, the context menu key, Shift+F10), a long press on a touch screen, and on a picked chip a small `pencil` beside it in the chip's colour.
- **No fade under the pinned `plus`**; it sits on the page's ground (`--pane-ground` on the web, so it matches whichever pane it is in).
- **A taken colour swaps.** The Colour picker marks a taken colour with its label's initial and picking it swaps the two, so the picker is never inert at ten. A new label's list shows no colour picker; it takes the lowest free colour.
- **Empty filter line**: *Nothing under Lisbon yet.*, or *Nothing without a label yet.* for No label alone.
- **The phone chip** is one face (`ChipFace`) shared by `Chip` and the filter bar's label chip, because holding needs a prop outside `Chip`'s contract.

**Design system impact:** `LabelMark` gains `size={30}` for the turn footer. The readme's Labels section wants: the no-noun copy above; "first among the tools" for the tag tool and the note that Today draws none; the timeline and rail sentences replaced by what is written above; the pin rule marked as waiting on a map; the web's three ways to hold; no fade; the colour swap; the empty filter line. The `Chip` prompt's filter bar line drops the fade and gains the web's `pencil` on a picked label chip. The kits' `ContentRow`, `TurnFooter`, Activity row and Today row want the marks, the tool order and the footer's 30px mark drawn.
