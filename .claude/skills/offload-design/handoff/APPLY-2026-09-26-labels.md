# Apply: labels, and the four items owed from 023, 024 and the 26 September chip

Drawn in `explorations/labels.html` and decided with the product owner on 26 September 2026,
against `main` at `089949d`. All three surfaces, both themes. Standalone copy of the exploration:
`handoff/labels-standalone.html`.

**New in the system:** `LabelMark` (components/core), `Chip`'s `label` prop, the `tag` glyph (85th),
ten tokens `--label-1` to `--label-10` and `--surface-accent`, all in `tokens/colors.css`, identical
across the three scopes. `tokens/fonts.css` now declares the five static faces from `assets/fonts/`,
the web app's own files. **Nothing exists in the schema yet**, so item 1 comes first.

**Build order:** 1, 2, 3, then 4 to 7 in any order, 8 and 9 after the model tools exist.

---

## 1. Schema

- `labels`: `id`, `thread_id`, `name` (1 to 24 characters, unique per thread, case-insensitive),
  `color` (smallint 1 to 10, unique per thread), `set_by` (`person` | `offload`), `touched_by_person_at`
  (null until a person renames or recolours it), timestamps.
- `content_labels` and `note_labels`: `label_id`, the row id, `set_by`, `created_at`. Plus a
  tombstone for a label a person **removed** from a row (`removed_by_person_at`), so offload never
  puts it back.
- **Ten per thread.** Creating an eleventh is refused as `label_limit`. A new label takes the lowest
  free `color`.
- Membership: a label is the thread's. Every member reads and writes it under 022's predicate
  unchanged. A leaver's labels stay with the thread.
- Deleting a label deletes the join rows and nothing else.

## 2. The person's write path

- `POST /v1/threads/:id/labels` (name, optional color), `PATCH /v1/labels/:id` (name, color),
  `DELETE /v1/labels/:id`.
- `PUT /v1/labels/:id/items` with the full set of row ids: **one write for the "start from the
  label" list**, returning the previous set so Undo is one request. `PATCH /v1/content/:id` gains
  `labels` (ids) for the per-row sheet, absent meaning unchanged, as 023's route does.
- Every person write stamps `set_by = person` or the tombstone. That stamp is what item 8 reads.

## 3. The row: the marks line

The 26 September entry moved the date chip to its own line under the title. **That line is now the
row's marks line**: the date chip first, then each `LabelMark` at 20px, wrapping. A row with neither
has no line. The meta and the body follow, unchanged.

- **The `tag` tool** is drawn beside the pencil on every row with **no** label, at 17px in
  `--icon-on-well`, and opens the label sheet. **A stated exception to "two controls, never
  three"**, and the only one: a labelled row draws its marks and the usual two.
- Tapping a mark opens that label's list (item 5).
- iOS `ContentRow.tsx`, Android the same file, web `ContentRowView.tsx` and `RowTools`.

## 4. The label sheet (one row)

Title *Labels*, the row's title as the sub, each thread label with its dot, name, count and a tick,
then *New label*. Cancel, Done. Done is one write with Undo in the toast: *Packing list is
Istanbul*. On the web this is a popover anchored to the tag tool.

## 5. The label's list (many rows)

- Reached from the **`plus` chip** at the end of the filter bar (New label, then name it) and from
  **holding a label chip** or **tapping a mark** (that label).
- A name field with the colour's dot, *Tick what goes under it.*, every thing in the thread grouped
  under the thread's own section headings, one tick each, other labels shown small beside a title.
  Footer: Cancel and **Label N**. For an existing label: Rename, Colour (the ten, taken ones
  marked), Delete at the foot.
- Full-height sheet on iOS, Material bottom sheet on Android, a modal on the web.

## 6. The filter bar

- Under the app bar, `Chip` throughout: All, each label as `Chip label={n}` with its count, *No
  label* in outline, and a `plus` chip **pinned to the trailing edge** with the chips scrolling under
  a fade.
