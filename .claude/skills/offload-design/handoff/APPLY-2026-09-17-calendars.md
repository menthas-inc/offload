# Apply: calendars, the page and the thread

Decided 17 September 2026 with the product owner off `explorations/calendars-options.html`, item by
item. **Values are given for both themes and all three surfaces.**

Two screens, and **two levels of consent that are different questions**: the account approves which
calendars offload may use at all, and a thread picks which of those it uses.

**No new design-system component and no new token, with two exceptions to scope for:**

1. **`Group`'s label gains a trailing slot** (kit-local, `SettingsDetail.jsx`). Without it the
   settings list cannot show `4 of 7 in use` or `None in use`. §2.
2. **Web's calendar popover is new UI.** The web kit has no governed popover or menu, so it is built
   from existing tokens. §5.

Everything else is composition over governed `Checkbox`, `Switch`, `Button`, `Chip`, `AppBar`,
`Sheet`, `IconButton` and `WPaneHead`.

Read section 5 before building either screen. It is the model the rest depends on, and it is the
one thing that cannot be changed later without a migration.

---

## 1. Settings, before anything is connected

Connected apps already has a Calendar row whose value is `Connect`. It opens this page, one level
down.

**The page is first run's connect screen, verbatim:** same heading ("Bring in your calendar"), same
subhead, the same two prose lines with `calendar` and `plus` glyphs, the same primary button. Reuse
the copy rather than retyping it.

**The source is `ConnectScreen` in `ui_kits/mobile_app/FirstRun.jsx`**, and its Android twin
`M3ConnectScreen` for that surface. **They are not interchangeable:** the twins differ on the
provider mark's radius and its fallback tokens, below, and the Android one is scoped to `--a-*`
tokens that do not resolve outside that kit.

**One sentence is added, under the button**, in `--text-caption` `--text-tertiary`, centred:

> You choose which calendars after this.

Connecting is not consenting to all of them, and this is the only place that can say so before the
OAuth handoff.

**The provider mark is the official asset**, passed in by the build and never redrawn, as
`ProviderMark` already does it: `size=88 radius=18`, centred in a `flex:1` region above the text
block, falling back to a dashed `--surface-fill` / `--border-strong` tile when no asset is passed.

**That fallback is what ships today**, not a drawing: `assets/brands/` holds only a `README.md`, and
`App.jsx` mounts `ConnectScreen` with no `mark` prop, so the dashed tile is the live state until
somebody drops the official SVG in.

**Android's `AProviderMark` is radius 20** with `--a-c-low` and `--a-outline` as its fallback, so
take the values from the twin that matches the surface you are building.

## 2. Settings, once connected: the list

**A calendar is a `Checkbox`, not a `Switch`.** A switch says a capability is on; the capability is
the connection, one level up. This is a selection among peers.

| | Unticked | Ticked |
| --- | --- | --- |
| Box | 20px, `--radius-xs`, `1px --border-strong` | 20px, `--radius-xs`, border transparent |
| Fill | transparent | `--surface-inverse` |
| Tick | none | inline stroked path, 13px, `--text-inverse` |
| Title | `--text-tertiary` | `--text-primary` |

**Never the moss tick.** `readme.md` reserves moss for a finished row, "tertiary ink, a 1px strike
and the moss tick", so a moss-ticked calendar reads as something offload completed. Use
`Checkbox`'s ink fill.

**And do not take `Checkbox`'s label treatment with it.** The component dims and strikes the
*checked* label, because for a task the finished row is the one out of play. Here the *unticked* row
is out of play, so the dimming inverts and there is no strike anywhere on this page.