- **Either logic.** A picked label chip fills with `--label-N` and white words; All is ink.
- Sections keep their headings with the narrowed count; an emptied section folds away.
- Kept per thread **on the device**, not synced.
- **No labels yet:** a thread with **six or more things** draws the bar as one outline chip,
  *+ Group with labels*, opening item 5 as New label. Under six, no bar. Android chips take the M3
  8px radius and 32px height.

## 7. Outside the thread

- **Today:** the meta line is the thread's name, then the thread's label marks for that row.
- **Map:** a place's pin is its label's solid with a white glyph; two labels split the pin; none is
  ink. The filter bar filters the map.
- **Calendar:** every event is the neutral block; **a labelled one leads with a 10px dot**. Google
  events have no dot. Do not fill the block with the label colour: a week in one city turned the
  whole view one colour.
- **Rail:** up to three 6px dots under a day, one per label with something on it.
- **Turn footer:** the label mark at 24px after the thread pill, for a turn that applied one.

## 8. The composer, and offload

- **#** in the composer opens the thread's labels filtered as typed, three rows, as **@** does; a
  pick resolves to the label, and an unmatched # offers *New label "…"*. From Today, the thread is
  filed first and the label matched inside it.
- Model tools: `add_label`, `apply_labels`, `remove_labels`, each refusing a label or a join the
  person has touched (`person_set`). Live filing may apply an existing label or create one the dump
  names.
- **Compaction** gains a step: offload judges whether a thread holds more than one subject, with no
  fixed size, and may create and apply labels. It never renames, recolours, removes or re-adds
  anything a person touched.

## 9. Activity, and nothing else

- **No notice in the thread.** The moss strip in early drafts is withdrawn: compaction does many
  things and announcing each would be noise.
- One Activity row per compaction or live filing that labelled anything: hollow lead with `tag`,
  *Sorted Europe, October into Lisbon, Paris and Istanbul. Seven things labelled.*, the time, and
  **Undo** for the row's 30 days. Tapping opens the thread. Undo reverts only what offload set and
  the person has not since touched.

---

## Owed from earlier entries, closed here

The design log's Open section carried design-system impacts from three code entries. Folded in on
26 September:

| Entry | What it asked | Closed as |
| --- | --- | --- |
| 2026-09-26 · The date chip takes its own line | Chip under the title; late wording | `readme.md` Dates section. The line is now the marks line (item 3). |
| 2026-09-22 · Dates, as built | A solid accent surface alias | `--surface-accent`, `var(--moss-600)`, three scopes |
| | The strip's web wording | *This browser says*, in the readme |
| | Segmented for Starts on, pills for Custom's unit, or the mock wins | **Code wins** on both |
| | Time versus Starts by type | In the readme |
| | A sheet's action row wraps at large text | In the readme |
| 2026-09-22 · Notifications, as built | Activity as a pushed screen with the lead-and-chip row | **Code wins**; the readme describes it. The kits' `NotificationSheet` and `NotifRow` are superseded, and `components/notifications/` keeps only the lock-screen previews |
| | Communication replaced by Notifications | In the readme |
| | Today's three groups over `ContentRow` | In the readme |
| | Digest copy: *Answer in My people.*, *Ana added two to Lisbon trip* | In the readme |
| | The one permission ask when undetermined | In the readme |
| | "A decline is recorded" corrected | Now *a decline writes nothing* |
| 2026-09-22 · The web serves its own faces | `tokens/fonts.css` on the same static files | Done: five `@font-face` rules on `assets/fonts/`, the 700 and optical-size losses noted |
| 2026-09-22 · Two soft grounds | The two aliases | Already in `tokens/colors.css` |

**Still open, and not blocking this feature:** the kit screens themselves (the phones' and web kit's
thread rows, Activity, Notifications and Today) have not been redrawn to match the code. The code
leads and the readme now says what it does; the kits are reference drawings and catch up when
someone next works in them.