**The group header carries the count**, which is the other thing a column of switches could not do:
the account email on the left, `4 of 7 in use` on the right in `--text-numeric-role` **overridden to
11px** (the role's own size is larger and the crops deliberately set it down). A second account is a
second group with its own header and its own count.

**This needs a change to `Group`, and it is the only component change in the note.**
`SettingsDetail.jsx` renders its label as a plain `<div>` with no flex and no second child, so a
trailing count has nowhere to go. Make the label a `display:flex; align-items:baseline` row with the
label in a `flex:1` span and the count after it, keeping the existing
`500 12px/1`, `--text-tertiary`, `margin: var(--space-5) 0 var(--space-3) 2px`. **Unlabelled groups
and groups with no count must render exactly as they do now.**

(Contrast `Sheet` in §5, whose title genuinely has no trailing slot and where the count moves into
the caption instead. The difference is that `Group`'s label is ours to change and `Sheet`'s title is
a governed component's.)

**Each row leads with the provider's 10px colour dot.**

- It is **recognition, never the differentiator.** Measured on `--surface-fill`, four of seven
  ordinary Google colours are under 3:1 in light — the yellow at **1.51:1**, then 2.31, 2.50 and
  2.75 — and two are under in dark, the purple at 2.23 and the grey at 2.54. They are not the same
  ones: a bright hue falls against #F2F2F2 and a dark one against #232323, so **no ground flatters a
  palette we do not control.**
- **Every swatch gets `inset 0 0 0 1px var(--border-hairline)`** so the pale ones keep an edge. That
  is definition, not contrast; it does not move the ratio and is not meant to.
- **Where two calendars share a name**, the row's note carries the account or the owner, the way a
  shared calendar already says "Shared by Tom Reilly". The name is what tells them apart.
- A calendar with no colour set leaves no hole: fall back to `--ink-300`.

**Two notes are load-bearing, not decoration.** `Read only` on a subscribed calendar, because
offload cannot add to it, and who shared it when somebody else did.

**Nothing in use is reachable and needs no block.** The group header reads `None in use` in place of
the count, in the same trailing slot.

## 3. Settings: the rest of the page, in order

1. The provider block: `<ProviderMark size={34} radius={8}/>`, `Google Calendar`, and
   `jo@hey.com, connected 4 Aug` in caption. **Pass both props explicitly** — the component defaults
   to the 88px hero, and 8px is a proportional scaling of its own 18 rather than a step on the
   radius scale, which is why it is given rather than left to be inferred.
2. `Calendars offload can use`, the list above, with its count.
3. `When offload adds something` → one row, `Ask before adding`, a `Switch`, with the note "Off
   means anything with a time on it lands straight on the calendar".
4. `Disconnect` → one row, `--text-danger` title, and the note below it.

**There is no "Add events to" row.** It was drawn and cut: where an event lands is a property of the
thing you are working on, so it belongs to the thread. Section 5.

**Disconnect says what it keeps, not only what it takes:**

> Threads keep what they already know. offload stops reading your days and cannot add to them.

That is the true part, and it is the part somebody hovering over that row is afraid of.

**Dark:** everything above is token-driven and inverts. The only fixed values on the page are the
provider swatches, and the two that measure worst in dark are the purple and the grey.

## 4. The thread control: a plain glyph, and no mark ever

**On the phones:** `calendar` in the app bar, **left of `share-2` and `ellipsis`**, as a third trailing
`IconButton`.

**On web it is not the same two.** `WThing` passes
`tools={[["maximize-2","Open full"],["ellipsis","More"]]}`, and share lives in the head's `aside`
inside `WFaces`, after the people. So the calendar glyph is a third tool **left of `maximize-2` and
`ellipsis`**, and it must not be put next to a share button that is not there.

**That third tool needed a standing rule amended, so do not treat it as a free slot.** `readme.md`
said a pane head carries two tools and that anything a thread gains later goes in the More menu. The
amended rule allows three **with a criterion: a tool earns a head slot only if it changes what
offload reads or shows; anything that acts on the thread goes in More.** A scope you cannot see is a
scope you forget, which is why calendars passes and rename, add note and Leave do not. **The next
capability does not get a fourth tool by precedent, it gets the same test.**

**It carries no badge and no count, in any state.**

- A dot and a bubble both mean attention in every app anyone has used, so a mark that means "you
  configured this" earns a tap that finds nothing wrong. **A control that punishes a tap is worse
  than a control that says less.**
- `IconButton` already has a `badge` prop — 8px, `--clay-600`, a 1.5px `--paper` ring — and its own
  comment says it means *something new*. A thread's calendar list is not news. **Do not pass
  `badge` to this button.**
- Section 5 also leaves nothing to mark: with no calendars in a thread by default there is no
  inheriting-versus-narrowed state to signal.

**The accessible name carries the state:** `Calendars, none in this thread`, or
`Calendars, 1 of 4 in this thread`.

**Bar geometry, since a third control changes the budget.** `AppBar` is `padding: 0
var(--gutter-screen)` with `gap: var(--space-4)`, each side group `gap: var(--space-2)` with
`marginLeft`/`marginRight: -8`, and `IconButton` md is a 40px visual in a 44px hit with a −2 margin.
The thread bar carries **no title**, so a third control is free there. On a bar that does carry a
title it takes the measure **from 226 to 182 of 390**, measured, which is the number to check the
longest thread name against.

**What sits under the bar is `Standing`, and it is a full block, not a name.** The thread's name at
`--text-title-1`, the people in it as `Chip`s, an outline **Share** chip beside them, offload's
standing sentence at 18px, and a `sparkles` caption — all inside `--space-7` over `--space-8`.

**That block already duplicates a bar control, which is the one real alternative to the bar.** A
chip in the standing row could say the state in words, "1 calendar", with no mark to misread. It is
not taken because **the row's subject is who is in the thread**: every chip in it is a person, and
Share earns its place as the one action that adds one, so a calendar chip there reads as a
participant. **If the state ever has to be visible without opening the sheet, that row is where to
put it, not a badge on the glyph.**

**The ellipsis keeps a `Calendars in this thread` row too**, so the control is reachable both ways.

## 5. A thread starts with no calendars and picks explicitly

**This is the model. Everything else follows from it.**

- **A new thread uses no calendar.** offload reads none of your days for it until somebody ticks
  one.
- **Approving a calendar in Settings adds it to no thread, ever.** Threads gain calendars when
  somebody says so.
- **Un-ticking a calendar in Settings removes it from every thread at once.** A thread's list is
  always intersected with the account's, so the thread's stored id simply stops resolving. Without
  that intersection a thread can hold a calendar the account no longer allows.

**Why not inherit-and-narrow**, which was the convenient model and was drawn: approving a calendar
at the account level would silently widen what offload reads in threads set up months ago, shared
ones included. **Explicit is the safer default when the thing being widened is other people's
days.** It also costs a hidden third state, inheriting, and a `Use all` control that exists only to
get back to it. Neither is needed now.

**The sheet is `Sheet` as governed**, and the mock had four things wrong before it was read:
`--radius-sheet` (24px, which `readme.md` already states as "24px on sheet tops"), a 36×4 handle
with `--space-6` under it, `padding: var(--space-5) var(--gutter-screen) var(--space-8)`, a 21px
semibold title with `--space-5` under it, and `--surface-scrim` behind it — **0.32, not the soft
scrim's 0.16.**

**`Sheet`'s title has no trailing slot, so the count does not go there.** The caption line under the
title carries the state.

| Thread state | The caption under the title |
| --- | --- |
| some ticked | `Which of your calendars offload reads when it works on Lisbon trip.` |
| none ticked | `offload is not reading any calendar for Lisbon trip. Tick the ones it should.` |

**No calendars is the commonest state in the product**, not an edge case, so it gets that sentence
rather than a footnote. **No empty illustration and no button:** the list is already on screen, so
the four rows are the call to action, and an empty state would be a screen telling you to use the
screen it is covering.

**On web it is a popover anchored to the glyph, not a modal**, because it is a scope and not a task,
and the pane behind it is what the scope is about. Same rows, same ticks.

## 6. Where an event lands

**No setting. The thread answers it, or offload asks.**

| Ticked in the thread | Where an event goes |
| --- | --- |
| one | that calendar, with nothing to ask |
| two or more | **offload asks in the conversation**, the thread's calendars as the values |
| none | nowhere — it stays a thing in the thread |

The asking uses the follow-up control from 018 as it stands: the thread's calendars as `value`
chips, the question as the group's accessible name, `Not that` as the way out. It is the case that
control was built for, and it means the answer arrives when it matters instead of being set in
advance and forgotten.

**Read-only calendars are never offered as an answer**, which is the last reason `Read only` earns
its place on the settings row.

**None ticked is not an error.** Anything with a time on it stays a thing in the thread, which is
what it would have been before a calendar was connected at all.

---

## Open, and worth a drawing rather than a guess

- **Whether offload remembers a thread's write target or asks every time.** My read is that it
  remembers, as a thread-level default the same sheet could show, but that is a new row in that
  sheet and it should be drawn before it is built.
- **Two accounts on the settings page.** One provider block each, with its own list and its own
  disconnect.
- **Android.** Expect the group to be a low container fill rather than `--surface-fill`, M3's own
  checkbox and switch, and a Material bottom sheet. Nothing above depends on an iOS-only idea.
- **A thread narrowed to nothing after having had calendars**, which is reachable by un-ticking and
  currently gets the same copy as a thread that never picked. Probably right; unverified.
